import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
import { bech32m } from '@scure/base';
import { extract as hkdfExtract, expand as hkdfExpand } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairAPI } from 'ecpair';

// ---------------------------------------------------------------------------
// Nostr-derived HD wallet (proposed NIP — "NostrWallet")
// ---------------------------------------------------------------------------
//
// Every Bitcoin-key derivation in this module starts from the user's 32-byte
// Nostr secret key (nsec), stretched through a two-step HKDF-SHA-256:
//
//     PRK            = HKDF-Extract(salt = "NostrWallet", IKM = nsec)
//     seed_<purpose> = HKDF-Expand(PRK, info = "NostrWallet/<Purpose>", L = 64)
//
// Each `seed_<purpose>` is then handed to a standard BIP-32 master derivation
// (`HMAC-SHA512("Bitcoin seed", seed)`, performed internally by
// `HDKey.fromMasterSeed`). After that point, derivations are bog-standard
// BIP-32 / BIP-86 / BIP-352 with no Nostr-specific tweaks.
//
// Why HKDF (not raw nsec → BIP-32)?
//
//   1. **Cross-protocol domain separation.** The nsec is also used for
//      Schnorr signing, NIP-04 ECDH, and NIP-44 ECDH. A future cryptanalytic
//      result against any of those that *wouldn't* have touched
//      independently-derived keys would otherwise propagate to the wallet.
//      The fixed salt `"NostrWallet"` ensures the Bitcoin sub-system is
//      cryptographically isolated from every other use of nsec.
//
//   2. **Intra-Bitcoin sub-domain separation.** The Taproot single-key
//      wallet (BIP-86) and the silent-payments wallet (BIP-352) each get
//      their own `info`-distinguished seed, so neither's BIP-32 master
//      reveals anything about the other.
//
//   3. **Recoverability.** The salt and info strings are protocol constants,
//      not per-app secrets, so the same nsec recovers the same wallet from
//      any "NostrWallet"-compliant client.
//
// **Note on interop with NIP-SP §2.2.** NIP-SP (draft) currently specifies
// that the nsec is itself the BIP-32 seed for silent payments. This module
// deliberately does *not* implement that — see the discussion in the
// silent-payments section below.
//
// Registered purposes:
//
//     "NostrWallet/Bip32"          — generic BIP-32 master for BIP-44/49/84/86
//     "NostrWallet/SilentPayments" — BIP-352 master
//
// ---------------------------------------------------------------------------

/** HKDF salt — protocol identifier for the proposed "NostrWallet" NIP. */
const HKDF_SALT = 'NostrWallet';

/** HKDF info tag for the generic BIP-32 hierarchy (BIP-44/49/84/86). */
const HKDF_INFO_BIP32 = 'NostrWallet/Bip32';

/** HKDF info tag for BIP-352 silent payments. */
const HKDF_INFO_SILENT_PAYMENTS = 'NostrWallet/SilentPayments';

// ---------------------------------------------------------------------------
// HD wallet derivation (BIP86 — Taproot single-key, key-path-only)
// ---------------------------------------------------------------------------
//
//     m / 86' / 0' / 0' / change / index
//
// `change ∈ {0, 1}` distinguishes the receive chain (external, advertised to
// senders) from the change chain (internal, only used as our own change
// outputs). Industry standard: never reuse addresses. The wallet always
// advances to the next unused index on the receive chain when an address is
// shown, and emits change to a fresh index on the change chain.
//
// Output script: P2TR with the derived xonly pubkey as `internalPubkey` (no
// tapscript tree — key-path spends only), per BIP86.
//
// ---------------------------------------------------------------------------

/** Standard BIP86 account base path. */
const BIP86_ACCOUNT_PATH = "m/86'/0'/0'";

/** External (receive) chain index. */
export const RECEIVE_CHAIN = 0;
/** Internal (change) chain index. */
export const CHANGE_CHAIN = 1;

/** Network — mainnet only. Testnet support is intentionally omitted. */
const NETWORK = bitcoin.networks.bitcoin;

// ---------------------------------------------------------------------------
// ECC initialisation (lazy)
// ---------------------------------------------------------------------------

let _ECPair: ECPairAPI | null = null;
let _eccInitialized = false;

/** Initialize bitcoinjs-lib's ECC backend exactly once. */
function ensureEcc(): void {
  if (!_eccInitialized) {
    bitcoin.initEccLib(ecc);
    _eccInitialized = true;
  }
}

function getECPair(): ECPairAPI {
  ensureEcc();
  if (!_ECPair) _ECPair = ECPairFactory(ecc);
  return _ECPair;
}

