import { bech32m, hex as hexCodec } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';

import { taggedHash } from './crypto';

// ---------------------------------------------------------------------------
// BIP-352 Silent Payments — sender side
// ---------------------------------------------------------------------------
//
// This module decodes a recipient's silent-payment address (`sp1…` mainnet,
// `tsp1…` testnets) and derives the one-shot Taproot output(s) the sender
// must include in the transaction.
//
// Algorithm (BIP-352 §"Creating outputs"):
//
//     a            = Σ a_i  (with taproot input keys negated if their
//                    x-only pubkey has an odd Y after multiplication by G)
//     A            = a · G
//     outpoint_L   = lex-smallest serialised outpoint across ALL inputs
//     input_hash   = hashBIP0352/Inputs(outpoint_L || serP(A))
//     ecdh         = input_hash · a · B_scan
//     t_k          = hashBIP0352/SharedSecret(serP(ecdh) || ser32(k))
//     P_k          = B_spend + t_k · G
//
// `P_k` (x-only) is the per-recipient Taproot output the sender writes
// into the transaction. The receiver, scanning the chain, recovers the
// same `P_k` from `bscan` + the per-tx tweak `serP(input_hash · A)`.
//
// We deliberately do NOT implement:
//
//   - The receiver side (scanning). See `scanner.ts` / `crypto.ts`.
//   - Labels (`m != 0`). Labels are a receiver-side concept; the address
//     payload already commits to the labelled `B_m` if any, so the sender
//     treats labelled and unlabelled addresses identically.
//
// Agora uses noble-curves v2 (`Point` / `toBytes` / `fromBytes`); the
// ditto reference implementation that inspired this file uses v1
// (`ProjectivePoint` / `toRawBytes` / `fromHex`). The maths is the same.
// ---------------------------------------------------------------------------

const { Point } = secp256k1;

/** secp256k1 group order N. */
const SECP_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Maximum bech32m string length permitted by BIP-350. */
const BECH32M_MAX_LENGTH = 1023;

/** BIP-352 per-recipient `k` ceiling. */
const K_MAX = 2323;

// ---------------------------------------------------------------------------
// Byte / scalar helpers
// ---------------------------------------------------------------------------

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function bytesToHexLocal(b: Uint8Array): string {
  return hexCodec.encode(b);
}

function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`ser32: out of range (${n}).`);
  }
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function scalarBytes(s: bigint): Uint8Array {
  if (s <= 0n || s >= SECP_N) {
    throw new Error('Silent payment: scalar out of range.');
  }
  return numberToBytesBE(s, 32);
}

