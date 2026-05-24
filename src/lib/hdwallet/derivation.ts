import { HDKey } from '@scure/bip32';
import { bech32m, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

// ---------------------------------------------------------------------------
// Nostr-derived HD wallet
// ---------------------------------------------------------------------------
//
// Every Bitcoin-key derivation in this module starts from a 64-byte BIP-32
// seed produced by the v2 derivation pipeline in `./seed.ts`:
//
//   nsec (32B) → HKDF-SHA256("agora/v1") → entropy (32B)
//              → BIP-39 24-word mnemonic
//              → PBKDF2-HMAC-SHA512("mnemonic") → seed (64B)
//
// The seed is fed to `HDKey.fromMasterSeed(seed)`, which performs
// `HMAC-SHA512("Bitcoin seed", seed)` internally to produce the BIP-32
// master node. From there, the Taproot single-key wallet (BIP-86) and the
// silent-payments wallet (BIP-352) branch off at their standard hardened
// paths under the shared master. BIP-32's hardened derivation guarantees
// that exposure of one branch's keys does not reveal the master or sibling
// branches.
//
// Because the seed is the standard BIP-39 PBKDF2 output, a user who backs
// up their 24-word mnemonic can import these wallets into any
// BIP-39-compatible wallet (Sparrow, Electrum, Trezor, Ledger, Phoenix,
// BlueWallet, …) at the same BIP-86 / BIP-352 paths.
//
// The previous derivation (`./seed.v1.ts`) used the raw nsec as the BIP-32
// seed directly. v1 addresses are different from v2 addresses for the
// same nsec; v1 funds are recovered by the migration sweep at
// `/wallet/migrate-v1`.
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
const NETWORK = btc.NETWORK;

// ---------------------------------------------------------------------------
// BIP-32 master from BIP-39 seed
// ---------------------------------------------------------------------------

/**
 * Build the BIP-32 master node from a BIP-32 master seed.
 *
 * v2 callers pass the 64-byte BIP-39 PBKDF2 seed from
 * `nsecToWalletSeed(nsec).seed`. The v1 migration path passes the
 * 32-byte raw nsec directly. BIP-32 permits any seed length from 16 to
 * 64 bytes; `HDKey.fromMasterSeed` performs the standard
 * `HMAC-SHA512("Bitcoin seed", seed)` master step internally.
 */
function seedToBip32Root(seed: Uint8Array): HDKey {
  if (seed.length < 16 || seed.length > 64) {
    throw new Error('BIP-32 seed must be 16-64 bytes');
  }
  return HDKey.fromMasterSeed(seed);
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
 * Derive the BIP86 account hierarchy from a 64-byte BIP-39 seed.
 *
 * Returns extended **private** keys (so signing is possible). For balance
 * scanning, prefer building from the account-level xpub only.
 */
export function deriveAccountFromSeed(seed: Uint8Array): HdAccount {
  const root = seedToBip32Root(seed);
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
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid address index: ${index}`);
  }

  const child = chainNode.deriveChild(index);
  const pubkey = child.publicKey;
  if (!pubkey) throw new Error('HDKey is missing a public key');
  if (pubkey.length !== 33) {
    throw new Error('Expected compressed (33-byte) child pubkey');
  }

  // BIP86: drop the parity byte to get the 32-byte x-only key.
  const internalPubkey = pubkey.slice(1, 33);

  const { address } = btc.p2tr(internalPubkey, undefined, NETWORK);
  if (!address) throw new Error('Failed to derive P2TR address');

  return {
    address,
    internalPubkeyHex: hex.encode(internalPubkey),
    chain,
    index,
    path: `${BIP86_ACCOUNT_PATH}/${chain}/${index}`,
  };
}

/** Convenience: derive a single receive address at the given index. */
export function deriveReceiveAddress(account: HdAccount, index: number): DerivedAddress {
  return deriveAddress(account.receiveNode, RECEIVE_CHAIN, index);
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
 *
 * `@scure/btc-signer.signIdx` accepts this raw private key directly and, for
 * inputs that carry a `tapInternalKey`, internally applies the BIP-341
 * TapTweak before producing a Schnorr signature. There is no need to expose a
 * pre-tweaked signer object the way the bitcoinjs-lib/ecpair stack did.
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
//     master = HMAC-SHA512("Bitcoin seed", seed)
//     spend  = master / 352' / 0' / 0' / 0' / 0
//     scan   = master / 352' / 0' / 0' / 1' / 0
//
// (`352'` = purpose, `0'` = mainnet coin type, `0'` = account, `0'`/`1'` =
// spend vs scan, final `0` = key index. We only expose key index 0; there is
// no need to advance it since the address itself is intended to be reused.)
//
// The BIP-32 master is derived from the v2 64-byte seed (BIP-39 PBKDF2
// over the mnemonic Agora derives from the user's nsec). Wallets that
// import the same mnemonic at the BIP-352 path recover the same address.
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
// BIP-352 ECDH per transaction — see `./sp/scanner.ts` and `./sp/spend.ts`.
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
 * Receive-side silent-payment key material, including the *private* scan key.
 *
 * Per BIP-352, scanning the chain for incoming silent payments requires
 * `bscan` (the 32-byte scan private scalar) to complete the ECDH step
 * locally: `shared = bscan · tweak`. Because `bscan` is derived under a
 * hardened branch, disclosing it does not reveal the master seed or the
 * spend private key — it grants only "see incoming payments" capability.
 * BIP-352 explicitly contemplates handing `bscan` to a remote scan helper
 * for that reason (we don't do that here; `bscan` stays on the device).
 *
 * `bspend` is **deliberately omitted** from this struct. The HD wallet is
 * receive-only with respect to silent payments; we never sign SP inputs, so
 * the spend private key never needs to be materialised. If spend support is
 * added later, a dedicated helper should derive `bspend` at signing time.
 */
export interface SilentPaymentKeys {
  /** 33-byte compressed scan pubkey. */
  Bscan: Uint8Array;
  /** 33-byte compressed spend pubkey. */
  Bspend: Uint8Array;
  /**
   * 32-byte scan private scalar. MUST stay on the device — disclosure grants
   * watch-only privacy break (every incoming SP payment becomes observable).
   * Does NOT enable spending.
   */
  bscan: Uint8Array;
  /** Bech32m-encoded `sp1q…` address built from `(Bscan, Bspend)`. */
  address: string;
}

/**
 * Derive the BIP-352 silent payment receive address from a 64-byte
 * BIP-39 seed.
 *
 * @param seed 64-byte BIP-32 seed (the `seed` field of
 *             `nsecToWalletSeed(nsec)`).
 * @returns The bech32m-encoded silent payment address plus the underlying
 *          scan and spend pubkeys (hex) for debugging / future scan support.
 */
export function deriveSilentPaymentAddress(seed: Uint8Array): SilentPaymentAddress {
  const root = seedToBip32Root(seed);

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
    scanPubkeyHex: hex.encode(scanPubkey),
    spendPubkeyHex: hex.encode(spendPubkey),
  };
}

/**
 * Same derivation as {@link deriveSilentPaymentAddress}, but additionally
 * returns the *scan private key* `bscan`. Required by the BIP-352 receiver-side
 * scanner (`src/lib/hdwallet/sp/`) which must compute `shared = bscan · tweak`
 * locally to detect incoming silent payments.
 *
 * `bspend` is **not** returned — see {@link SilentPaymentKeys} for the
 * receive-only rationale. Disclosure of `bscan` alone never lets an attacker
 * spend; it only lets them see the wallet's incoming SP payments.
 */
export function deriveSilentPaymentKeys(seed: Uint8Array): SilentPaymentKeys {
  const root = seedToBip32Root(seed);

  const spendNode = root.derive(SP_SPEND_PATH);
  const scanNode = root.derive(SP_SCAN_PATH);

  const Bspend = spendNode.publicKey;
  const Bscan = scanNode.publicKey;
  const bscan = scanNode.privateKey;
  if (!Bspend || !Bscan || !bscan) {
    throw new Error('Failed to derive silent payment keys');
  }
  if (Bspend.length !== 33 || Bscan.length !== 33) {
    throw new Error('Expected compressed (33-byte) silent payment pubkeys');
  }
  if (bscan.length !== 32) {
    throw new Error('Expected 32-byte silent payment scan private key');
  }

  // Payload: scan_pubkey || spend_pubkey (per BIP-352).
  const payload = new Uint8Array(66);
  payload.set(Bscan, 0);
  payload.set(Bspend, 33);
  const words = [SILENT_PAYMENT_VERSION, ...bech32m.toWords(payload)];
  const address = bech32m.encode(SILENT_PAYMENT_HRP, words, BECH32M_MAX_LENGTH);

  // Defensive copies — @scure/bip32 holds internal references.
  return {
    Bscan: new Uint8Array(Bscan),
    Bspend: new Uint8Array(Bspend),
    bscan: new Uint8Array(bscan),
    address,
  };
}

// ---------------------------------------------------------------------------
// Network constant export
// ---------------------------------------------------------------------------

export { NETWORK as HD_WALLET_NETWORK };
