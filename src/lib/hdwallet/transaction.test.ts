import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

import {
  buildHdMaxSpendPsbt,
  buildHdSpendPsbt,
  type HdInput,
  type HdSpendableSpUtxo,
  type HdSpendableUtxo,
} from './transaction';
import {
  deriveAccountFromSeed,
  deriveAddress,
  deriveReceiveAddress,
  deriveSilentPaymentAddress,
  type HdAccount,
  HD_WALLET_NETWORK,
} from './derivation';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
//
// A deterministic 64-byte seed. The exact value doesn't matter — we only need
// reproducible BIP-86 + SP derivations to build spendable inputs against.

function makeSeed(fill = 7): Uint8Array {
  const seed = new Uint8Array(64);
  for (let i = 0; i < seed.length; i++) seed[i] = (i * 31 + fill) & 0xff;
  return seed;
}

const DUMMY_TXID = '1'.repeat(64);
const DUMMY_TXID_2 = '2'.repeat(64);

/** Build a BIP-86 (public) UTXO at receive index 0 worth `value` sats. */
function makeBip86Utxo(account: HdAccount, value: number): HdSpendableUtxo {
  const addr = deriveReceiveAddress(account, 0);
  return {
    txid: DUMMY_TXID,
    vout: 0,
    value,
    status: { confirmed: true, block_height: 800_000 },
    address: addr.address,
    chain: 0,
    index: 0,
  };
}

/** Build a silent-payment (private) UTXO worth `value` sats. */
function makeSpUtxo(value: number, txid = DUMMY_TXID_2): HdSpendableSpUtxo {
  return {
    txid,
    vout: 0,
    value,
    tweakHex: 'aa'.repeat(32),
    k: 0,
    height: 800_001,
  };
}

/** Hex of every output scriptPubKey in a PSBT. */
function outputScriptHexes(psbtHex: string): string[] {
  const tx = btc.Transaction.fromPSBT(hex.decode(psbtHex));
  const out: string[] = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const o = tx.getOutput(i);
    if (o.script) out.push(hex.encode(o.script));
  }
  return out;
}

/** A throwaway on-chain P2TR recipient (derived from an unrelated seed). */
const RECIPIENT_ADDRESS = deriveReceiveAddress(deriveAccountFromSeed(makeSeed(99)), 5).address;

// ---------------------------------------------------------------------------
// Wallet isolation: a private send must never select a public (BIP-86) input
// ---------------------------------------------------------------------------

