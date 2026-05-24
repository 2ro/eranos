import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

import {
  BITCOIN_DUST_LIMIT,
  estimateFee,
  type UTXO,
  validateBitcoinAddress,
} from '@/lib/bitcoin';
import {
  CHANGE_CHAIN,
  deriveAddress,
  deriveLeafPrivateKey,
  type HdAccount,
  HD_WALLET_NETWORK,
} from './derivation';
import {
  bip86TweakedPrivateKey,
  decodeSilentPaymentAddress,
  deriveSilentPaymentOutputs,
  isSilentPaymentAddress,
  type SilentPaymentInput as SpSenderInput,
  type SilentPaymentOutput as SpSenderOutput,
} from './sp/sender';
import {
  deriveSilentPaymentSpendKey,
  deriveSpUtxoSigningKey,
  deriveSpUtxoXOnly,
  signSpUtxoInput,
  spP2trScriptPubKey,
} from './sp/spend';
import { hexToBytes } from './sp/crypto';

// ---------------------------------------------------------------------------
// HD wallet transaction construction & signing
// ---------------------------------------------------------------------------
//
// A "spendable" input is either:
//
//   - A BIP-86 UTXO (`HdSpendableUtxo`) — a P2TR output we control via the
//     `m/86'/0'/0'/<chain>/<index>` HD hierarchy. Signing uses the
//     `signIdx` path with the per-leaf private key.
//
//   - A silent-payment UTXO (`HdSpendableSpUtxo`) — a P2TR output the
//     BIP-352 scanner discovered, keyed by a per-output tweak `t_k`. The
//     spending scalar is `b_spend + t_k`, and because the on-chain output
//     `P_k` is already a Taproot output key (no BIP-341 re-tweak), we sign
//     it manually with Schnorr and inject `tapKeySig` into the PSBT.
//
// The two kinds are kept distinct at the type level so the signer dispatches
// correctly, but the coin selector and fee model treat them uniformly —
// every spendable input has the same on-chain footprint (a single Taproot
// witness with a 64-byte Schnorr signature).
//
// Recipients are also polymorphic:
//
//   - A bare Bitcoin address (P2TR, P2WPKH, P2PKH, P2SH-P2WPKH, …).
//   - A silent-payment address (`sp1…` mainnet). Decoded locally, with the
//     receiver's per-transaction P2TR output derived from the chosen input
//     set's tweaked private keys via {@link deriveSilentPaymentOutputs}.
//
// Change always goes to a fresh address on the internal (change) chain of
// the BIP-86 hierarchy — silent-payment change is intentionally not
// supported (it would require labelled SP addresses and a separate scan
// loop on the receive side; the wallet is receive-only for SP today
// modulo this spend flow).
// ---------------------------------------------------------------------------

/** A BIP-86 UTXO owned by the HD wallet, annotated with derivation info. */
export interface HdSpendableUtxo extends UTXO {
  /** The Bitcoin address the UTXO belongs to. */
  address: string;
  /** Chain index (0 = receive, 1 = change). */
  chain: 0 | 1;
  /** Address index within the chain. */
  index: number;
}

/**
 * A silent-payment UTXO owned by the HD wallet.
 *
 * Discovered by the BIP-352 scanner (`useHdWalletSp` + `scanBatch`) and
 * persisted with the per-output BIP-352 tweak `t_k`. Spending requires
 * `b_spend` (derived from nsec) plus `t_k` — both must be present at
 * signing time.
 */
export interface HdSpendableSpUtxo {
  txid: string;
  vout: number;
  /** Value in satoshis. */
  value: number;
  /** 32-byte BIP-352 tweak `t_k`, hex-encoded (matches the persisted form). */
  tweakHex: string;
  /** Per-tx output index within the SP output set (`k = 0, 1, …`). */
  k: number;
  /** Block height the UTXO was mined at (>= 1; SP UTXOs are always confirmed). */
  height: number;
}

/** Unified input kind for SP-aware build / sign. */
export type HdInput =
  | { kind: 'bip86'; utxo: HdSpendableUtxo }
  | { kind: 'sp'; utxo: HdSpendableSpUtxo };

