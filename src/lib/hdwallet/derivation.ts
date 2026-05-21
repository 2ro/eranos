import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
import { bech32m } from '@scure/base';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairAPI } from 'ecpair';

// ---------------------------------------------------------------------------
// Nostr-derived HD wallet
// ---------------------------------------------------------------------------
//
// Every Bitcoin-key derivation in this module starts from the user's 32-byte
// Nostr secret key (nsec), used directly as the BIP-32 master seed:
//
//     master = HMAC-SHA512("Bitcoin seed", nsec)
//
// (`@scure/bip32`'s `HDKey.fromMasterSeed` performs this HMAC internally.)
// From there, the Taproot single-key wallet (BIP-86) and the silent-payments
// wallet (BIP-352) branch off at their standard hardened paths under the
// shared master. BIP-32's hardened derivation guarantees that exposure of
// one branch's keys does not reveal the master or sibling branches.
//
// For silent payments, this matches NIP-SP §2.2 exactly — any
// NIP-SP-compliant client recovers the same `sp1q…` from the same nsec.
//
// Cross-protocol caveat: the nsec is also used for Schnorr signing, NIP-04
// ECDH, and NIP-44 ECDH. Reusing it as a BIP-32 seed is a deliberate
// trade-off — we get spec compliance and recoverability from `nsec` alone,
// at the cost of cross-protocol domain separation that an HKDF-stretched
// design would provide. In practice the operations on `nsec` in these
// protocols are independent enough that no known interaction leaks the
// scalar through any one of them.
//
// ---------------------------------------------------------------------------

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
// Seed derivation
// ---------------------------------------------------------------------------

/**
 * Build the BIP-32 master node from a raw Nostr secret key.
 *
 * The 32 bytes of nsec are the BIP-32 seed; `HDKey.fromMasterSeed` performs
 * the standard `HMAC-SHA512("Bitcoin seed", seed)` master step internally.
 * This is the same construction NIP-SP §2.2 specifies for silent payments,
 * and the BIP-86 wallet shares the same master node (branched off by
 * BIP-32's hardened derivation at the purpose level).
 */
function nsecToBip32Root(nsecBytes: Uint8Array): HDKey {
  if (nsecBytes.length !== 32) {
    throw new Error('nsec must be 32 bytes');
  }
  return HDKey.fromMasterSeed(nsecBytes);
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
  const root = nsecToBip32Root(nsecBytes);
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
// Derivation paths per BIP-352 §"Key Derivation" / NIP-SP §2.2:
//
//     master = HMAC-SHA512("Bitcoin seed", nsec)
//     spend  = master / 352' / 0' / 0' / 0' / 0
//     scan   = master / 352' / 0' / 0' / 1' / 0
//
// (`352'` = purpose, `0'` = mainnet coin type, `0'` = account, `0'`/`1'` =
// spend vs scan, final `0` = key index. We only expose key index 0; there is
// no need to advance it since the address itself is intended to be reused.)
//
// The nsec is used directly as the BIP-32 seed (no HKDF stretch), exactly
// as NIP-SP §2.2 specifies. This makes the resulting `sp1q…` address
// interoperable with every NIP-SP-compliant client: a user importing their
// nsec into any other NIP-SP implementation will see the same address.
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
 * Derive the BIP-352 / NIP-SP silent payment receive address from the user's nsec.
 *
 * Per NIP-SP §2.2, the nsec is the BIP-32 master seed — fed directly to
 * `HMAC-SHA512("Bitcoin seed", nsec)` (which `HDKey.fromMasterSeed`
 * performs internally). The same `sp1q…` is recoverable from the same nsec
 * in any NIP-SP-compliant client.
 *
 * @param nsecBytes 32-byte raw Nostr secret key.
 * @returns The bech32m-encoded silent payment address plus the underlying
 *          scan and spend pubkeys (hex) for debugging / future scan support.
 */
export function deriveSilentPaymentAddress(nsecBytes: Uint8Array): SilentPaymentAddress {
  const root = nsecToBip32Root(nsecBytes);

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
