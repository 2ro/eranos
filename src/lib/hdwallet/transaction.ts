import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import {
  BITCOIN_DUST_LIMIT,
  estimateFee,
  type UTXO,
  validateBitcoinAddress,
} from '@/lib/bitcoin';
import {
  CHANGE_CHAIN,
  deriveAddress,
  deriveLeafTaprootSigner,
  type HdAccount,
  HD_WALLET_NETWORK,
} from './derivation';

// ---------------------------------------------------------------------------
// HD wallet transaction construction & signing
// ---------------------------------------------------------------------------
//
// A "spendable" UTXO is one of our own UTXOs together with the (chain, index)
// pair that derived its address. We need both to:
//
//   1. Set `tapInternalKey` on the PSBT input correctly per BIP-371.
//   2. Reconstruct the BIP-341 tweaked private key when signing.
//
// Change always goes to a fresh address on the internal (change) chain —
// never to a receive-chain address — to keep the on-chain heuristic
// "change-from-same-owner is the smaller output on the change chain" intact.
// ---------------------------------------------------------------------------

/** A UTXO owned by the HD wallet, annotated with derivation info. */
export interface HdSpendableUtxo extends UTXO {
  /** The Bitcoin address the UTXO belongs to. */
  address: string;
  /** Chain index (0 = receive, 1 = change). */
  chain: 0 | 1;
  /** Address index within the chain. */
  index: number;
}

/** Result of building an unsigned PSBT for the HD wallet. */
export interface HdUnsignedPsbt {
  /** Hex-encoded unsigned PSBT. */
  psbtHex: string;
  /** Network fee in satoshis. */
  fee: number;
  /** Whether a change output was added. */
  hasChange: boolean;
  /** Address used for change (if any). */
  changeAddress?: string;
  /** Per-input (chain, index) so signing knows which key to derive. */
  inputDerivations: Array<{ chain: 0 | 1; index: number }>;
}

// ---------------------------------------------------------------------------
// Coin selection
// ---------------------------------------------------------------------------

/**
 * Branch-and-bound is overkill here. A "largest-first" coin selector is fine
 * for a wallet whose UTXO set is bounded by gap-limit scanning:
 *
 *  - Picks the smallest set of inputs that covers `target + fee`.
 *  - Prefers confirmed UTXOs over unconfirmed.
 *  - Returns the candidate set OR `null` if balance is insufficient.
 *
 * This deliberately avoids the privacy pitfall of the "smallest first"
 * heuristic (which signals "I am consolidating dust" to chain analysis).
 */
function selectUtxos(
  utxos: readonly HdSpendableUtxo[],
  target: number,
  feeRate: number,
): { selected: HdSpendableUtxo[]; total: number } | null {
  // Confirmed first, then largest first within each group.
  const sorted = [...utxos].sort((a, b) => {
    if (a.status.confirmed !== b.status.confirmed) return a.status.confirmed ? -1 : 1;
    return b.value - a.value;
  });

  const selected: HdSpendableUtxo[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;

    // Fee for current set, assuming 2 outputs (recipient + change). If we
    // can cover target+fee even without change, we'll get a chance to drop
    // the change output below.
    const feeWithChange = estimateFee(selected.length, 2, feeRate);
    if (total >= target + feeWithChange) return { selected, total };

    const feeNoChange = estimateFee(selected.length, 1, feeRate);
    if (total >= target + feeNoChange) return { selected, total };
  }

  return null;
}

// ---------------------------------------------------------------------------
// PSBT build
// ---------------------------------------------------------------------------

/**
 * Build an unsigned P2TR PSBT for the HD wallet.
 *
 * Inputs are chosen by `selectUtxos`. Change (if any) goes to a fresh address
 * on the internal chain, derived at `account.changeNode / nextChangeIndex`.
 *
 * @param account             HD account (used to derive change address & re-derive input keys).
 * @param ownedUtxos          Candidate UTXOs to spend (must include `chain`/`index`).
 * @param toAddress           Recipient Bitcoin address.
 * @param amountSats          Amount to send in satoshis (must be >= dust limit).
 * @param feeRate             Fee rate in sat/vB.
 * @param nextChangeIndex     The next unused index on the change chain.
 */