/** Helper: total satoshi value of a mixed input list. */
function inputValue(input: HdInput): number {
  return input.kind === 'bip86' ? input.utxo.value : input.utxo.value;
}

/** Helper: confirmed/pending flag. SP UTXOs are always confirmed. */
function inputConfirmed(input: HdInput): boolean {
  return input.kind === 'bip86' ? input.utxo.status.confirmed : true;
}

/** Stable identifier for de-duplication. */
function inputId(input: HdInput): string {
  return input.kind === 'bip86'
    ? `bip86:${input.utxo.txid}:${input.utxo.vout}`
    : `sp:${input.utxo.txid}:${input.utxo.vout}`;
}

/** Recipient parsing result. */
type HdRecipient =
  | { kind: 'address'; address: string }
  | { kind: 'sp'; spAddress: string };

/** Result of building an unsigned PSBT for the HD wallet. */
interface HdUnsignedPsbt {
  /** Hex-encoded unsigned PSBT. */
  psbtHex: string;
  /** Network fee in satoshis. */
  fee: number;
  /** Whether a change output was added. */
  hasChange: boolean;
  /** Address used for change (if any). */
  changeAddress?: string;
  /**
   * Per-input descriptor. Aligned 1:1 with the PSBT's inputs in order.
   * `signHdPsbt` uses this to derive the right signing key per input.
   */
  inputDescriptors: HdInputDescriptor[];
  /**
   * Resolved recipient address (the P2TR address actually written to the
   * transaction). For silent-payment sends this is the derived per-tx
   * `P_k`, which differs from the original `sp1…` string the user typed.
   */
  resolvedRecipientAddress: string;
  /**
   * The silent-payment UTXOs (by `(txid, vout)`) actually consumed by this
   * PSBT, in input order. Empty when the build selected no SP inputs. The
   * caller uses this to prune the spent UTXOs from local SP storage after
   * a successful broadcast — Blockbook's xpub scan can't observe SP
   * outputs, so the wallet has to do this bookkeeping itself, otherwise
   * the balance would still count them.
   */
  consumedSpUtxos: Array<{ txid: string; vout: number }>;
}

/** Per-input descriptor stored alongside the PSBT for signing dispatch. */
type HdInputDescriptor =
  | { kind: 'bip86'; chain: 0 | 1; index: number }
  | { kind: 'sp'; tweakHex: string };

// ---------------------------------------------------------------------------
// Back-compat re-exports
// ---------------------------------------------------------------------------
//
// The dialog and older callers reference `inputDerivations`. We keep the
// shape working for pure-BIP86 builds and surface the richer descriptor
// list as the canonical field.

/** @deprecated Use {@link HdInputDescriptor} via `inputDescriptors`. */
type HdInputDerivation = { chain: 0 | 1; index: number };

// ---------------------------------------------------------------------------
// PSBT hex helpers (private)
// ---------------------------------------------------------------------------

function txToPsbtHex(tx: btc.Transaction): string {
  return hex.encode(tx.toPSBT());
}

function psbtFromHex(psbtHex: string): btc.Transaction {
  return btc.Transaction.fromPSBT(hex.decode(psbtHex));
}

// ---------------------------------------------------------------------------
// Coin selection
// ---------------------------------------------------------------------------

/**
 * Largest-first coin selector that mixes BIP-86 and SP UTXOs.
 *
 *  - Prefers confirmed UTXOs over unconfirmed.
 *  - Within each group, prefers larger values first (avoids signalling
 *    "consolidating dust" to chain analysis).
 *  - Returns the smallest set that covers `target + fee`, or `null` when
 *    the balance is insufficient.
 *
 * The fee model treats every Taproot input the same (~57.5 vB), which is
 * accurate for both BIP-86 and SP — each contributes one 64-byte Schnorr
 * key-path witness.
 */
function selectInputs(
  inputs: readonly HdInput[],
  target: number,
  feeRate: number,
): { selected: HdInput[]; total: number } | null {
  const sorted = [...inputs].sort((a, b) => {
    const aConf = inputConfirmed(a);
    const bConf = inputConfirmed(b);
    if (aConf !== bConf) return aConf ? -1 : 1;
    return inputValue(b) - inputValue(a);
  });

  const selected: HdInput[] = [];
  let total = 0;

  for (const input of sorted) {
    selected.push(input);
    total += inputValue(input);

    const feeWithChange = estimateFee(selected.length, 2, feeRate);
    if (total >= target + feeWithChange) return { selected, total };

    const feeNoChange = estimateFee(selected.length, 1, feeRate);
    if (total >= target + feeNoChange) return { selected, total };
  }

  return null;
}