describe('wallet scope isolation', () => {
  it('private send selects ONLY silent-payment inputs', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [
      { kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) },
      { kind: 'sp', utxo: makeSpUtxo(50_000) },
    ];

    const built = buildHdSpendPsbt({
      account,
      walletScope: 'private',
      inputs,
      recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
      amountSats: 10_000,
      feeRate: 2,
      nextChangeIndex: 0,
      seed,
    });

    // Every consumed input must be the SP UTXO; the larger public BIP-86 UTXO
    // must never be selected even though it was offered.
    expect(built.inputDescriptors.every((d) => d.kind === 'sp')).toBe(true);
    expect(built.consumedSpUtxos.length).toBeGreaterThan(0);
  });

  it('public send selects ONLY BIP-86 inputs', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [
      { kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) },
      { kind: 'sp', utxo: makeSpUtxo(50_000) },
    ];

    const built = buildHdSpendPsbt({
      account,
      walletScope: 'public',
      inputs,
      recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
      amountSats: 10_000,
      feeRate: 2,
      nextChangeIndex: 0,
      seed,
    });

    expect(built.inputDescriptors.every((d) => d.kind === 'bip86')).toBe(true);
    expect(built.consumedSpUtxos.length).toBe(0);
  });

  it('private send with insufficient SP balance fails even when public funds exist', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [
      { kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) },
      { kind: 'sp', utxo: makeSpUtxo(5_000) },
    ];

    expect(() =>
      buildHdSpendPsbt({
        account,
        walletScope: 'private',
        inputs,
        // More than the SP balance, less than the combined balance.
        recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
        amountSats: 500_000,
        feeRate: 2,
        nextChangeIndex: 0,
        seed,
      }),
    ).toThrow(/insufficient/i);
  });

  it('public max-spend drains only BIP-86 inputs', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [
      { kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) },
      { kind: 'sp', utxo: makeSpUtxo(50_000) },
    ];
    const built = buildHdMaxSpendPsbt({
      account,
      walletScope: 'public',
      inputs,
      recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
      feeRate: 2,
      seed,
    });
    expect(built.consumedSpUtxos.length).toBe(0);
    expect(built.inputDescriptors.every((d) => d.kind === 'bip86')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Private-wallet change must go back into the private wallet (SP self-change),
// NOT to a public BIP-86 change address.
// ---------------------------------------------------------------------------

describe('private-wallet change isolation', () => {
  it("routes change to the wallet's own silent-payment output, not a BIP-86 change address", () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [{ kind: 'sp', utxo: makeSpUtxo(500_000) }];

    const built = buildHdSpendPsbt({
      account,
      walletScope: 'private',
      inputs,
      recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
      amountSats: 100_000, // leaves a large change
      feeRate: 2,
      nextChangeIndex: 0,
      seed,
    });

    expect(built.hasChange).toBe(true);

    // The BIP-86 change address (chain 1, index 0) — what the OLD code used —
    // must NOT appear among the outputs. That's the exact privacy leak fixed.
    const bip86Change = deriveAddress(account.changeNode, 1, 0);
    const bip86ChangeScript = hex.encode(
      btc.p2tr(hex.decode(bip86Change.internalPubkeyHex), undefined, HD_WALLET_NETWORK).script,
    );
    const scripts = outputScriptHexes(built.psbtHex);
    expect(scripts).not.toContain(bip86ChangeScript);

    // The reported change address must be a fresh P2TR (the SP self-change
    // output), and must differ from the BIP-86 change address.
    expect(built.changeAddress).toBeDefined();
    expect(built.changeAddress).not.toBe(bip86Change.address);
    expect(built.changeAddress!.startsWith('bc1p')).toBe(true);
  });

  it('public-wallet change still goes to the BIP-86 change address', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const inputs: HdInput[] = [{ kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) }];

    const built = buildHdSpendPsbt({
      account,
      walletScope: 'public',
      inputs,
      recipient: { kind: 'address', address: RECIPIENT_ADDRESS },
      amountSats: 100_000,
      feeRate: 2,
      nextChangeIndex: 0,
      seed,
    });

    expect(built.hasChange).toBe(true);
    const expectedChange = deriveAddress(account.changeNode, 1, 0).address;
    expect(built.changeAddress).toBe(expectedChange);
  });

  it('public send to an SP recipient keeps change on the BIP-86 change address', () => {
    const seed = makeSeed();
    const account = deriveAccountFromSeed(seed);
    const ownSp = deriveSilentPaymentAddress(seed).address;
    const inputs: HdInput[] = [{ kind: 'bip86', utxo: makeBip86Utxo(account, 1_000_000) }];

    const built = buildHdSpendPsbt({
      account,
      walletScope: 'public',
      inputs,
      // Pay an SP address out of the PUBLIC wallet (public funds → private
      // destination). Change is still public-wallet change.
      recipient: { kind: 'sp', spAddress: ownSp },
      amountSats: 100_000,
      feeRate: 2,
      nextChangeIndex: 0,
      seed,
    });

    expect(built.hasChange).toBe(true);
    const expectedChange = deriveAddress(account.changeNode, 1, 0).address;
    expect(built.changeAddress).toBe(expectedChange);
    // The total output value must equal amount + change (no funds dropped).
    const tx = btc.Transaction.fromPSBT(hex.decode(built.psbtHex));
    let outTotal = 0n;
    for (let i = 0; i < tx.outputsLength; i++) outTotal += tx.getOutput(i).amount ?? 0n;
    expect(outTotal).toBe(BigInt(1_000_000 - built.fee));
  });
});
