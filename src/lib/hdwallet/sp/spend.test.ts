import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';

import {
  deriveSilentPaymentSpendKey,
  deriveSpUtxoOutputPoint,
  deriveSpUtxoSigningKey,
  deriveSpUtxoXOnly,
  spP2trScriptPubKey,
} from './spend';
import { derivePkFromStoredTweak } from './crypto';
import { deriveSilentPaymentKeys } from '../derivation';

const { Point } = secp256k1;

// ---------------------------------------------------------------------------
// `deriveSpUtxoSigningKey` — d_k = (b_spend + t_k) mod N
// ---------------------------------------------------------------------------

describe('deriveSpUtxoSigningKey', () => {
  it('produces a 32-byte scalar', () => {
    const bSpend = hex.decode(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    const tweak = hex.decode(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    const dk = deriveSpUtxoSigningKey(bSpend, tweak);
    expect(dk.length).toBe(32);
  });

  it('matches manual modular addition', () => {
    const bSpend = hex.decode(
      '0000000000000000000000000000000000000000000000000000000000000001',
    );
    const tweak = hex.decode(
      '0000000000000000000000000000000000000000000000000000000000000002',
    );
    const dk = deriveSpUtxoSigningKey(bSpend, tweak);
    expect(hex.encode(dk)).toBe(
      '0000000000000000000000000000000000000000000000000000000000000003',
    );
  });

  it('throws on out-of-range b_spend', () => {
    const zero = new Uint8Array(32);
    const tweak = new Uint8Array(32);
    tweak[31] = 1;
    expect(() => deriveSpUtxoSigningKey(zero, tweak)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// On-chain output derivation matches BIP-352 receiver math
// ---------------------------------------------------------------------------
//
// `deriveSpUtxoXOnly` computes (b_spend + t_k) · G. The receiver-side
// scanner already implemented in crypto.ts computes B_spend + t_k · G.
// Both must produce the same x-only key: this is the round-trip the
// receiver-then-spender flow depends on.

describe('deriveSpUtxoXOnly', () => {
  it('matches the receiver-side derivation B_spend + t_k · G', () => {
    // Fabricate a deterministic (b_spend, t_k) pair.
    const bSpend = hex.decode(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    const tweak = hex.decode(
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    );

    // Sender-side: d_k · G
    const senderXOnly = deriveSpUtxoXOnly(bSpend, tweak);

    // Receiver-side: B_spend + t_k · G via the existing scanner helper
    const bSpendScalar = bytesToNumberBE(bSpend);
    const BSpend = Point.BASE.multiply(bSpendScalar).toBytes(true);
    const receiverXOnly = derivePkFromStoredTweak(BSpend, tweak);

    expect(hex.encode(senderXOnly)).toBe(hex.encode(receiverXOnly));
  });
});

// ---------------------------------------------------------------------------
// `deriveSilentPaymentSpendKey`: integration with the existing derivation
// ---------------------------------------------------------------------------

describe('deriveSilentPaymentSpendKey', () => {
  it("matches the receiver-side B_spend = b_spend · G derivation", () => {
    // Random 64-byte seed — value doesn't matter, only that both paths agree.
    const seed = new Uint8Array(64);
    for (let i = 0; i < seed.length; i++) seed[i] = (i * 17 + 1) & 0xff;
    const bSpend = deriveSilentPaymentSpendKey(seed);
    const keys = deriveSilentPaymentKeys(seed);

    // b_spend · G must equal the published `Bspend` (receive-side).
    const derivedPub = Point.BASE.multiply(bytesToNumberBE(bSpend)).toBytes(true);
    expect(hex.encode(derivedPub)).toBe(hex.encode(keys.Bspend));
  });
});

// ---------------------------------------------------------------------------
// `deriveSpUtxoOutputPoint` returns a valid 33-byte compressed point
// ---------------------------------------------------------------------------

describe('deriveSpUtxoOutputPoint', () => {
  it('returns a 33-byte compressed point on the curve', () => {
    const bSpend = hex.decode(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    const tweak = hex.decode(
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    );
    const point = deriveSpUtxoOutputPoint(bSpend, tweak);
    expect(point.length).toBe(33);
    expect(point[0] === 0x02 || point[0] === 0x03).toBe(true);
    // Should round-trip through `Point.fromBytes`.
    expect(() => Point.fromBytes(point)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// `spP2trScriptPubKey`: shape sanity
// ---------------------------------------------------------------------------

describe('spP2trScriptPubKey', () => {
  it('emits a 34-byte OP_1 push32 <xonly> script', () => {
    const xonly = new Uint8Array(32);
    xonly.fill(7);
    const script = spP2trScriptPubKey(xonly);
    expect(script.length).toBe(34);
    expect(script[0]).toBe(0x51); // OP_1
    expect(script[1]).toBe(0x20); // push 32
    expect(Array.from(script.subarray(2))).toEqual(Array(32).fill(7));
  });
});