// Legacy BIP-86-only path: lift `HdSpendableUtxo` into `HdInput` and reuse
// the unified selector so the fee preview matches what `buildHdUnsignedPsbt`
// will actually emit.
function liftBip86(utxos: readonly HdSpendableUtxo[]): HdInput[] {
  return utxos.map((utxo) => ({ kind: 'bip86', utxo }));
}

/**
 * Estimate the fee for a hypothetical spend without building a PSBT.
 *
 * Accepts a mix of BIP-86 and SP UTXOs (callers that have only BIP-86
 * UTXOs can pass a plain `HdSpendableUtxo[]` and it'll be lifted).
 *
 * Returns `0` when:
 *   - `target` is non-positive,
 *   - the fee rate is non-positive,
 *   - the wallet is empty, or
 *   - the balance is insufficient to cover `target + fee` (the caller
 *     should branch on `insufficient` separately and not surface a fee).
 */
export function previewHdFee(
  inputs: readonly HdSpendableUtxo[] | readonly HdInput[],
  target: number,
  feeRate: number,
): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(feeRate) || feeRate <= 0) return 0;
  if (!inputs.length) return 0;

  const lifted = isHdInputArray(inputs) ? (inputs as readonly HdInput[]) : liftBip86(inputs as readonly HdSpendableUtxo[]);

  const selection = selectInputs(lifted, target, feeRate);
  if (!selection) return 0;

  const { selected, total } = selection;
  const feeWithChange = estimateFee(selected.length, 2, feeRate);
  const changeIfKept = total - target - feeWithChange;
  const numOutputs = changeIfKept >= BITCOIN_DUST_LIMIT ? 2 : 1;
  return estimateFee(selected.length, numOutputs, feeRate);
}

function isHdInputArray(
  arr: readonly HdSpendableUtxo[] | readonly HdInput[],
): boolean {
  if (arr.length === 0) return false;
  const first = arr[0] as unknown as { kind?: unknown };
  return first && typeof first === 'object' && 'kind' in first;
}

// ---------------------------------------------------------------------------
// Recipient parsing
// ---------------------------------------------------------------------------

/**
 * Classify a recipient string as either a Bitcoin address or a silent-
 * payment address. Returns `null` when the string is neither.
 *
 * Mainnet only (silent-payment `tsp1…` testnet addresses are rejected to
 * match the wallet's mainnet-only stance).
 */
