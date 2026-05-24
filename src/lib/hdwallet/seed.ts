import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// ---------------------------------------------------------------------------
// Agora HD wallet — seed derivation (v2: BIP-39 mnemonic from nsec)
// ---------------------------------------------------------------------------
//
// Agora's wallet derives all of its Bitcoin keys from a 64-byte BIP-32 seed.
// This module is the single place that turns a user's Nostr secret key
// (nsec, 32 bytes) into that seed.
//
// **v2 derivation (current)** — load this when shipping new wallets and for
// every login made after this code went live. The pipeline is:
//
//   1. entropy = HKDF-SHA256(nsec, salt="", info="agora/v1", length=32)
//   2. mnemonic = BIP-39 encoding of (entropy + checksum byte) — 24 words
//   3. seed = PBKDF2-HMAC-SHA512(mnemonic, "mnemonic", iterations=2048, dkLen=64)
//
// The "agora/v1" info string is the version handle inside the v2 derivation
// scheme. v1 vs v2 is the Agora wallet generation (nsec-as-seed vs.
// mnemonic-as-seed). "agora/v1" identifies the first generation of the
// mnemonic-from-nsec scheme; if we ever needed to roll wallet keys without
// changing the nsec, we'd bump it to "agora/v2" — independent of the
// {v1,v2} naming used for the wallet-generation migration.
//
// Why HKDF instead of feeding `nsec` straight into BIP-39 entropy:
//
//   - The 24-word mnemonic is a one-way function of the nsec rather than an
//     encoding of it. A user who writes down the words (or pastes them into
//     a password manager / shares them with a "support agent") leaks only
//     their Bitcoin wallet — not their Nostr identity. With direct
//     `nsec → entropy`, the words are exactly the nsec and a leak is full
//     identity takeover.
//   - The `info` string is a versioning hook: bumping it derives a fresh,
//     independent wallet from the same nsec, with no on-chain link to the
//     old one.
//
// **v1 derivation (legacy, migration-only)** — see `seed.v1.ts`. v1 used the
// raw 32 bytes of the nsec directly as the BIP-32 master seed
// (`HDKey.fromMasterSeed(nsec)`). All addresses computed against a v1 seed
// differ from v2 addresses for the same nsec. The v1 module is kept solely
// so the migration sweep on `/wallet/migrate-v1` can spend old funds; new
// code paths should never call into it.
//
// ---------------------------------------------------------------------------

/**
 * HKDF `info` string for the v2 mnemonic-from-nsec derivation. Acts as a
 * domain separator: changing it derives an independent wallet from the same
 * nsec. The version embedded here is internal to the v2 scheme — it has no
 * relationship to the {v1,v2} wallet-generation labels used elsewhere in
 * Agora.
 */
export const AGORA_HKDF_INFO = 'agora/v1';

/**
 * Standard 24-word BIP-39 mnemonic — 256 bits of entropy + 8-bit checksum =
 * 264 bits / 11 bits-per-word = 24 words. We use 24 (not 12) so the
 * mnemonic encodes the full output of HKDF without throwing away half the
 * entropy.
 */
export const AGORA_MNEMONIC_WORDS = 24;

/**
 * Result of fully deriving a wallet seed from an nsec under the v2 scheme.
 *
 * All four buffers describe the same secret at different stages of the
 * pipeline. Consumers normally only need `seed` (to feed into `HDKey.
 * fromMasterSeed`) and `mnemonic` (to show the user as a backup).
 */
export interface AgoraWalletSeed {
  /**
   * The 32-byte HKDF-derived entropy. Encoded into the BIP-39 mnemonic.
   * Equivalent to `mnemonicToEntropy(mnemonic)` — exposed for tests and
   * for callers that want the raw bytes without round-tripping through
   * the wordlist.
   */
  entropy: Uint8Array;
  /**
   * BIP-39 24-word mnemonic. ASCII, space-separated, lowercase. Imports
   * cleanly into any BIP-39-compatible wallet (Sparrow, Electrum,
   * Trezor, Ledger, Phoenix, BlueWallet, etc.) at the `m/86'/0'/0'`
   * BIP-86 account path.
   */
  mnemonic: string;
  /**
   * The 64-byte BIP-32 seed produced by PBKDF2 over the mnemonic with the
   * BIP-39 standard salt `"mnemonic"` (no user passphrase). Pass to
   * `HDKey.fromMasterSeed` to obtain the BIP-32 root.
   */
  seed: Uint8Array;
}

/**
 * Derive the BIP-39 entropy for the v2 wallet from a 32-byte nsec.
 *
 * `entropy = HKDF-SHA256(ikm=nsec, salt="", info="agora/v1", length=32)`
 *
 * Exposed separately from {@link nsecToWalletSeed} so tests can lock the
 * HKDF output independently of the BIP-39 encoding step.
 */
export function nsecToWalletEntropy(nsecBytes: Uint8Array): Uint8Array {
  if (nsecBytes.length !== 32) {
    throw new Error('nsec must be 32 bytes');
  }
  // `hkdf(hash, ikm, salt, info, length)`. Passing `undefined` for salt
  // tells `@noble/hashes` to use the RFC 5869 default (a zero-byte string
  // of `hashLen`), which is what we want.
  return hkdf(sha256, nsecBytes, undefined, AGORA_HKDF_INFO, 32);
}

/**
 * Full v2 derivation: nsec → entropy → BIP-39 mnemonic → BIP-32 seed.
 *
 * The returned `seed` is what feeds into the rest of the HD wallet
 * (`HDKey.fromMasterSeed(seed)`). The returned `mnemonic` is what the
 * user backs up; it is **not** stored anywhere — callers re-derive it on
 * demand from the nsec.
 */
export function nsecToWalletSeed(nsecBytes: Uint8Array): AgoraWalletSeed {
  const entropy = nsecToWalletEntropy(nsecBytes);
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  return { entropy, mnemonic, seed };
}

/**
 * Verify that a user-provided mnemonic matches the one Agora derives from
 * their nsec. Used by tests and by the (future) "restore from words"
 * flow if we ever ship one. Pure function — no side effects.
 */
export function mnemonicMatchesNsec(mnemonic: string, nsecBytes: Uint8Array): boolean {
  let derived: Uint8Array;
  try {
    derived = mnemonicToEntropy(mnemonic, wordlist);
  } catch {
    return false;
  }
  const expected = nsecToWalletEntropy(nsecBytes);
  if (derived.length !== expected.length) return false;
  // Constant-time compare. The branch on length above is fine — both
  // sides are public-shape (32 bytes).
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= derived[i]! ^ expected[i]!;
  }
  return diff === 0;
}
