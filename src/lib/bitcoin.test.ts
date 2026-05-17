import { beforeAll, describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import '@/lib/polyfills';
import {
  isLargeAmount,
  LARGE_AMOUNT_USD_THRESHOLD,
  buildUnsignedMultiOutputPsbt,
  estimateFee,
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  validateBitcoinAddress,
} from '@/lib/bitcoin';
import type { UTXO } from '@/lib/bitcoin';

beforeAll(() => {
  bitcoin.initEccLib(ecc);
});

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

  it('is deterministic', () => {
    const pubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const a1 = nostrPubkeyToBitcoinAddress(pubkey);
    const a2 = nostrPubkeyToBitcoinAddress(pubkey);

    expect(a1).toBe(a2);
    expect(a1).not.toBe('');
  });

  it('returns empty string for malformed pubkeys instead of throwing', () => {
    expect(nostrPubkeyToBitcoinAddress('abc')).toBe('');
    expect(nostrPubkeyToBitcoinAddress('z'.repeat(64))).toBe('');
    expect(nostrPubkeyToBitcoinAddress('')).toBe('');
    expect(nostrPubkeyToBitcoinAddress('a'.repeat(63))).toBe('');
  });

  it('returns empty string for hex that is not a valid secp256k1 x-only point', () => {
    const origError = console.error;
    console.error = () => {};
    try {
      expect(nostrPubkeyToBitcoinAddress('e7a2e3b5f1c8d4a6b9c0e1f2d3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2')).toBe('');
    } finally {
      console.error = origError;
    }
  });

  it('accepts both upper- and lower-case hex', () => {
    const lower = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const upper = lower.toUpperCase();

    expect(nostrPubkeyToBitcoinAddress(lower)).toBe(nostrPubkeyToBitcoinAddress(upper));
  });
});

describe('npubToBitcoinAddress', () => {
  it('decodes an npub and derives the matching Taproot address', () => {
    const pubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
    const npub = nip19.npubEncode(pubkey);

    expect(npubToBitcoinAddress(npub)).toBe(nostrPubkeyToBitcoinAddress(pubkey));
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
    expect(validateBitcoinAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z6')).toBe(false);
  });
});

describe('isLargeAmount', () => {
  const PRICE = 100_000;

  it('returns true when the USD value is above the threshold', () => {
    expect(isLargeAmount(200_000, PRICE)).toBe(true);
  });

  it('returns true at exactly the threshold', () => {
    expect(isLargeAmount(100_000, PRICE)).toBe(true);
  });

  it('returns false below the threshold', () => {
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

describe('buildUnsignedMultiOutputPsbt', () => {
  const senderPubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
  const recipient1 = 'bc1pjxzw9tm6qatyapu3c409dg8k23p4hjlk4ehwwlsum3emjqsaetrqppyu2z';
  const recipient2 = 'bc1p2jdrzv2w45xws7qlguk0acmz9clje8fasvhx3kv3cgpmhm8qtzhsq6fyhy';
  const utxos: UTXO[] = [
    {
      txid: '00'.repeat(32),
      vout: 0,
      value: 50_000,
      status: { confirmed: true },
    },
  ];

  it('builds one recipient output per payment plus change when economical', () => {
    const { psbtHex, fee } = buildUnsignedMultiOutputPsbt(
      senderPubkey,
      [
        { address: recipient1, amountSats: 1_000 },
        { address: recipient2, amountSats: 2_000 },
      ],
      utxos,
      2,
    );

    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });
    expect(psbt.txOutputs).toHaveLength(3);
    expect(fee).toBe(estimateFee(1, 3, 2));
  });

  it('omits uneconomical dust change', () => {
    const fee = estimateFee(1, 2, 2);
    const { psbtHex } = buildUnsignedMultiOutputPsbt(
      senderPubkey,
      [
        { address: recipient1, amountSats: 10_000 },
        { address: recipient2, amountSats: 50_000 - 10_000 - fee - 100 },
      ],
      utxos,
      2,
    );

    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });
    expect(psbt.txOutputs).toHaveLength(2);
  });

  it('rejects empty output sets', () => {
    expect(() => buildUnsignedMultiOutputPsbt(senderPubkey, [], utxos, 2)).toThrow(/recipient/i);
  });

  it('rejects outputs below dust', () => {
    expect(() => buildUnsignedMultiOutputPsbt(
      senderPubkey,
      [{ address: recipient1, amountSats: 1 }],
      utxos,
      2,
    )).toThrow(/546/);
  });

  it('rejects insufficient funds', () => {
    expect(() => buildUnsignedMultiOutputPsbt(
      senderPubkey,
      [{ address: recipient1, amountSats: 100_000 }],
      utxos,
      2,
    )).toThrow(/insufficient/i);
  });
});
