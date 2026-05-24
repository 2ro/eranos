import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';
import { signSchnorr } from '@scure/btc-signer/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';

import { SECP_N } from './sender';

// ---------------------------------------------------------------------------
// BIP-352 Silent Payments — spend side
// ---------------------------------------------------------------------------
//
// `useHdWalletSp` discovers incoming silent-payment UTXOs by computing
// `shared = bscan · tweak` and walking `k = 0, 1, …` until no output
// matches. For each match it persists the per-output `t_k` tweak (32 bytes)
// in NIP-78 storage.
//
// To **spend** an SP UTXO, the wallet needs the private key matching the
// on-chain output key `P_k = B_spend + t_k · G`:
//
//     d_k = (b_spend + t_k) mod N
//
// `P_k` is already a Taproot output key (BIP-341 with no script tree); it
// is NOT tweaked again by `taggedHash("TapTweak", x_only(P_k))` the way a
// BIP-86 child key is. Consequently the signing scalar is `d_k` directly
// and we must bypass `@scure/btc-signer`'s automatic TapTweak (which would
// produce a signature that doesn't verify against `P_k`).
//
// The {@link signSpUtxoInput} helper below computes the BIP-341 sighash with
// `Transaction.preimageWitnessV1`, signs it with `d_k`, and writes the
// signature into the PSBT input's `tapKeySig`. `finalize()` then emits a
// valid key-path witness.
//
// `b_spend` and `d_k` are spend-capable — they sit at the same trust
// boundary as the BIP-86 leaf keys. Callers must zero the buffers when
// done (best effort in JS).
// ---------------------------------------------------------------------------

const { Point } = secp256k1;

/**
 * BIP-352 spend-key derivation path per BIP-352 §"Key Derivation".
 */
const SP_SPEND_PATH = "m/352'/0'/0'/0'/0";

/**
 * Derive the 32-byte spend private scalar `b_spend` from a BIP-32 master
 * seed. Same path the `deriveSilentPaymentAddress` /
 * `deriveSilentPaymentKeys` helpers use; co-located with the spend-side so
 * the security boundary is explicit.
 *
 * The seed length must be 16-64 bytes (BIP-32 §"Master key generation"
 * permits 128-512 bits). The v2 wallet always passes a 64-byte BIP-39
 * PBKDF2 seed; the v1 migration path passes the 32-byte legacy nsec
 * directly.
 *
 * Callers are responsible for zeroing the returned buffer when done.
 */
export function deriveSilentPaymentSpendKey(seed: Uint8Array): Uint8Array {
  if (seed.length < 16 || seed.length > 64) {
    throw new Error('BIP-32 seed must be 16-64 bytes');
  }
  const root = HDKey.fromMasterSeed(seed);
  const spendNode = root.derive(SP_SPEND_PATH);
  if (!spendNode.privateKey) {
    throw new Error('Failed to derive silent-payment spend private key');
  }
  // Defensive copy — `@scure/bip32` holds an internal reference.
  return new Uint8Array(spendNode.privateKey);
}

/**
 * Compute the spend scalar `d_k = (b_spend + t_k) mod N` for a single
 * silent-payment UTXO discovered by the receiver-side scanner.
 *
 * Throws if `b_spend + t_k` reduces to 0 (probability ≈ 2^-256; honest
 * indexers will never produce such a tweak, but a hostile one could in
 * principle, and signing with 0 would leak nothing useful — we fail
 * closed regardless).
 *
 * Returns a fresh 32-byte big-endian buffer. Callers should zero it when
 * done.
 */
export function deriveSpUtxoSigningKey(
  bSpend: Uint8Array,
  tweak: Uint8Array,
): Uint8Array {
  if (bSpend.length !== 32) throw new Error('b_spend must be 32 bytes');
  if (tweak.length !== 32) throw new Error('tweak must be 32 bytes');
  const a = bytesToNumberBE(bSpend);
  const b = bytesToNumberBE(tweak);
  if (a === 0n || a >= SECP_N) {
    throw new Error('b_spend out of range');
  }
  if (b === 0n || b >= SECP_N) {
    throw new Error('t_k out of range');
  }
  const d = (a + b) % SECP_N;
  if (d === 0n) {
    throw new Error('b_spend + t_k is zero mod N');
  }
  return numberToBytesBE(d, 32);
}