export function parseHdRecipient(input: string): HdRecipient | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (validateBitcoinAddress(trimmed)) {
    return { kind: 'address', address: trimmed };
  }
  if (isSilentPaymentAddress(trimmed)) {
    try {
      const decoded = decodeSilentPaymentAddress(trimmed);
      if (decoded.network !== 'mainnet') return null;
      if (decoded.version !== 0) return null;
      return { kind: 'sp', spAddress: trimmed };
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// PSBT build (legacy BIP-86 path — backwards compatible)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PSBT build (SP-aware)
// ---------------------------------------------------------------------------

/** Arguments accepted by {@link buildHdSpendPsbt}. */
interface BuildHdSpendArgs {
  /** HD account — used for change derivation and (for BIP-86 inputs) re-derivation of internal pubkeys. */
  account: HdAccount;
  /**
   * Candidate inputs to spend. Mix of BIP-86 UTXOs and SP UTXOs is supported;
   * the coin selector picks the minimum-cost set that covers `amount + fee`.
   */
  inputs: readonly HdInput[];
  /** Where to send. */
  recipient: HdRecipient;
  /** Amount in satoshis (must be >= dust limit). */
  amountSats: number;
  /** Fee rate in sat/vB. */
  feeRate: number;
  /** Next unused index on the BIP-86 change chain. */
  nextChangeIndex: number;
  /**
   * For SP-related operations ONLY: the 64-byte BIP-32 seed (the BIP-39
   * PBKDF2 output the rest of the HD wallet derives from). Required to
   * compute `b_spend` for spending SP inputs, and to compute the
   * per-recipient `P_k` for SP recipients (BIP-352 binds the output to
   * the tweaked Taproot scalar of every input).
   *
   * The buffer is read inside this function and never persisted; callers
   * should zero it after the call.
   */
  seed?: Uint8Array;
}

/**
 * Build an unsigned PSBT for an SP-aware HD wallet spend.
 *
 * Handles all four matrix cells:
 *
 *   - BIP-86 inputs   →  bare-address recipient   (legacy path)
 *   - BIP-86 inputs   →  silent-payment recipient (BIP-352 sender)
 *   - SP inputs       →  bare-address recipient
 *   - SP inputs       →  silent-payment recipient
 *
 * For SP recipients the per-recipient `P_k` is derived locally using the
 * tweaked private keys of every selected input. The result is a regular
 * P2TR output written into the PSBT; broadcast sees a normal Taproot
 * transaction (the silent-payment ECDH happens off-chain).
 *
 * For SP inputs the output script (`OP_1 push32 x_only(P_k)`) is
 * re-derived locally from the stored `t_k` tweak — Blockbook doesn't
 * return it directly for SP UTXOs, and we don't want to trust an indexer
 * for it anyway.
 */
export function buildHdSpendPsbt(args: BuildHdSpendArgs): HdUnsignedPsbt {
  const { account, inputs, recipient, amountSats, feeRate, nextChangeIndex, seed } = args;

  if (!Number.isInteger(amountSats) || amountSats < BITCOIN_DUST_LIMIT) {
    throw new Error(`Amount must be at least ${BITCOIN_DUST_LIMIT} sats.`);
  }
  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error('Fee rate must be positive.');
  }
  if (recipient.kind === 'address' && !validateBitcoinAddress(recipient.address)) {
    throw new Error(`Invalid Bitcoin address: ${recipient.address}`);
  }

  // ── Deduplicate inputs by (kind, txid, vout) ─────────────────
  const seen = new Set<string>();
  const dedup: HdInput[] = [];
  for (const i of inputs) {
    const id = inputId(i);
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(i);
  }

  // ── Coin selection ───────────────────────────────────────────
  const selection = selectInputs(dedup, amountSats, feeRate);
  if (!selection) {
    const total = dedup.reduce((s, i) => s + inputValue(i), 0);
    throw new Error(
      `Insufficient funds. Need at least ${amountSats.toLocaleString()} sats + fees, ` +
        `have ${total.toLocaleString()} sats spendable.`,
    );
  }
  const { selected, total: totalInput } = selection;

  // ── Fee + change ─────────────────────────────────────────────
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

  const tx = new btc.Transaction();
  const inputDescriptors: HdInputDescriptor[] = [];
  const consumedSpUtxos: Array<{ txid: string; vout: number }> = [];

  // For SP recipients we need each input's tweaked private key to derive
  // the per-recipient output P_k. Compute and stash them up front so we
  // can wipe the array at the end.
  const spSenderInputs: SpSenderInput[] = [];
  const wipeAfterBuild: Uint8Array[] = [];
  const needsSpend = selected.some((i) => i.kind === 'sp');
  if (needsSpend && !seed) {
    throw new Error('SP UTXOs selected but seed was not provided.');
  }
  const bSpend = needsSpend && seed
    ? deriveSilentPaymentSpendKey(seed)
    : undefined;
  if (bSpend) wipeAfterBuild.push(bSpend);

  // ── Build inputs ─────────────────────────────────────────────
  for (const input of selected) {
    if (input.kind === 'bip86') {
      const utxo = input.utxo;
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
      const internalPubkey = hex.decode(derived.internalPubkeyHex);
      const payment = btc.p2tr(internalPubkey, undefined, HD_WALLET_NETWORK);

      tx.addInput({
        txid: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script: payment.script, amount: BigInt(utxo.value) },
        tapInternalKey: internalPubkey,
      });
      inputDescriptors.push({ kind: 'bip86', chain: utxo.chain, index: utxo.index });

      if (recipient.kind === 'sp') {
        // BIP-352 sender needs the BIP-341 *tweaked* private key for every
        // taproot input. Derive it here so the build is self-contained.
        const leaf = deriveLeafPrivateKey(account, utxo.chain, utxo.index);
        const tweaked = bip86TweakedPrivateKey(leaf);
        leaf.fill(0);
        wipeAfterBuild.push(tweaked);
        spSenderInputs.push({
          txid: utxo.txid,
          vout: utxo.vout,
          privateKey: tweaked,
          isTaproot: true,
        });
      }
    } else {
      // SP input
      const utxo = input.utxo;
      if (!bSpend) {
        throw new Error('SP input requires seed for spending');
      }
      const tweak = hexToBytes(utxo.tweakHex);
      const xonly = deriveSpUtxoXOnly(bSpend, tweak);
      const script = spP2trScriptPubKey(xonly);
      tx.addInput({
        txid: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script, amount: BigInt(utxo.value) },
        // We deliberately do NOT set `tapInternalKey` for SP inputs:
        // `signIdx` would unconditionally re-tweak with TapTweak. The SP
        // signer in `signHdPsbt` writes `tapKeySig` directly instead.
      });
      inputDescriptors.push({ kind: 'sp', tweakHex: utxo.tweakHex });
      consumedSpUtxos.push({ txid: utxo.txid, vout: utxo.vout });

      if (recipient.kind === 'sp') {
        // d_k is also the BIP-352 input scalar — it's already the actual
        // signing scalar for the on-chain P_k output, with no further
        // BIP-341 tweak to apply. Pass `isTaproot: false` so the sender
        // module doesn't re-apply odd-Y negation (which would invert d_k).
        const dk = deriveSpUtxoSigningKey(bSpend, tweak);
        wipeAfterBuild.push(dk);
        spSenderInputs.push({
          txid: utxo.txid,
          vout: utxo.vout,
          privateKey: dk,
          isTaproot: false,
        });
      }
    }
  }

  // ── Build recipient output ───────────────────────────────────
  let resolvedRecipientAddress: string;
  if (recipient.kind === 'address') {
    resolvedRecipientAddress = recipient.address;
    tx.addOutputAddress(recipient.address, BigInt(amountSats), HD_WALLET_NETWORK);
  } else {
    if (spSenderInputs.length === 0) {
      throw new Error('Silent-payment send needs at least one input.');
    }
    const outputs = deriveSilentPaymentOutputs(
      spSenderInputs,
      [{ address: decodeSilentPaymentAddress(recipient.spAddress), raw: recipient.spAddress }],
      { network: 'mainnet' },
    );
    if (outputs.length !== 1) {
      throw new Error('Silent-payment derivation returned unexpected number of outputs.');
    }
    const out: SpSenderOutput = outputs[0];
    resolvedRecipientAddress = out.address;
    tx.addOutputAddress(out.address, BigInt(amountSats), HD_WALLET_NETWORK);
  }

  // ── Optional change ──────────────────────────────────────────
  let changeAddress: string | undefined;
  if (hasChange) {
    const changeDerived = deriveAddress(account.changeNode, CHANGE_CHAIN, nextChangeIndex);
    changeAddress = changeDerived.address;
    tx.addOutputAddress(changeAddress, BigInt(change), HD_WALLET_NETWORK);
  }

  // Best-effort wipe of the tweaked-key array.
  for (const buf of wipeAfterBuild) buf.fill(0);

  return {
    psbtHex: txToPsbtHex(tx),
    fee,
    hasChange,
    changeAddress,
    inputDescriptors,
    resolvedRecipientAddress,
    consumedSpUtxos,
  };
}

