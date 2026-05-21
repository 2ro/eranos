import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
import { bech32m } from '@scure/base';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairAPI } from 'ecpair';

// ---------------------------------------------------------------------------
// HD wallet derivation (BIP86 — Taproot single-key, key-path-only)
// ---------------------------------------------------------------------------
//
// This wallet derives a full BIP32 hierarchy from the user's Nostr secret key
// (nsec). There is no separate BIP39 mnemonic — the 32-byte secret key is
// stretched through HKDF-SHA-256 with an app-specific info string to a 64-byte
// BIP32 seed, then run through standard BIP86 derivation:
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

/** HKDF info string. Change ⇒ all derived wallets change. Do not edit. */
const HKDF_INFO = 'agora-hdwallet:bip86:v1';

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
 * Stretch a Nostr secret key (32 bytes) into a 64-byte BIP32 seed via
 * HKDF-SHA-256.
 *
 * - The Nostr secret key serves as input keying material (IKM).
 * - A fixed app-specific `info` string domain-separates the output from any
 *   other use of the same key (e.g. NIP-44 ECDH). This means the Bitcoin
 *   wallet cannot be recovered by anyone holding only a NIP-44 conversation
 *   key, only by someone holding the raw secret key itself.
 * - No salt: deterministic output for the same nsec across all devices.
 *
 * @param nsecBytes 32-byte raw Nostr secret key (the `data` field from
 *                  `nip19.decode(nsec)`).
 * @returns 64-byte seed suitable for `HDKey.fromMasterSeed`.
 */
export function nsecToBip32Seed(nsecBytes: Uint8Array): Uint8Array {
  if (nsecBytes.length !== 32) {
    throw new Error('nsec must be 32 bytes');
  }
  return hkdf(sha256, nsecBytes, undefined, HKDF_INFO, 64);
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
 * The derivation starts from the same HKDF-stretched BIP32 seed as the BIP86
 * receive chain — *not* from the BIP86 account node. SP uses its own
 * `352'` purpose branch, so it is derivationally independent of the Taproot
 * single-key wallet, even though it shares the same root seed.
 *
 * @param nsecBytes 32-byte raw Nostr secret key.
 * @returns The bech32m-encoded silent payment address plus the underlying
 *          scan and spend pubkeys (hex) for debugging / future scan support.
 */
export function deriveSilentPaymentAddress(nsecBytes: Uint8Array): SilentPaymentAddress {
  const seed = nsecToBip32Seed(nsecBytes);
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