/**
 * Compute the 33-byte compressed `P_k = (b_spend + t_k) · G` for a stored
 * SP UTXO. Used to:
 *
 *   1. Build the witness UTXO's `scriptPubKey` (`OP_1 push32 x_only(P_k)`)
 *      when adding the input to the PSBT — Blockbook doesn't return that
 *      script natively for SP outputs, so we re-derive it locally.
 *   2. Verify (in tests / debug paths) that our signing key matches the
 *      on-chain output.
 */
export function deriveSpUtxoOutputPoint(
  bSpend: Uint8Array,
  tweak: Uint8Array,
): Uint8Array {
  const d = deriveSpUtxoSigningKey(bSpend, tweak);
  try {
    return Point.BASE.multiply(bytesToNumberBE(d)).toBytes(true);
  } finally {
    d.fill(0);
  }
}

/**
 * Compute the 32-byte x-only Taproot output key for a stored SP UTXO.
 */
export function deriveSpUtxoXOnly(
  bSpend: Uint8Array,
  tweak: Uint8Array,
): Uint8Array {
  return deriveSpUtxoOutputPoint(bSpend, tweak).subarray(1, 33);
}

/**
 * Build the standard P2TR `scriptPubKey` (`OP_1 push32 <xonly>`) for an SP
 * UTXO's on-chain output. 34 bytes.
 */
export function spP2trScriptPubKey(xonly: Uint8Array): Uint8Array {
  if (xonly.length !== 32) {
    throw new Error('p2tr scriptPubKey: xonly key must be 32 bytes');
  }
  const out = new Uint8Array(34);
  out[0] = 0x51; // OP_1
  out[1] = 0x20; // push 32 bytes
  out.set(xonly, 2);
  return out;
}

/**
 * Sign a single Taproot input that consumes a silent-payment UTXO.
 *
 * BIP-352 outputs ARE the output key on-chain — they are not BIP-341-
 * TapTweaked. `@scure/btc-signer.signIdx` would unconditionally apply
 * `taggedHash("TapTweak", x_only(P_k))` if we set `tapInternalKey =
 * x_only(P_k)` and asked it to sign with `d_k`, producing a signature
 * that doesn't verify against `P_k`. We sidestep that by:
 *
 *   1. Computing the BIP-341 sighash ourselves via
 *      {@link btc.Transaction.preimageWitnessV1}.
 *   2. Signing with `d_k` directly using BIP-340 Schnorr.
 *   3. Writing the result into `tapKeySig` so `finalize()` emits a normal
 *      key-path witness.
 *
 * Adjusts the signing scalar's parity per BIP-341 §"Constructing and
 * spending Taproot outputs": if `x_only(d · G)` has odd Y, sign with
 * `N - d` instead so the signature matches the x-only output key.
 *
 * `sighash` defaults to `SIGHASH_DEFAULT` (0x00), which produces a 64-byte
 * Schnorr signature (no trailing sighash byte). All other valid Taproot
 * sighash flags emit 65-byte signatures.
 */
export function signSpUtxoInput(
  tx: btc.Transaction,
  inputIndex: number,
  signingKey: Uint8Array,
  prevOutScripts: Uint8Array[],
  prevOutAmounts: bigint[],
  sighash: number = 0x00,
): void {
  if (signingKey.length !== 32) {
    throw new Error('SP signing key must be 32 bytes');
  }

  // BIP-340: signature is over the x-only pubkey. If x_only(d · G) has
  // odd Y, sign with (n - d) instead.
  let scalar = bytesToNumberBE(signingKey);
  if (scalar === 0n || scalar >= SECP_N) {
    throw new Error('SP signing key out of range');
  }
  const pub = Point.BASE.multiply(scalar).toBytes(true);
  if (pub[0] === 0x03) {
    scalar = SECP_N - scalar;
  }
  const adjusted = numberToBytesBE(scalar, 32);

  try {
    const hash = tx.preimageWitnessV1(
      inputIndex,
      prevOutScripts,
      sighash,
      prevOutAmounts,
    );
    const sig64 = signSchnorr(hash, adjusted);
    const sig =
      sighash === 0x00
        ? new Uint8Array(sig64)
        : (() => {
            const out = new Uint8Array(65);
            out.set(sig64, 0);
            out[64] = sighash;
            return out;
          })();
    // `_ignoreSignStatus = true` lets us write the partial-sig field
    // directly without `signIdx`'s own pubkey-match gate.
    tx.updateInput(inputIndex, { tapKeySig: sig }, true);
  } finally {
    adjusted.fill(0);
  }
}
