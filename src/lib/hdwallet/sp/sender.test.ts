import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';

import {
  bip86TweakedPrivateKey,
  decodeSilentPaymentAddress,
  deriveSilentPaymentOutputs,
  isSilentPaymentAddress,
  validateSilentPaymentAddress,
  type SilentPaymentInput,
} from './sender';
import { derivePkAtIndex, pointMultiplyCompressed, taggedHash } from './crypto';

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

// ---------------------------------------------------------------------------
// Regression: Taproot inputs whose signing scalar has an odd-Y pubkey
// ---------------------------------------------------------------------------
//
// A spent silent-payment UTXO contributes its signing scalar `d_k` to the
// BIP-352 input sum. The recipient's indexer reconstructs `A` from each
// input's on-chain x-only key lifted to **even-Y**, so the sender MUST
// contribute the even-Y-normalised scalar (`-d_k` when `d_k·G` is odd-Y).
// `deriveSilentPaymentOutputs` performs that normalisation only when the
// input is flagged `isTaproot: true`.
//
// A historical bug passed SP inputs with `isTaproot: false`, skipping the
// negation. The on-chain output then landed at a key the recipient never
// derives, so the payment was invisible to the receiver. This test pins the
// fix by running the full sender→receiver round-trip for an input whose
// `d_k·G` is odd-Y, and asserting the receiver re-derives the output key.

const { Point } = secp256k1;

/** Find a 32-byte scalar whose pubkey has the requested Y parity. */
function scalarWithParity(start: Uint8Array, oddY: boolean): Uint8Array {
  const buf = new Uint8Array(start);
  for (let i = 0; i < 256; i++) {
    const pub = Point.BASE.multiply(bytesToNumberBE(buf)).toBytes(true);
    if ((pub[0] === 0x03) === oddY) return buf;
    buf[31] = (buf[31] + 1) & 0xff;
  }
  throw new Error('could not find scalar with requested parity');
}

describe('deriveSilentPaymentOutputs — odd-Y Taproot input round-trip', () => {
  it('produces an output the receiver re-derives when d_k·G is odd-Y', () => {
    // Sender's SP-input signing scalar, chosen so its pubkey has ODD Y.
    const dk = scalarWithParity(
      hex.decode('1111111111111111111111111111111111111111111111111111111111111111'),
      true,
    );
    expect(Point.BASE.multiply(bytesToNumberBE(dk)).toBytes(true)[0]).toBe(0x03);

    const input: SilentPaymentInput = {
      txid: 'a3b1c2d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00',
      vout: 0,
      privateKey: dk,
      isTaproot: true,
    };

    const [output] = deriveSilentPaymentOutputs(
      [input],
      [{ address: decodeSilentPaymentAddress(REFERENCE_SP), raw: REFERENCE_SP }],
      { network: 'mainnet' },
    );

    // ── Receiver side: reconstruct A by lifting the input key to even-Y,
    // compute the per-tx tweak, then derive P_0 from bscan/Bspend. ──
    const decoded = decodeSilentPaymentAddress(REFERENCE_SP);
    // We don't have bscan for the reference address, so instead verify the
    // identity the receiver relies on: the sender's output must equal
    // `B_spend + t_0·G` where `t_0` is derived from the shared secret
    // `input_hash · a · B_scan`, with `a` the EVEN-Y-normalised scalar.
    const aEven =
      Point.BASE.multiply(bytesToNumberBE(dk)).toBytes(true)[0] === 0x03
        ? (() => {
            const n = secp256k1.Point.Fn.ORDER;
            const neg = (n - bytesToNumberBE(dk)) % n;
            return neg;
          })()
        : bytesToNumberBE(dk);
    const A = Point.BASE.multiply(aEven).toBytes(true);

    // outpoint_L = txid(LE) || vout(LE)
    const txidLE = hex.decode(input.txid).reverse();
    const voutLE = new Uint8Array(4);
    new DataView(voutLE.buffer).setUint32(0, input.vout, true);
    const outpoint = new Uint8Array(36);
    outpoint.set(txidLE, 0);
    outpoint.set(voutLE, 32);

    const inputHash = taggedHash(
      'BIP0352/Inputs',
      Uint8Array.from([...outpoint, ...A]),
    );
    const n = secp256k1.Point.Fn.ORDER;
    const combined = (bytesToNumberBE(inputHash) * aEven) % n;
    // shared secret point = combined · B_scan
    const shared = pointMultiplyCompressed(
      decoded.scanPubKey,
      hex.decode(combined.toString(16).padStart(64, '0')),
    );
    const { xonlyPk } = derivePkAtIndex(shared, decoded.spendPubKey, 0);

    expect(hex.encode(output.xOnlyPubKey)).toBe(hex.encode(xonlyPk));
  });
});
