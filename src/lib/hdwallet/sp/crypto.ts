import { sha256 } from '@noble/hashes/sha256';
import * as ecc from '@bitcoinerlab/secp256k1';

// ---------------------------------------------------------------------------
// BIP-352 silent-payments cryptographic primitives — receive-only subset
// ---------------------------------------------------------------------------
//
// This module is the math kernel that lets the HD wallet detect incoming
// silent payments. It is intentionally smaller than a full BIP-352
// implementation: we only need the receiver-side primitives (per-output
// `Pₖ` derivation, public-data re-derivation) because the HD wallet
// scans-and-displays SP receives but cannot spend or send them.
//
// Specifically NOT included (and not needed for receive-only):
//
//   - Sender-side `computeSPRecipientOutput` (we never construct SP outputs)
//   - Receiver-side `deriveSPSpendScalar` (we never sign SP inputs)
//   - BIP-352 label support (we never produce change because we never spend,
//     and we don't currently hand out labeled receive addresses)
//   - Address encode/decode (the bare receive address is produced by
//     `derivation.deriveSilentPaymentAddress`, which the rest of the wallet
//     already uses)
//
// Reference: this is the cryptographic subset of Ditto's `silent-payments.ts`
// that is needed by the receiver-side scanner — see also NIP-SP §5.
//
// All scalars are 32-byte big-endian, reduced mod the secp256k1 group order.
// All points are 33-byte compressed SEC1 except where x-only is explicit.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Byte / scalar helpers (no external dep beyond noble)
// ---------------------------------------------------------------------------

function concat(...arrs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/**
 * Encode an ASCII-only string as bytes. All BIP-352 tags are ASCII
 * ("BIP0352/Inputs", "BIP0352/SharedSecret", …) so this is exact. Avoiding
 * `TextEncoder` keeps the output a vanilla `Uint8Array` realm, which sidesteps
 * jsdom instanceof flakes in `@noble/hashes`.
 */
function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * BIP-340 tagged hash: `SHA256(SHA256(tag) ‖ SHA256(tag) ‖ msg)`.
 *
 * `bitcoin.crypto.taggedHash` cannot be used here because it is locked to a
 * fixed enum of bitcoin-protocol tags ("TapTweak", "BIP0340/challenge", …)
 * and refuses arbitrary tag strings like "BIP0352/SharedSecret".
 */
export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  const tagHash = sha256(asciiBytes(tag));
  return sha256(concat(tagHash, tagHash, msg));
}

/**
 * Big-endian 4-byte serialisation per BIP-352 `ser32`. Used to feed the
 * per-output counter `k` into the `BIP0352/SharedSecret` tagged hash.
 */
function ser32BE(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`ser32 out of range: ${n}`);
  }
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

/** Constant-time-ish byte compare. (Returns true on equal length + content.) */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a[i] ^ b[i];
  return acc === 0;
}

// ---------------------------------------------------------------------------
// Receiver-side per-output derivation (BIP-352, NIP-SP §5)
// ---------------------------------------------------------------------------

/**
 * Given a per-transaction shared-secret point and a recipient's `Bspend`,
 * compute the on-chain Taproot output key `Pₖ` at index `k`:
 *
 * ```
 * tₖ = H_tagged("BIP0352/SharedSecret", serP(shared) ‖ ser32_BE(k))
 * Pₖ = Bspend + tₖ · G
 * ```
 *
 * The receiver computes `shared = bscan · tweak` (where `tweak = serP(input_hash · A)`
 * comes from the BIP-352 tweak indexer) and walks `k = 0, 1, …` until no
 * output matches.
 *
 * Returns the 33-byte full point (for the parity-aware label-match path that
 * would be needed if we ever supported labels), the 32-byte x-only output key
 * (what the scanner compares against on-chain outputs), and the 32-byte
 * `tₖ` scalar (persisted into the kind-30078 UTXO storage so a future
 * spending path could derive `dₖ = bspend + tₖ` without re-running the scan).
 */
export function derivePkAtIndex(
  shared: Uint8Array,
  Bspend: Uint8Array,
  k: number,
): { xonlyPk: Uint8Array; fullPk: Uint8Array; tweak: Uint8Array } {
  if (shared.length !== 33) throw new Error('shared must be a 33-byte compressed point');
  if (Bspend.length !== 33) throw new Error('Bspend must be a 33-byte compressed point');

  const tk = taggedHash('BIP0352/SharedSecret', concat(shared, ser32BE(k)));

  const tG = ecc.pointFromScalar(tk, true);
  if (!tG) throw new Error('Failed to compute tₖ · G');
  const Pk = ecc.pointAdd(Bspend, tG, true);
  if (!Pk) throw new Error('Failed to compute Pₖ');

  const full = new Uint8Array(Pk);
  return {
    xonlyPk: full.slice(1, 33),
    fullPk: full,
    tweak: tk,
  };
}

/**
 * Compute the on-chain x-only Taproot output key from a persisted `tₖ`
 * tweak — pure public-data derivation that doesn't need `bscan`:
 *
 * ```
 * Pₖ = Bspend + tₖ · G
 * ```
 *
 * Useful for re-deriving the spendable output key for a previously-discovered
 * SP UTXO without re-running ECDH against an indexer. The HD wallet doesn't
 * currently spend SP UTXOs so this helper is exported mainly for future-proofing
 * and for tests that verify the round-trip discover → store → re-derive cycle.
 */
export function derivePkFromStoredTweak(
  Bspend: Uint8Array,
  tweak: Uint8Array,
): Uint8Array {
  if (Bspend.length !== 33) throw new Error('Bspend must be 33-byte compressed');
  if (tweak.length !== 32) throw new Error('tweak must be 32 bytes');

  const tG = ecc.pointFromScalar(tweak, true);
  if (!tG) throw new Error('Failed to compute tₖ · G');
  const Pk = ecc.pointAdd(Bspend, tG, true);
  if (!Pk) throw new Error('Failed to compute Pₖ');
  return new Uint8Array(Pk.slice(1, 33));
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