/** True iff `bytes` is a 33-byte compressed point on secp256k1. */
function isValidCompressedPoint(bytes: Uint8Array): boolean {
  if (bytes.length !== 33) return false;
  if (bytes[0] !== 0x02 && bytes[0] !== 0x03) return false;
  try {
    Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Silent payment address decoding
// ---------------------------------------------------------------------------

/** Network of a silent payment address. */
type SilentPaymentNetwork = 'mainnet' | 'testnet';

/** A decoded silent payment address. */
interface DecodedSilentPaymentAddress {
  /** Bech32m HRP. `"sp"` for mainnet, `"tsp"` for testnet/signet/regtest. */
  hrp: string;
  network: SilentPaymentNetwork;
  /** Silent-payment-version (0 for `sp1q…`). */
  version: number;
  /** Receiver's scan pubkey (33-byte compressed sec). */
  scanPubKey: Uint8Array;
  /**
   * Receiver's spend pubkey (33-byte compressed sec). When the address is
   * labelled, this is the labelled `B_m`, not the raw `B_spend`; from the
   * sender's perspective the two are interchangeable.
   */
  spendPubKey: Uint8Array;
}

/** Cheap pre-check: does this look like a silent payment address at all? */
export function isSilentPaymentAddress(s: string): boolean {
  if (typeof s !== 'string') return false;
  const lower = s.toLowerCase();
  return lower.startsWith('sp1') || lower.startsWith('tsp1');
}

/**
 * Decode a BIP-352 silent payment address.
 *
 * Throws on mixed case, invalid characters, bad checksum, unknown HRP,
 * version 31 (reserved), payload shorter than 66 bytes after the version, or
 * curve-invalid pubkeys.
 *
 * The decoder accepts (but ignores) trailing bytes for v1–v30 per the BIP's
 * forward-compatibility rule.
 */
export function decodeSilentPaymentAddress(addr: string): DecodedSilentPaymentAddress {
  if (typeof addr !== 'string' || addr.length === 0) {
    throw new Error('Silent payment address: empty string.');
  }
  if (addr.length > BECH32M_MAX_LENGTH) {
    throw new Error('Silent payment address: too long.');
  }

  // BIP-173 forbids mixed case.
  if (addr.toLowerCase() !== addr && addr.toUpperCase() !== addr) {
    throw new Error('Silent payment address: mixed case.');
  }
  const lower = addr.toLowerCase();

  // `@scure/base`'s `bech32m.decode` performs the polymod + character checks
  // for us; we still need to do BIP-352-specific structural validation
  // (version byte, payload length, pubkey validity).
  let decoded: ReturnType<typeof bech32m.decode>;
  try {
    decoded = bech32m.decode(lower, BECH32M_MAX_LENGTH);
  } catch (err) {
    throw new Error(
      `Silent payment address: ${err instanceof Error ? err.message : 'invalid bech32m'}.`,
    );
  }
  const { prefix: hrp, words } = decoded;

  let network: SilentPaymentNetwork;
  if (hrp === 'sp') network = 'mainnet';
  else if (hrp === 'tsp') network = 'testnet';
  else throw new Error(`Silent payment address: unknown HRP "${hrp}".`);

  if (words.length < 1) {
    throw new Error('Silent payment address: data part too short.');
  }
  const version = words[0];
  if (version > 31) throw new Error('Silent payment address: invalid version.');
  if (version === 31) {
    throw new Error('Silent payment address: reserved version 31.');
  }

  const payload = bech32m.fromWords(words.slice(1));

  if (version === 0) {
    if (payload.length !== 66) {
      throw new Error(
        `Silent payment v0: data part must be exactly 66 bytes (got ${payload.length}).`,
      );
    }
  } else {
    if (payload.length < 66) {
      throw new Error(
        `Silent payment v${version}: data part must be at least 66 bytes (got ${payload.length}).`,
      );
    }
  }

  const scanPubKey = payload.slice(0, 33);
  const spendPubKey = payload.slice(33, 66);

  if (!isValidCompressedPoint(scanPubKey)) {
    throw new Error('Silent payment address: scan key is not a valid compressed point.');
  }
  if (!isValidCompressedPoint(spendPubKey)) {
    throw new Error('Silent payment address: spend key is not a valid compressed point.');
  }

  return { hrp, network, version, scanPubKey, spendPubKey };
}

/**
 * Best-effort validator. Returns `true` iff the string is a syntactically
 * valid silent payment address (bech32m + curve checks). Use for inline
 * form validation where pickers may speculatively check half-typed inputs
 * and a thrown error is the wrong UX signal.
 */
export function validateSilentPaymentAddress(addr: string): boolean {
  try {
    decodeSilentPaymentAddress(addr);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Outpoint serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise an outpoint exactly as it appears in a Bitcoin transaction:
 * 32-byte txid in internal (little-endian) byte order followed by a 4-byte
 * little-endian vout.
 *
 * Esplora/Blockbook/mempool.space and Bitcoin Core's RPC all surface txids
 * as their display form (big-endian); we reverse them here for the hash.
 */
function serializeOutpoint(txidHex: string, vout: number): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(txidHex)) {
    throw new Error('outpoint: txid must be 32-byte hex.');
  }
  const txid = hexCodec.decode(txidHex.toLowerCase());
  txid.reverse();
  const voutBuf = new Uint8Array(4);
  new DataView(voutBuf.buffer).setUint32(0, vout >>> 0, true);
  return concatBytes(txid, voutBuf);
}

// ---------------------------------------------------------------------------
// Sender output derivation
// ---------------------------------------------------------------------------

/**
 * A single sender input that contributes to BIP-352 ECDH.
 *
 * `privateKey` is the input's signing private key. For Taproot inputs this
 * is the BIP-341 *tweaked* key (the same scalar used to produce the Schnorr
 * signature on the input), NOT the untweaked BIP-86 child key.
 *
 * `isTaproot` flips the negate-if-odd-Y rule on per BIP-352 §"Creating
 * outputs". When `true`, this module derives `pubKey = privateKey · G` and
 * negates `privateKey` mod N if the resulting pubkey has an odd Y.
 */
export interface SilentPaymentInput {
  txid: string;
  vout: number;
  privateKey: Uint8Array;
  isTaproot: boolean;
}

/** A single resolved silent payment recipient. */
interface SilentPaymentRecipient {
  /** Decoded silent payment address. */
  address: DecodedSilentPaymentAddress;
  /** Original raw address string (for diagnostics / receipts). */
  raw?: string;
}

/**
 * One concrete sender output (the receiver's per-`k` taproot output) ready
 * to be added to a PSBT.
 */
export interface SilentPaymentOutput {
  /** 32-byte x-only taproot key — the value of the output's scriptPubKey. */
  xOnlyPubKey: Uint8Array;
  /** Convenience: the matching mainnet/testnet P2TR address. */
  address: string;
  /** The recipient this output was generated for. */
  recipient: SilentPaymentRecipient;
}

/**
 * Compute the BIP-352 sender outputs for a fixed set of inputs and
 * recipients.
 *
 * The inputs MUST be the final set that will be signed and broadcast: the
 * recipient's output depends on the input set (via `outpoint_L` and `A`).
 * Adding, removing, or replacing an input invalidates the derived outputs.
 *
 * Throws if:
 *   - no inputs are given,
 *   - the summed private key is zero,
 *   - `input_hash` or any `t_k` would be an invalid scalar,
 *   - a recipient group exceeds `K_max = 2323` (per BIP-352).
 *
 * Recipients are grouped by scan key: multiple silent-payment addresses
 * sharing the same scan key share one ECDH derivation, and each receives
 * `k = 0, 1, …` in input order.
 *
 * `allOutpoints` is the outpoint of *every* input in the transaction —
 * including inputs that contribute to neither the BIP-352 ECDH sum nor
 * `outpoint_L`. Defaults to the outpoints of `eligibleInputs` (the common
 * case where every input is BIP-352-eligible, which is what the Agora HD
 * wallet always produces).
 */
export function deriveSilentPaymentOutputs(
  eligibleInputs: SilentPaymentInput[],
  recipients: SilentPaymentRecipient[],
  options: {
    allOutpoints?: ReadonlyArray<{ txid: string; vout: number }>;
    network?: SilentPaymentNetwork;
  } = {},
): SilentPaymentOutput[] {
  const network = options.network ?? 'mainnet';
  if (eligibleInputs.length === 0) {
    throw new Error('Silent payment: at least one eligible input is required.');
  }
  if (recipients.length === 0) return [];

  // ── Step 0: K_max check — fail before any crypto work ─────────────
  const groups = new Map<string, SilentPaymentRecipient[]>();
  for (const r of recipients) {
    const key = bytesToHexLocal(r.address.scanPubKey);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  for (const arr of groups.values()) {
    if (arr.length > K_MAX) {
      throw new Error(`Silent payment: recipient group exceeds K_max=${K_MAX}.`);
    }
  }

  // ── Step 1: compute a = Σ a_i (negating odd-Y taproot keys) ───────
  let aSum = 0n;
  for (const input of eligibleInputs) {
    if (input.privateKey.length !== 32) {
      throw new Error('Silent payment: input private key must be 32 bytes.');
    }
    let scalar = bytesToNumberBE(input.privateKey);
    if (scalar === 0n || scalar >= SECP_N) {
      throw new Error('Silent payment: input private key out of range.');
    }
    if (input.isTaproot) {
      // Per BIP-352: if x_only(a_i · G) has odd Y, negate a_i.
      const pub = Point.BASE.multiply(scalar).toBytes(true);
      if (pub[0] === 0x03) {
        scalar = SECP_N - scalar;
      }
    }
    aSum = (aSum + scalar) % SECP_N;
  }
  if (aSum === 0n) {
    throw new Error('Silent payment: sum of input private keys is zero.');
  }

  // A = a · G
  const aPub = Point.BASE.multiply(aSum).toBytes(true);

  // ── Step 2: outpoint_L = lex-smallest serialised outpoint ─────────
  const outpointsForHash =
    options.allOutpoints ?? eligibleInputs.map((i) => ({ txid: i.txid, vout: i.vout }));
  if (outpointsForHash.length === 0) {
    throw new Error('Silent payment: no outpoints provided.');
  }
  let smallest: Uint8Array | null = null;
  for (const op of outpointsForHash) {
    const ser = serializeOutpoint(op.txid, op.vout);
    if (smallest === null || compareBytes(ser, smallest) < 0) {
      smallest = ser;
    }
  }
  if (!smallest) throw new Error('Silent payment: no outpoints.');

  // ── Step 3: input_hash = hashBIP0352/Inputs(outpoint_L || serP(A)) ──
  const inputHash = taggedHash('BIP0352/Inputs', concatBytes(smallest, aPub));
  const inputHashScalar = bytesToNumberBE(inputHash);
  if (inputHashScalar === 0n || inputHashScalar >= SECP_N) {
    throw new Error('Silent payment: invalid input_hash.');
  }

  // ── Step 4: derive outputs per scan-key group ─────────────────────
  const out: SilentPaymentOutput[] = [];
  for (const group of groups.values()) {
    // ecdh = input_hash · a · B_scan
    //      = ((input_hash · a) mod n) · B_scan      (Point math)
    const scanPoint = Point.fromBytes(group[0].address.scanPubKey);
    const combinedScalar = (inputHashScalar * aSum) % SECP_N;
    if (combinedScalar === 0n) {
      throw new Error('Silent payment: input_hash · a is zero.');
    }
    const ecdh = scanPoint.multiply(combinedScalar).toBytes(true);

    let k = 0;
    for (const recipient of group) {
      const tK = taggedHash('BIP0352/SharedSecret', concatBytes(ecdh, u32be(k)));
      const tScalar = bytesToNumberBE(tK);
      if (tScalar === 0n || tScalar >= SECP_N) {
        throw new Error('Silent payment: invalid t_k.');
      }

      // P_k = B_spend + t_k · G
      const spendPoint = Point.fromBytes(recipient.address.spendPubKey);
      const P = spendPoint.add(Point.BASE.multiply(tScalar));
      if (P.is0()) {
        throw new Error('Silent payment: B_spend + t_k·G is point at infinity.');
      }
      const Pbytes = P.toBytes(true);

      // BIP-341 taproot output is the x-only of P.
      const xonly = new Uint8Array(Pbytes.subarray(1, 33));
      const addr = encodeP2TR(xonly, network);
      out.push({ xOnlyPubKey: xonly, address: addr, recipient });
      k++;
    }
  }

  return out;
}

/** Encode an x-only key as a P2TR address using `@scure/btc-signer`. */
function encodeP2TR(xonly: Uint8Array, network: SilentPaymentNetwork): string {
  const net = network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK;
  // `p2tr(xonly)` here is given the **output** key directly; passing it
  // without a script tree and reading `.address` yields the bech32m
  // encoding of `OP_1 push32 <xonly>` for the chosen network.
  const pay = btc.p2tr(xonly, undefined, net);
  if (!pay.address) {
    throw new Error('Silent payment: failed to encode P2TR address.');
  }
  return pay.address;
}

/**
 * BIP-86 child keys are not yet BIP-341-tweaked — `@scure/btc-signer`'s
 * `signIdx` applies the TapTweak internally when signing. BIP-352, however,
 * requires the **tweaked** Taproot scalar in `a = Σ a_i`. This helper
 * computes the tweaked key for a single-key (key-path-only, no script tree)
 * Taproot input.
 *
 * Equivalent to `taprootTweakPrivKey(child, undefined)`: applies the BIP-340
 * parity-flip + `taggedHash("TapTweak", x_only(child·G))` addition mod N.
 *
 * Re-exported here so callers don't have to dig into `@scure/btc-signer/utils`.
 */
export function bip86TweakedPrivateKey(child: Uint8Array): Uint8Array {
  return new Uint8Array(taprootTweakPrivKey(child));
}

// The `scalarBytes` helper is exported for the SP spend path, which needs
// to combine `b_spend` and `t_k` into a single signing scalar.
export { scalarBytes as encodeScalar };

export { SECP_N };