export function buildHdUnsignedPsbt(
  account: HdAccount,
  ownedUtxos: readonly HdSpendableUtxo[],
  toAddress: string,
  amountSats: number,
  feeRate: number,
  nextChangeIndex: number,
): HdUnsignedPsbt {
  if (!validateBitcoinAddress(toAddress)) {
    throw new Error(`Invalid Bitcoin address: ${toAddress}`);
  }
  if (!Number.isInteger(amountSats) || amountSats < BITCOIN_DUST_LIMIT) {
    throw new Error(`Amount must be at least ${BITCOIN_DUST_LIMIT} sats.`);
  }
  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error('Fee rate must be positive.');
  }

  const selection = selectUtxos(ownedUtxos, amountSats, feeRate);
  if (!selection) {
    const total = ownedUtxos.reduce((s, u) => s + u.value, 0);
    throw new Error(
      `Insufficient funds. Need at least ${amountSats.toLocaleString()} sats + fees, ` +
        `have ${total.toLocaleString()} sats spendable.`,
    );
  }
  const { selected, total: totalInput } = selection;

  // Recompute fee for the final selected set.
  const feeWithChange = estimateFee(selected.length, 2, feeRate);
  const changeIfKept = totalInput - amountSats - feeWithChange;
  const hasChange = changeIfKept >= BITCOIN_DUST_LIMIT;
  const numOutputs = hasChange ? 2 : 1;
  const fee = estimateFee(selected.length, numOutputs, feeRate);
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(amountSats + fee).toLocaleString()} sats, ` +
        `have ${totalInput.toLocaleString()} sats.`,
    );
  }

  bitcoin.initEccLib(ecc);
  const psbt = new bitcoin.Psbt({ network: HD_WALLET_NETWORK });
  const inputDerivations: HdUnsignedPsbt['inputDerivations'] = [];

  for (const utxo of selected) {
    // Re-derive the input's internal key from the account hierarchy. We do
    // not trust the address string for this — the chain/index pair is the
    // single source of truth.
    const derived = deriveAddress(
      utxo.chain === CHANGE_CHAIN ? account.changeNode : account.receiveNode,
      utxo.chain,
      utxo.index,
    );
    if (derived.address !== utxo.address) {
      throw new Error(
        `UTXO address mismatch at ${utxo.chain}/${utxo.index}: ` +
          `expected ${derived.address}, got ${utxo.address}`,
      );
    }
    const internalPubkey = Buffer.from(derived.internalPubkeyHex, 'hex');

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2tr({
          internalPubkey,
          network: HD_WALLET_NETWORK,
        }).output!,
        value: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    inputDerivations.push({ chain: utxo.chain, index: utxo.index });
  }

  psbt.addOutput({ address: toAddress, value: BigInt(amountSats) });

  let changeAddress: string | undefined;
  if (hasChange) {
    const changeDerived = deriveAddress(account.changeNode, CHANGE_CHAIN, nextChangeIndex);
    changeAddress = changeDerived.address;
    psbt.addOutput({ address: changeAddress, value: BigInt(change) });
  }

  return {
    psbtHex: psbt.toHex(),
    fee,
    hasChange,
    changeAddress,
    inputDerivations,
  };
}

// ---------------------------------------------------------------------------
// PSBT signing
// ---------------------------------------------------------------------------

/**
 * Sign every input in a PSBT using its corresponding HD-derived tweaked key.
 *
 * `inputDerivations` MUST be aligned 1:1 with the PSBT's inputs in order.
 * (`buildHdUnsignedPsbt` returns them in the right order.)
 *
 * @returns Hex-encoded signed (but not finalised) PSBT.
 */
export function signHdPsbt(
  psbtHex: string,
  inputDerivations: ReadonlyArray<{ chain: 0 | 1; index: number }>,
  account: HdAccount,
): string {
  bitcoin.initEccLib(ecc);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: HD_WALLET_NETWORK });

  if (psbt.inputCount !== inputDerivations.length) {
    throw new Error(
      `PSBT input count (${psbt.inputCount}) does not match derivations ` +
        `length (${inputDerivations.length}).`,
    );
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    const { chain, index } = inputDerivations[i];
    const tweakedSigner = deriveLeafTaprootSigner(account, chain, index);
    psbt.signInput(i, tweakedSigner);
  }

  return psbt.toHex();
}

/**
 * Finalise a signed PSBT and extract the raw transaction hex.
 */
export function finalizeHdPsbt(psbtHex: string): string {
  bitcoin.initEccLib(ecc);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: HD_WALLET_NETWORK });
  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
}

/**
 * Convenience: build → sign → finalise in one call.
 */
export function createHdTransaction(
  account: HdAccount,
  ownedUtxos: readonly HdSpendableUtxo[],
  toAddress: string,
  amountSats: number,
  feeRate: number,
  nextChangeIndex: number,
): { txHex: string; fee: number; hasChange: boolean; changeAddress?: string } {
  const built = buildHdUnsignedPsbt(account, ownedUtxos, toAddress, amountSats, feeRate, nextChangeIndex);
  const signed = signHdPsbt(built.psbtHex, built.inputDerivations, account);
  const txHex = finalizeHdPsbt(signed);
  return { txHex, fee: built.fee, hasChange: built.hasChange, changeAddress: built.changeAddress };
}

// ---------------------------------------------------------------------------
// Max-sendable
// ---------------------------------------------------------------------------

/**
 * Compute the maximum amount sendable to a single recipient if every owned
 * UTXO is consumed and no change is produced.
 */
export function maxHdSendable(utxos: readonly HdSpendableUtxo[], feeRate: number): number {
  const total = utxos.reduce((s, u) => s + u.value, 0);
  const fee = estimateFee(utxos.length, 1, feeRate);
  return Math.max(0, total - fee);
}