// ---------------------------------------------------------------------------
// Seed derivation (two-step HKDF: extract once, expand per purpose)
// ---------------------------------------------------------------------------

/**
 * Run HKDF-Extract over the nsec with the protocol salt. The returned PRK is
 * the input to every per-purpose `HKDF-Expand` below.
 *
 * Extract is `HMAC-SHA256(salt, IKM)` — deterministic for a given nsec, no
 * randomness, no per-device state. Cheap; could be cached by the caller if
 * many seeds are derived in one session.
 */
function nsecToPrk(nsecBytes: Uint8Array): Uint8Array {
  if (nsecBytes.length !== 32) {
    throw new Error('nsec must be 32 bytes');
  }
  return hkdfExtract(sha256, nsecBytes, HKDF_SALT);
}

/**
 * Derive a 64-byte BIP-32 seed for the given purpose. Pass the result to
 * `HDKey.fromMasterSeed` (which runs the standard BIP-32 master HMAC
 * internally).
 *
 * The `info` parameter is a protocol-defined ASCII tag (e.g.
 * `"NostrWallet/Bip32"`). Different tags produce cryptographically
 * independent seeds.
 */
function nsecToBip32SeedForPurpose(nsecBytes: Uint8Array, info: string): Uint8Array {
  const prk = nsecToPrk(nsecBytes);
  return hkdfExpand(sha256, prk, info, 64);
}

/**
 * Derive the 64-byte BIP-32 seed for the generic Bitcoin wallet branch
 * (BIP-44/49/84/86). Exported for callers that want to plug their own
 * BIP-32 derivation library in instead of `@scure/bip32`.
 */
export function nsecToBip32Seed(nsecBytes: Uint8Array): Uint8Array {
  return nsecToBip32SeedForPurpose(nsecBytes, HKDF_INFO_BIP32);
}

// ---------------------------------------------------------------------------
// HD key handles
// ---------------------------------------------------------------------------

/** Result of deriving the account-level xpub. */
export interface HdAccount {
  /** Account-level extended public key. Used to derive receive/change chains. */
  accountNode: HDKey;
  /** External-chain extended public key (m/86'/0'/0'/0). */
  receiveNode: HDKey;
  /** Internal/change-chain extended public key (m/86'/0'/0'/1). */
  changeNode: HDKey;
}

/**
 * Derive the BIP86 account hierarchy from a raw Nostr secret key.
 *
 * Returns extended **private** keys (so signing is possible). For balance
 * scanning, prefer `deriveWatchOnlyAccount` which only needs the xpub.
 */
export function deriveAccountFromNsec(nsecBytes: Uint8Array): HdAccount {
  const seed = nsecToBip32Seed(nsecBytes);
  const root = HDKey.fromMasterSeed(seed);
  const accountNode = root.derive(BIP86_ACCOUNT_PATH);
  const receiveNode = accountNode.deriveChild(RECEIVE_CHAIN);
  const changeNode = accountNode.deriveChild(CHANGE_CHAIN);
  return { accountNode, receiveNode, changeNode };
}

/**
 * Build the BIP86 output descriptor `tr(<xpub>)` for the supplied account.
 *
 * Blockbook accepts this form natively for `/api/v2/xpub/<descriptor>` and
 * uses it to derive Taproot addresses on both the receive (0) and change (1)
 * chains automatically. The raw base58 xpub by itself would default Blockbook
 * to BIP44 (legacy P2PKH); the `tr(...)` wrapper is what selects BIP86.
 *
 * The descriptor is URL-encoded by the caller before being put in the path —
 * `tr(...)` contains parens that must be percent-escaped.
 */
export function accountToBip86Descriptor(account: HdAccount): string {
  const xpub = account.accountNode.publicExtendedKey;
  return `tr(${xpub})`;
}

// ---------------------------------------------------------------------------
// Address derivation
// ---------------------------------------------------------------------------

/** A single derived address with everything needed to spend from it. */
export interface DerivedAddress {
  /** Bech32m P2TR address (bc1p…). */
  address: string;
  /** 32-byte x-only internal pubkey (hex). */
  internalPubkeyHex: string;
  /** Chain (0 = receive, 1 = change). */
  chain: 0 | 1;
  /** Address index within the chain. */
  index: number;
  /** Full BIP32 path, e.g. `m/86'/0'/0'/0/3`. */
  path: string;
}

/**
 * Derive a single P2TR address from a chain extended key (either the receive
 * or change node). The chain index is supplied so the returned `path` is
 * accurate.
 */