// ---------------------------------------------------------------------------
// PSBT signing
// ---------------------------------------------------------------------------

/**
 * Sign every input in a PSBT using its corresponding HD-derived key.
 *
 * For BIP-86 inputs: derives the leaf key from `(chain, index)` and uses
 * `signIdx`, which applies the BIP-341 TapTweak before producing a Schnorr
 * key-path signature.
 *
 * For SP inputs: computes `d_k = b_spend + t_k`, hand-signs the input via
 * BIP-340 Schnorr (no TapTweak, since `P_k` is already the output key on
 * chain), and writes the result directly into `tapKeySig`.
 *
 * `inputDescriptors` MUST be aligned 1:1 with the PSBT's inputs in order.
 * `buildHdSpendPsbt` (and the legacy `buildHdUnsignedPsbt`) return them in
 * the right order.
 */
export function signHdPsbt(
  psbtHex: string,
  inputDescriptors: ReadonlyArray<HdInputDescriptor | HdInputDerivation>,
  account: HdAccount,
  seed?: Uint8Array,
): string {
  const tx = psbtFromHex(psbtHex);

  if (tx.inputsLength !== inputDescriptors.length) {
    throw new Error(
      `PSBT input count (${tx.inputsLength}) does not match descriptors length (${inputDescriptors.length}).`,
    );
  }

  // Promote legacy `{chain, index}` entries to the discriminated union.
  const normalised: HdInputDescriptor[] = inputDescriptors.map((d) => {
    if ('kind' in d) return d;
    return { kind: 'bip86', chain: d.chain, index: d.index };
  });

  const hasSp = normalised.some((d) => d.kind === 'sp');
  if (hasSp && !seed) {
    throw new Error('Signing SP inputs requires seed.');
  }
  const bSpend = hasSp && seed ? deriveSilentPaymentSpendKey(seed) : undefined;

  // For SP inputs we need every prevout's `script` + `amount` to compute
  // the BIP-341 sighash. Pull them from the PSBT inputs' witnessUtxo.
  const prevOutScripts: Uint8Array[] = [];
  const prevOutAmounts: bigint[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    if (!inp.witnessUtxo) {
      throw new Error(`PSBT input ${i} missing witnessUtxo`);
    }
    prevOutScripts.push(inp.witnessUtxo.script);
    prevOutAmounts.push(inp.witnessUtxo.amount);
  }

  try {
    for (let i = 0; i < tx.inputsLength; i++) {
      const desc = normalised[i];
      if (desc.kind === 'bip86') {
        const privKey = deriveLeafPrivateKey(account, desc.chain, desc.index);
        try {
          tx.signIdx(privKey, i);
        } finally {
          privKey.fill(0);
        }
      } else {
        if (!bSpend) {
          throw new Error('SP input encountered without b_spend (unreachable).');
        }
        const tweak = hexToBytes(desc.tweakHex);
        const dk = deriveSpUtxoSigningKey(bSpend, tweak);
        try {
          signSpUtxoInput(tx, i, dk, prevOutScripts, prevOutAmounts);
        } finally {
          dk.fill(0);
        }
      }
    }
  } finally {
    if (bSpend) bSpend.fill(0);
  }

  return txToPsbtHex(tx);
}

