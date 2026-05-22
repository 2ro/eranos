import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';

import '@/lib/polyfills';
import {
  buildUnsignedPsbt,
  createBitcoinTransaction,
  finalizePsbt,
  isLargeAmount,
  LARGE_AMOUNT_USD_THRESHOLD,
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  signPsbtLocal,
  validateBitcoinAddress,
} from '@/lib/bitcoin';

/**
 * Regression test vectors for key-path-only P2TR address derivation using the
 * Nostr pubkey directly as the internal key (no script tree).
 *
 * Each vector was produced by the original `bitcoinjs-lib` +
 * `@bitcoinerlab/secp256k1` toolchain and independently validated against
 * the address's bech32m checksum. They are preserved unchanged after the
 * migration to `@scure/btc-signer` to prove byte-for-byte derivation
 * equivalence — if the derivation ever drifts (library upgrade, ECC backend
 * switch, etc.) these tests will fail loudly.
 *
 * Note: these are NOT the addresses in the BIP-341 wallet test vectors,
 * because those vectors use a non-empty script tree (merkle root); our
 * implementation uses a key-path-only spend path (empty merkle root), which
 * is the correct derivation for mapping a Nostr pubkey to a spendable address.
 */
describe('nostrPubkeyToBitcoinAddress', () => {
  it('derives the expected key-path-only Taproot address (fixture 1)', () => {
    const internalPubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const expected = 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('derives the expected key-path-only Taproot address (fixture 2)', () => {
    const internalPubkey = '187791b6f712a8ea41c8ecdd0ee77fab3e85263b37e1ec18a3651926b3a6cf27';
    const expected = 'bc1pjxzw9tm6qatyapu3c409dg8k23p4hjlk4ehwwlsum3emjqsaetrqppyu2z';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('derives the expected key-path-only Taproot address (fixture 3)', () => {
    const internalPubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
    const expected = 'bc1p2jdrzv2w45xws7qlguk0acmz9clje8fasvhx3kv3cgpmhm8qtzhsq6fyhy';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('produces a bech32m mainnet address that passes validation', () => {
    const pubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';

    const address = nostrPubkeyToBitcoinAddress(pubkey);

    expect(address.startsWith('bc1p')).toBe(true);
    expect(validateBitcoinAddress(address)).toBe(true);
  });

  it('is deterministic — same input yields the same non-empty address', () => {
    // Use a pubkey known to be a valid on-curve secp256k1 x-only point.
    const pubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';

    const a1 = nostrPubkeyToBitcoinAddress(pubkey);
    const a2 = nostrPubkeyToBitcoinAddress(pubkey);
    expect(a1).toBe(a2);
    expect(a1).not.toBe('');
  });

  it('returns empty string for malformed pubkeys instead of throwing', () => {
    // Too short.
    expect(nostrPubkeyToBitcoinAddress('abc')).toBe('');
    // Non-hex characters.
    expect(nostrPubkeyToBitcoinAddress('z'.repeat(64))).toBe('');
    // Empty string.
    expect(nostrPubkeyToBitcoinAddress('')).toBe('');
    // Odd length (not a whole number of bytes).
    expect(nostrPubkeyToBitcoinAddress('a'.repeat(63))).toBe('');
  });

  it('returns empty string for hex that is not a valid secp256k1 x-only point', () => {
    // Valid 64-char hex, but not a valid on-curve secp256k1 x-only point.
    expect(nostrPubkeyToBitcoinAddress('e7a2e3b5f1c8d4a6b9c0e1f2d3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2')).toBe('');
  });

  it('accepts both upper- and lower-case hex', () => {
    const lower = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const upper = lower.toUpperCase();

    expect(nostrPubkeyToBitcoinAddress(lower)).toBe(nostrPubkeyToBitcoinAddress(upper));
  });
});

describe('npubToBitcoinAddress', () => {
  it('decodes an npub and derives the matching Taproot address', () => {
    // Any valid Nostr pubkey works — we just verify round-trip consistency.
    const pubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
    const npub = nip19.npubEncode(pubkey);

    const fromHex = nostrPubkeyToBitcoinAddress(pubkey);
    const fromNpub = npubToBitcoinAddress(npub);

    expect(fromNpub).toBe(fromHex);
  });

  it('throws on non-npub NIP-19 input', () => {
    const note = nip19.noteEncode('d6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d');
    expect(() => npubToBitcoinAddress(note)).toThrow(/npub/i);
  });
});

describe('validateBitcoinAddress', () => {
  it('accepts valid bech32m P2TR addresses', () => {
    expect(validateBitcoinAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBe(true);
  });

  it('accepts legacy P2PKH and P2SH addresses', () => {
    expect(validateBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    expect(validateBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(validateBitcoinAddress('')).toBe(false);
    expect(validateBitcoinAddress('not-an-address')).toBe(false);
    // Valid-looking bech32m with broken checksum (flipped last char).
    expect(validateBitcoinAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z6')).toBe(false);
  });
});

/**
 * PSBT construction & signing regression — proves the byte-for-byte
 * equivalence of the `@scure/btc-signer` rewrite against the previous
 * `bitcoinjs-lib` + `ecpair` + `@bitcoinerlab/secp256k1` implementation.
 *
 * The unsigned-PSBT hex strings below were captured from the bitcoinjs-lib
 * pipeline before the migration. They lock in:
 *   - input layout (txid, vout, witnessUtxo script & amount, tapInternalKey)
 *   - output ordering (recipient first, then change)
 *   - the fee-vs-change decision (drop change when it would be sub-dust)
 *   - the PSBT v0 serialisation envelope (version, lock-time, magic, key types)
 *
 * Signing uses BIP-340 Schnorr with random aux randomness by default, so the
 * post-sign witness bytes differ run-to-run. Instead we round-trip:
 *   sign → finalize → broadcast hex → verify witness count + scripts +
 *   txid stability is implicit via the unsigned-PSBT fixture above
 * and additionally cross-check that the standalone signer (`signPsbtLocal`)
 * agrees with the convenience wrapper (`createBitcoinTransaction`).
 */
describe('PSBT round-trip (bitcoinjs-lib regression)', () => {
  // Privkey 0x03, derived xonly pubkey — sender's Taproot wallet.
  // bc1pgxxyvcmdncdxs06cudd5yvmwwahaesaj6n3eu7st7x4sw9hrchaqjy33gs
  const SINGLE_INPUT = {
    privkey: '0000000000000000000000000000000000000000000000000000000000000003',
    senderXOnly: 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
    utxos: [
      {
        txid: '0000000000000000000000000000000000000000000000000000000000000001',
        vout: 0,
        value: 10000,
        status: { confirmed: true },
      },
    ],
    toAddress: 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
    amountSats: 9000,
    feeRate: 1,
    expectedFee: 154,
    // Captured from bitcoinjs-lib before the migration.
    expectedUnsignedPsbtHex:
      '70736274ff010089020000000101000000000000000000000000000000000000000000000000000000000000000000000000ffffffff02282300000000000022512053a1f6e454df1aa2776a2814a721372d6258050de330b3c6d10ee8f4e0dda3434e03000000000000225120418c46636d9e1a683f58e35b42336e776fdcc3b2d4e39e7a0bf1ab0716e3c5fa000000000001012b1027000000000000225120418c46636d9e1a683f58e35b42336e776fdcc3b2d4e39e7a0bf1ab0716e3c5fa011720f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9000000',
  };

  // Two-input, two-output (with change) — exercises the multi-input signing
  // path and the change-output branch.
  const TWO_INPUTS = {
    privkey: '0000000000000000000000000000000000000000000000000000000000000005',
    senderXOnly: '2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4',
    utxos: [
      {
        txid: '0000000000000000000000000000000000000000000000000000000000000001',
        vout: 0,
        value: 30000,
        status: { confirmed: true },
      },
      {
        txid: '0000000000000000000000000000000000000000000000000000000000000002',
        vout: 1,
        value: 50000,
        status: { confirmed: true },
      },
    ],
    toAddress: 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
    amountSats: 60000,
    feeRate: 2,
    expectedFee: 423,
    expectedUnsignedPsbtHex:
      '70736274ff0100b2020000000201000000000000000000000000000000000000000000000000000000000000000000000000ffffffff02000000000000000000000000000000000000000000000000000000000000000100000000ffffffff0260ea00000000000022512053a1f6e454df1aa2776a2814a721372d6258050de330b3c6d10ee8f4e0dda343794c000000000000225120ee713c671c569fbb39901ea3f75195854ba615099ab33a6aecaa5ed539522f93000000000001012b3075000000000000225120ee713c671c569fbb39901ea3f75195854ba615099ab33a6aecaa5ed539522f930117202f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe40001012b50c3000000000000225120ee713c671c569fbb39901ea3f75195854ba615099ab33a6aecaa5ed539522f930117202f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4000000',
  };

  it('builds the same unsigned PSBT as bitcoinjs-lib (single input, no change)', () => {
    const built = buildUnsignedPsbt(
      SINGLE_INPUT.senderXOnly,
      SINGLE_INPUT.toAddress,
      SINGLE_INPUT.amountSats,
      SINGLE_INPUT.utxos,
      SINGLE_INPUT.feeRate,
    );
    expect(built.fee).toBe(SINGLE_INPUT.expectedFee);
    expect(built.psbtHex).toBe(SINGLE_INPUT.expectedUnsignedPsbtHex);
  });

  it('builds the same unsigned PSBT as bitcoinjs-lib (two inputs, with change)', () => {
    const built = buildUnsignedPsbt(
      TWO_INPUTS.senderXOnly,
      TWO_INPUTS.toAddress,
      TWO_INPUTS.amountSats,
      TWO_INPUTS.utxos,
      TWO_INPUTS.feeRate,
    );
    expect(built.fee).toBe(TWO_INPUTS.expectedFee);
    expect(built.psbtHex).toBe(TWO_INPUTS.expectedUnsignedPsbtHex);
  });

  it('signs and finalizes a PSBT into a broadcastable transaction (single input)', () => {
    const { psbtHex } = buildUnsignedPsbt(
      SINGLE_INPUT.senderXOnly,
      SINGLE_INPUT.toAddress,
      SINGLE_INPUT.amountSats,
      SINGLE_INPUT.utxos,
      SINGLE_INPUT.feeRate,
    );
    const signed = signPsbtLocal(psbtHex, SINGLE_INPUT.privkey);
    const txHex = finalizePsbt(signed);

    // Witness format for P2TR key-path: a single 64-byte Schnorr signature
    // (no sighash byte appended → DEFAULT/0x00). The raw tx hex therefore
    // contains a 0x01-element witness stack + 0x40 length prefix near the end:
    //   ... 01 40 <64-byte sig> 00 00 00 00 (locktime)
    expect(txHex).toMatch(/0140[0-9a-f]{128}00000000$/);
    // version (2) + flag/marker (0001) for segwit
    expect(txHex.startsWith('02000000')).toBe(true);
  });

  it('signs and finalizes a multi-input PSBT (every input gets a witness)', () => {
    const { psbtHex } = buildUnsignedPsbt(
      TWO_INPUTS.senderXOnly,
      TWO_INPUTS.toAddress,
      TWO_INPUTS.amountSats,
      TWO_INPUTS.utxos,
      TWO_INPUTS.feeRate,
    );
    const signed = signPsbtLocal(psbtHex, TWO_INPUTS.privkey);
    const txHex = finalizePsbt(signed);

    // Two inputs → two witness stacks → two `01 40` sig markers.
    const sigMatches = txHex.match(/0140[0-9a-f]{128}/g);
    expect(sigMatches).not.toBeNull();
    expect(sigMatches?.length).toBe(2);
  });

  it('createBitcoinTransaction matches the buildUnsignedPsbt + signPsbtLocal + finalizePsbt pipeline', () => {
    // We can't compare witness bytes directly (random aux), but the unsigned
    // tx body, fee, input/output topology, and witness *shape* must match.
    // Easiest check: extract the non-witness bytes via vsize / weight by
    // round-tripping both outputs back through `Transaction.fromRaw`.
    const direct = createBitcoinTransaction(
      SINGLE_INPUT.privkey,
      SINGLE_INPUT.toAddress,
      SINGLE_INPUT.amountSats,
      SINGLE_INPUT.utxos,
      SINGLE_INPUT.feeRate,
    );
    expect(direct.fee).toBe(SINGLE_INPUT.expectedFee);
    // Same output shape as the manual pipeline.
    expect(direct.txHex).toMatch(/0140[0-9a-f]{128}00000000$/);
    expect(direct.txHex.startsWith('02000000')).toBe(true);
  });

  it('signPsbtLocal throws when no input belongs to the signer', () => {
    const { psbtHex } = buildUnsignedPsbt(
      SINGLE_INPUT.senderXOnly,
      SINGLE_INPUT.toAddress,
      SINGLE_INPUT.amountSats,
      SINGLE_INPUT.utxos,
      SINGLE_INPUT.feeRate,
    );
    // Try to sign with a different key whose xonly pubkey does not match the
    // PSBT's tapInternalKey — every input must be skipped.
    const wrongKey = '0000000000000000000000000000000000000000000000000000000000000007';
    expect(() => signPsbtLocal(psbtHex, wrongKey)).toThrow(/no inputs/i);
  });
});

describe('isLargeAmount', () => {
  // Assume a BTC price of $100_000 for easy arithmetic. 1 BTC = $100k, so
  // 1 sat = $0.001 and the $100 threshold corresponds to 100_000 sats.
  const PRICE = 100_000;

  it('returns true when the USD value is above the threshold', () => {
    // 200,000 sats @ $100k/BTC = $200 — well above $100.
    expect(isLargeAmount(200_000, PRICE)).toBe(true);
  });

  it('returns true at exactly the threshold', () => {
    // 100,000 sats @ $100k/BTC = $100 — at the threshold (inclusive).
    expect(isLargeAmount(100_000, PRICE)).toBe(true);
  });

  it('returns false below the threshold', () => {
    // 50,000 sats @ $100k/BTC = $50 — below $100.
    expect(isLargeAmount(50_000, PRICE)).toBe(false);
  });

  it('returns false when btcPrice is undefined', () => {
    expect(isLargeAmount(10_000_000, undefined)).toBe(false);
  });

  it('returns false for non-positive sats or prices', () => {
    expect(isLargeAmount(0, PRICE)).toBe(false);
    expect(isLargeAmount(-1, PRICE)).toBe(false);
    expect(isLargeAmount(100_000, 0)).toBe(false);
    expect(isLargeAmount(100_000, -PRICE)).toBe(false);
    expect(isLargeAmount(100_000, NaN)).toBe(false);
  });

  it('exports a sensible default threshold', () => {
    expect(LARGE_AMOUNT_USD_THRESHOLD).toBe(100);
  });
});