export function deriveAddress(chainNode: HDKey, chain: 0 | 1, index: number): DerivedAddress {
  ensureEcc();
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid address index: ${index}`);
  }

  const child = chainNode.deriveChild(index);
  const pubkey = child.publicKey;
  if (!pubkey) throw new Error('HDKey is missing a public key');

  // BIP86: drop the parity byte to get the 32-byte x-only key.
  const internalPubkey = Buffer.from(toXOnly(Buffer.from(pubkey)));

  const { address } = bitcoin.payments.p2tr({
    internalPubkey,
    network: NETWORK,
  });
  if (!address) throw new Error('Failed to derive P2TR address');

  return {
    address,
    internalPubkeyHex: internalPubkey.toString('hex'),
    chain,
    index,
    path: `${BIP86_ACCOUNT_PATH}/${chain}/${index}`,
  };
}

/** Convenience: derive a single receive address at the given index. */
export function deriveReceiveAddress(account: HdAccount, index: number): DerivedAddress {
  return deriveAddress(account.receiveNode, RECEIVE_CHAIN, index);
}

/** Convenience: derive a single change address at the given index. */
export function deriveChangeAddress(account: HdAccount, index: number): DerivedAddress {
  return deriveAddress(account.changeNode, CHANGE_CHAIN, index);
}

// ---------------------------------------------------------------------------
// Signing keys
// ---------------------------------------------------------------------------

/**
 * Derive the 32-byte raw private key for a specific (chain, index) leaf.
 *
 * The caller is responsible for zeroing the returned buffer when done (best
 * effort — JS does not guarantee this). This function is the only place where
 * leaf private keys are materialised.
 */
export function deriveLeafPrivateKey(
  account: HdAccount,
  chain: 0 | 1,
  index: number,
): Uint8Array {
  const chainNode = chain === RECEIVE_CHAIN ? account.receiveNode : account.changeNode;
  const child = chainNode.deriveChild(index);
  if (!child.privateKey) {
    throw new Error('Derived HDKey has no private key (xpub-only?)');
  }
  // Defensive copy — @scure/bip32 holds an internal reference.
  return new Uint8Array(child.privateKey);
}

/**
 * Compute the BIP-341 TapTweaked signing keypair for a given leaf. Returns an
 * ECPair instance whose private scalar is `priv + H_tapTweak(P)` mod n.
 *
 * Used by the PSBT signer.
 */
export function deriveLeafTaprootSigner(
  account: HdAccount,
  chain: 0 | 1,
  index: number,
): ReturnType<ECPairAPI['fromPrivateKey']> {
  const ECPair = getECPair();
  const privKey = deriveLeafPrivateKey(account, chain, index);
  try {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privKey));
    const internalPubkey = toXOnly(keyPair.publicKey);
    return keyPair.tweak(bitcoin.crypto.taggedHash('TapTweak', internalPubkey));
  } finally {
    // Best-effort wipe of the local copy.
    privKey.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Silent Payments (BIP-352) — receive address derivation
// ---------------------------------------------------------------------------
//
// A silent payment address (`sp1q…`) is a *static* receive identifier that the
// sender uses to derive a fresh, unlinkable Taproot output per payment. The
// recipient publishes one address forever; on-chain analysts cannot cluster
// payments to it because each output looks like a normal one-shot Taproot
// spend. There is no `change` / `index` hierarchy — the address is the public
// half of a (scan_key, spend_key) keypair.
//
// Derivation paths per BIP-352 §"Key Derivation":
//
//     spend: m / 352' / 0' / 0' / 0' / 0
//     scan:  m / 352' / 0' / 0' / 1' / 0
//
// (`352'` = purpose, `0'` = mainnet coin type, `0'` = account, `0'`/`1'` =
// spend vs scan, final `0` = key index. We only expose key index 0; there is
// no need to advance it since the address itself is intended to be reused.)
//
// Seed independence from the BIP-86 wallet:
//
//   SP uses its own HKDF info tag (`"NostrWallet/SilentPayments"`) so the
//   BIP-32 master here is cryptographically independent of the BIP-86
//   master derived above. Either branch's keys can leak without exposing
//   the other.
//
// **Divergence from NIP-SP §2.2.** NIP-SP (draft) specifies that the nsec
// itself is the BIP-32 seed for silent payments — i.e. no HKDF step. This
// module deliberately runs the same HKDF-Extract-then-Expand pipeline used
// for the BIP-86 wallet, because:
//
//   1. Domain separation from every other use of nsec (Schnorr, NIP-04,
//      NIP-44) is preserved.
//   2. NIP-SP is not yet finalized or adopted; this is the design we
//      believe should land in the spec.
//
// The cost is that an `sp1q…` derived here will not match an `sp1q…`
// derived by a NIP-SP §2.2 implementation from the same nsec. Senders use
// the recipient's published kind 10352 declaration to find the address
// regardless, so cross-client receive still works — but a user importing
// their nsec into a §2.2-only client will see a different address than
// they had here.
//
// Encoding:
//
//   - HRP: "sp" (mainnet only; testnet support is intentionally omitted)
//   - First 5-bit word: version byte (currently 0)
//   - Payload: scan_pubkey (33 bytes, compressed) || spend_pubkey (33 bytes,
//     compressed), re-encoded to 5-bit words.
//   - Checksum: bech32m. The default 90-char limit in BIP-173 is too short
//     for a 66-byte payload, so we pass `1023` (the BIP-350 max) to
//     `bech32m.encode`.
//
// This module only generates the *receive address* (what the recipient
// publishes). Scanning the chain for outputs sent to a silent payment
// address, and actually spending them, are separate problems that require
// BIP-352 ECDH per transaction — not yet implemented.
//
// ---------------------------------------------------------------------------

/** Bech32m HRP for mainnet silent payment addresses. */
const SILENT_PAYMENT_HRP = 'sp';

/** Current silent payment address version. */
const SILENT_PAYMENT_VERSION = 0;

/**
 * Bech32m length limit. BIP-352 addresses are 116 chars (well over the
 * default 90), so we lift the cap to BIP-350's permitted maximum.
 */
const BECH32M_MAX_LENGTH = 1023;

/** BIP-352 derivation paths. */
const SP_SPEND_PATH = "m/352'/0'/0'/0'/0";
const SP_SCAN_PATH = "m/352'/0'/0'/1'/0";

/** A derived silent payment address with the underlying public keys. */
export interface SilentPaymentAddress {
  /** Bech32m-encoded receive identifier (sp1q…). */
  address: string;
  /** 33-byte compressed scan pubkey (hex). */
  scanPubkeyHex: string;
  /** 33-byte compressed spend pubkey (hex). */
  spendPubkeyHex: string;
}

/**
 * Convert an 8-bit byte array to 5-bit words for bech32m encoding.
 *
 * Inlined here rather than imported because `@scure/base` only exposes the
 * inverse direction (`fromWords`) and the bytes-to-words conversion as
 * `toWords`. We use `toWords` directly via the library.
 */

/**
 * Derive the BIP-352 silent payment receive address from the user's nsec.
 *
 * The seed is HKDF-expanded with the `"NostrWallet/SilentPayments"` info
 * tag, giving a BIP-32 master that is cryptographically independent of the
 * BIP-86 wallet's master. See the section header above for the deliberate
 * divergence from NIP-SP §2.2.
 *
 * @param nsecBytes 32-byte raw Nostr secret key.
 * @returns The bech32m-encoded silent payment address plus the underlying
 *          scan and spend pubkeys (hex) for debugging / future scan support.
 */
export function deriveSilentPaymentAddress(nsecBytes: Uint8Array): SilentPaymentAddress {
  const seed = nsecToBip32SeedForPurpose(nsecBytes, HKDF_INFO_SILENT_PAYMENTS);
  const root = HDKey.fromMasterSeed(seed);

  const spendNode = root.derive(SP_SPEND_PATH);
  const scanNode = root.derive(SP_SCAN_PATH);

  const spendPubkey = spendNode.publicKey;
  const scanPubkey = scanNode.publicKey;
  if (!spendPubkey || !scanPubkey) {
    throw new Error('Failed to derive silent payment keys');
  }
  if (spendPubkey.length !== 33 || scanPubkey.length !== 33) {
    throw new Error('Expected compressed (33-byte) silent payment pubkeys');
  }

  // Payload: scan_pubkey || spend_pubkey (per BIP-352).
  const payload = new Uint8Array(66);
  payload.set(scanPubkey, 0);
  payload.set(spendPubkey, 33);

  // bech32m: first 5-bit word is the version, then payload as 5-bit words.
  const words = [SILENT_PAYMENT_VERSION, ...bech32m.toWords(payload)];
  const address = bech32m.encode(SILENT_PAYMENT_HRP, words, BECH32M_MAX_LENGTH);

  return {
    address,
    scanPubkeyHex: Buffer.from(scanPubkey).toString('hex'),
    spendPubkeyHex: Buffer.from(spendPubkey).toString('hex'),
  };
}

// ---------------------------------------------------------------------------
// Network constant export
// ---------------------------------------------------------------------------

export { NETWORK as HD_WALLET_NETWORK };
