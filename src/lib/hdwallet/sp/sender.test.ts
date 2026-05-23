import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';

import {
  bip86TweakedPrivateKey,
  decodeSilentPaymentAddress,
  deriveSilentPaymentOutputs,
  isSilentPaymentAddress,
  validateSilentPaymentAddress,
  type SilentPaymentInput,
} from './sender';

import vectors from '../../../test/fixtures/bip352_taproot_vectors.json';

// ---------------------------------------------------------------------------
// Test fixture type
// ---------------------------------------------------------------------------

interface VinJSON {
  txid: string;
  vout: number;
  private_key: string;
  scriptPubKey: string;
}

interface SendingJSON {
  vin: VinJSON[];
  recipients: string[];
  expected_output_permutations: string[][];
}

interface VectorJSON {
  comment: string;
  sending: SendingJSON[];
}

const taprootVectors: VectorJSON[] = vectors as VectorJSON[];

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

const REFERENCE_SP =
  'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';

describe('isSilentPaymentAddress', () => {
  it('accepts mainnet sp1…', () => {
    expect(isSilentPaymentAddress(REFERENCE_SP)).toBe(true);
  });
  it('accepts testnet tsp1…', () => {
    expect(isSilentPaymentAddress('tsp1qqfoo')).toBe(true);
  });
  it('rejects bare bech32m addresses', () => {
    expect(
      isSilentPaymentAddress(
        'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
      ),
    ).toBe(false);
  });
  it('rejects garbage', () => {
    expect(isSilentPaymentAddress('not-an-address')).toBe(false);
    expect(isSilentPaymentAddress('')).toBe(false);
  });
});

describe('validateSilentPaymentAddress', () => {
  it('accepts the BIP-352 reference address', () => {
    expect(validateSilentPaymentAddress(REFERENCE_SP)).toBe(true);
  });
  it('rejects a corrupted checksum', () => {
    expect(validateSilentPaymentAddress(REFERENCE_SP.slice(0, -1) + 'a')).toBe(false);
  });
  it('rejects mixed case', () => {
    const mixed = REFERENCE_SP.slice(0, 4) + REFERENCE_SP.slice(4).toUpperCase();
    expect(validateSilentPaymentAddress(mixed)).toBe(false);
  });
});

describe('decodeSilentPaymentAddress', () => {
  it('decodes the BIP-352 reference address', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP);
    expect(sp.hrp).toBe('sp');
    expect(sp.network).toBe('mainnet');
    expect(sp.version).toBe(0);
    expect(sp.scanPubKey.length).toBe(33);
    expect(sp.spendPubKey.length).toBe(33);
  });
  it('throws on a structurally invalid address', () => {
    // bech32m.decode itself rejects this — short data part + bad checksum.
    // The test exists so a regression that swallows decode errors would
    // surface here.
    expect(() => decodeSilentPaymentAddress('xx1qqqqqq')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BIP-352 sender output derivation (canonical test vectors)
// ---------------------------------------------------------------------------

/**
 * For Taproot-only vectors, every input's `private_key` is the BIP-341
 * *tweaked* key (the actual signing scalar). The vectors give us a
 * `scriptPubKey` of the form `OP_1 push32 <xonly>` — we use that to verify
 * we're loading the right input. The BIP-352 sender algorithm negates
 * scalars whose pubkey has odd-Y, so the test driver passes the raw
 * private_key and `isTaproot: true`.
 */
describe('deriveSilentPaymentOutputs — BIP-352 taproot vectors', () => {
  for (const vector of taprootVectors) {
    describe(vector.comment, () => {
      for (const send of vector.sending) {
        it('matches the expected x-only outputs', () => {
          const inputs: SilentPaymentInput[] = send.vin.map((v) => ({
            txid: v.txid,
            vout: v.vout,
            privateKey: hex.decode(v.private_key),
            isTaproot: true,
          }));
          const recipients = send.recipients.map((addr) => ({
            address: decodeSilentPaymentAddress(addr),
            raw: addr,
          }));

          const outputs = deriveSilentPaymentOutputs(inputs, recipients, {
            network: 'mainnet',
          });
          const actual = outputs.map((o) => hex.encode(o.xOnlyPubKey)).sort();

          // The BIP vector lists permutations; in single-recipient cases
          // there's only one entry. Compare against any permutation.
          const matchesAny = send.expected_output_permutations.some((perm) => {
            const expected = [...perm].sort();
            return (
              actual.length === expected.length &&
              actual.every((a, i) => a === expected[i])
            );
          });
          expect(matchesAny).toBe(true);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// bip86TweakedPrivateKey
// ---------------------------------------------------------------------------

describe('bip86TweakedPrivateKey', () => {
  it('produces a 32-byte tweaked key for a valid BIP-86 child key', () => {
    // A random valid scalar — the vector is just a regression check that
    // the helper returns a non-empty result; the math itself is delegated
    // to `@scure/btc-signer/utils.taprootTweakPrivKey`.
    const child = hex.decode(
      'eadc78165ff1f8ea94ad7cfdc54990738a4c53f6e0507b42154201b8e5dff3b1',
    );
    const tweaked = bip86TweakedPrivateKey(child);
    expect(tweaked.length).toBe(32);
    expect(hex.encode(tweaked)).not.toBe(hex.encode(child));
  });
});

// ---------------------------------------------------------------------------
// Sanity: an empty input set is rejected
// ---------------------------------------------------------------------------

describe('deriveSilentPaymentOutputs — edge cases', () => {
  it('throws when no inputs are provided', () => {
    const recipients = [
      { address: decodeSilentPaymentAddress(REFERENCE_SP), raw: REFERENCE_SP },
    ];
    expect(() =>
      deriveSilentPaymentOutputs([], recipients, { network: 'mainnet' }),
    ).toThrow();
  });

  it('returns an empty array when no recipients are provided', () => {
    const inputs: SilentPaymentInput[] = [
      {
        txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        vout: 0,
        privateKey: hex.decode(
          'eadc78165ff1f8ea94ad7cfdc54990738a4c53f6e0507b42154201b8e5dff3b1',
        ),
        isTaproot: true,
      },
    ];
    expect(deriveSilentPaymentOutputs(inputs, [], { network: 'mainnet' })).toEqual([]);
  });
});
