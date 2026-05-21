import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
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
// Network constant export
// ---------------------------------------------------------------------------

export { NETWORK as HD_WALLET_NETWORK };