/**
 * Finalise a signed PSBT and extract the raw transaction hex.
 */
export function finalizeHdPsbt(psbtHex: string): string {
  const tx = psbtFromHex(psbtHex);
  tx.finalize();
  return hex.encode(tx.extract());
}

// ---------------------------------------------------------------------------
// Max-sendable
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sweep — drain every input into one output
// ---------------------------------------------------------------------------

/** Arguments accepted by {@link buildHdSweepPsbt}. */
export interface BuildHdSweepArgs {
  /** Account whose keys can sign all `inputs` (used for `bip86` derivation). */
  account: HdAccount;
  /**
   * Every UTXO the wallet should drain. Both BIP-86 and SP inputs are
   * supported; coin selection is bypassed — *all* inputs are consumed.
   */
  inputs: readonly HdInput[];
  /** Destination address (bech32 / bech32m). Receives `total - fee` sats. */
  destination: string;
  /** Fee rate in sat/vB. */
  feeRate: number;
  /**
   * Optional 64-byte BIP-32 seed for the *sweep source*. Required iff any
   * input is `kind: 'sp'`, because spending v1 SP UTXOs needs `b_spend`
   * derived from the source wallet's seed.
   */
  seed?: Uint8Array;
}

/** Result of {@link buildHdSweepPsbt}. */
export interface HdSweepPsbt {
  /** Hex-encoded unsigned PSBT, ready for `signHdPsbt`. */
  psbtHex: string;
  /** Network fee in satoshis. */
  fee: number;
  /** Sats actually sent to `destination` after subtracting fee. */
  amountSats: number;
  /** Total sats across all consumed inputs (sanity-check field). */
  totalInput: number;
  /** Per-input descriptor, aligned 1:1 with PSBT inputs. */
  inputDescriptors: HdInputDescriptor[];
  /** SP UTXOs consumed by this sweep, for post-broadcast bookkeeping. */
  consumedSpUtxos: Array<{ txid: string; vout: number }>;
}

/**
 * Build a single-output PSBT that drains every supplied input into one
 * destination address. There is no coin selection (callers pass exactly
 * what they want consumed), no change (every input is fully spent), and
 * no recipient-side silent-payment math (the destination is always a
 * plain bech32(m) address — typically a v2 BIP-86 receive address fed in
 * by the migration page).
 *
 * Throws if:
 *   - `inputs` is empty.
 *   - `destination` doesn't validate as a Bitcoin address.
 *   - the total input value is less than `fee + BITCOIN_DUST_LIMIT` (the
 *     sweep wouldn't produce a non-dust output).
 *   - any `sp` input is present but `seed` was omitted.
 */
export function buildHdSweepPsbt(args: BuildHdSweepArgs): HdSweepPsbt {
  const { account, inputs, destination, feeRate, seed } = args;

  if (!inputs.length) throw new Error('Sweep requires at least one input.');
  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error('Fee rate must be positive.');
  }
  if (!validateBitcoinAddress(destination)) {
    throw new Error(`Invalid destination address: ${destination}`);
  }

  // Deduplicate by `(kind, txid, vout)` so an accidentally-duplicated input
  // list doesn't double-spend.
  const seen = new Set<string>();
  const dedup: HdInput[] = [];
  for (const i of inputs) {
    const id = inputId(i);
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(i);
  }

  const totalInput = dedup.reduce((s, i) => s + inputValue(i), 0);
  const fee = estimateFee(dedup.length, 1, feeRate);
  const amountSats = totalInput - fee;
  if (amountSats < BITCOIN_DUST_LIMIT) {
    throw new Error(
      `Sweep amount (${amountSats}) below dust limit after fee. ` +
        `Total: ${totalInput}, fee: ${fee}.`,
    );
  }

  const hasSp = dedup.some((i) => i.kind === 'sp');
  if (hasSp && !seed) {
    throw new Error('Sweep with SP inputs requires the source wallet seed.');
  }
  const bSpend = hasSp && seed ? deriveSilentPaymentSpendKey(seed) : undefined;

  try {
    const tx = new btc.Transaction();
    const inputDescriptors: HdInputDescriptor[] = [];
    const consumedSpUtxos: Array<{ txid: string; vout: number }> = [];

    for (const input of dedup) {
      if (input.kind === 'bip86') {
        const utxo = input.utxo;
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
        const internalPubkey = hex.decode(derived.internalPubkeyHex);
        const payment = btc.p2tr(internalPubkey, undefined, HD_WALLET_NETWORK);
        tx.addInput({
          txid: utxo.txid,
          index: utxo.vout,
          witnessUtxo: { script: payment.script, amount: BigInt(utxo.value) },
          tapInternalKey: internalPubkey,
        });
        inputDescriptors.push({ kind: 'bip86', chain: utxo.chain, index: utxo.index });
      } else {
        // SP input
        if (!bSpend) {
          throw new Error('SP input requires b_spend (unreachable).');
        }
        const utxo = input.utxo;
        const tweak = hexToBytes(utxo.tweakHex);
        const xonly = deriveSpUtxoXOnly(bSpend, tweak);
        const script = spP2trScriptPubKey(xonly);
        tx.addInput({
          txid: utxo.txid,
          index: utxo.vout,
          witnessUtxo: { script, amount: BigInt(utxo.value) },
        });
        inputDescriptors.push({ kind: 'sp', tweakHex: utxo.tweakHex });
        consumedSpUtxos.push({ txid: utxo.txid, vout: utxo.vout });
      }
    }

    tx.addOutputAddress(destination, BigInt(amountSats), HD_WALLET_NETWORK);

    return {
      psbtHex: txToPsbtHex(tx),
      fee,
      amountSats,
      totalInput,
      inputDescriptors,
      consumedSpUtxos,
    };
  } finally {
    if (bSpend) bSpend.fill(0);
  }
}

