/**
 * Grin payment-proof verification — the trust layer behind the campaign
 * fundraising tally (the GRIN replacement for the old kind-8333 BTC receipts).
 *
 * A Grin payment proof (per the Grin spec,
 * https://docs.grin.mw/wiki/transactions/payment-proofs/) binds an `amount`,
 * the transaction's **kernel excess commitment** (the on-chain anchor), the
 * **sender address**, and the **receiver address** — with the receiver's
 * ed25519 signature over `amount (u64 BE) || kernel_excess (33) ||
 * sender_address (32)`. The addresses are Slatepack addresses: bech32
 * (`grin1…`) encodings of 32-byte ed25519 public keys.
 *
 * A donation counts toward a campaign's pot when (per Plan 2, C4):
 *  (a) the receiver address matches the campaign's published Grin identity,
 *  (b) the receiver signature verifies,
 *  (c) the kernel is on-chain (checked via a Grin node read), and
 *  (d) it isn't a duplicate (dedupe by kernel excess).
 *
 * The GoblinPay path uses the server-signed receipt object instead (BIP-340
 * Schnorr over SHA-256 of the canonical receipt JSON — the same scheme Nostr
 * events use). See `verifySignedReceipt`.
 *
 * This module never reimplements Grin crypto: signatures verify with
 * `@noble/curves` (ed25519 / BIP-340 secp256k1), and kernel presence is a
 * read against a Grin node's foreign API. The only Grin-specific logic here
 * is the documented, consensus-stable proof-message serialization (mirroring
 * upstream `libwallet::internal::tx::payment_proof_message`).
 */

import { ed25519 } from '@noble/curves/ed25519';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bech32 } from '@scure/base';
import type { NostrEvent } from '@nostrify/nostrify';

import { NANOGRIN_PER_GRIN } from '@/lib/goblinPay';

/**
 * Kind for a published Grin-donation receipt event.
 *
 * Convention mirrors the retired kind 8333 (the Bitcoin mainnet P2P port,
 * itself mirroring NIP-57's 9735 = Lightning port): **3414 is the Grin
 * mainnet P2P port**.
 *
 * Event shape:
 * - `content`: JSON — either a Grin payment proof object (the `grin1` path;
 *   see {@link parseReceiverProof} for accepted shapes) or a GoblinPay
 *   signed receipt `{ receipt: {...}, sig }` (the GoblinPay path).
 * - tags: `["a", "33863:<pubkey>:<d>"]` (the campaign), `["p", <campaign
 *   author>]`, and an `alt` description.
 */
export const GRIN_DONATION_KIND = 3414;

const ADDRESS_LEN = 32;
const SIGNATURE_LEN = 64;
const COMMITMENT_LEN = 33;

/** A normalized receiver-side Grin payment proof (all byte fields decoded). */
export interface GrinReceiverProof {
  /** Amount in nanogrin (bigint — the signed message uses the full u64 range). */
  amount: bigint;
  /** 33-byte kernel excess commitment — the on-chain anchor. */
  kernelExcess: Uint8Array;
  /** Payer's proof address (32-byte ed25519 key). */
  senderAddress: Uint8Array;
  /** Receiver's proof address (32-byte ed25519 key) — the signature verifies against this. */
  recipientAddress: Uint8Array;
  /** Receiver's ed25519 signature over the proof message (64 bytes). */
  recipientSig: Uint8Array;
}

// ─── hex / bech32 helpers ────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(hex: string, expectedLen?: number): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  if (expectedLen !== undefined && out.length !== expectedLen) return null;
  return out;
}

/**
 * Decode a Slatepack address (`grin1…` mainnet, `tgrin1…` testnet) to its
 * 32-byte ed25519 public key. Returns `null` for anything malformed.
 */
export function decodeSlatepackAddress(address: string): Uint8Array | null {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed.startsWith('grin1') && !trimmed.startsWith('tgrin1')) return null;
  try {
    const { words } = bech32.decode(trimmed as `${string}1${string}`, 1000);
    const bytes = bech32.fromWords(words);
    return bytes.length === ADDRESS_LEN ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

/** Is this a well-formed Slatepack address? (bech32 checksum + key length) */
export function isValidSlatepackAddress(address: string): boolean {
  return decodeSlatepackAddress(address) !== null;
}

/** Accept a proof address as either 64-char hex or a `grin1…` Slatepack address. */
function decodeProofAddress(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const asHex = hexToBytes(value, ADDRESS_LEN);
  if (asHex) return asHex;
  return decodeSlatepackAddress(value);
}

/**
 * Accept an amount as nanogrin (number or integer string) or as a decimal
 * GRIN string (contains a `.`, at most 9 decimals — the format some wallet
 * proof exports use). Returns `null` for anything non-positive or malformed.
 */
function decodeProofAmount(value: unknown): bigint | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return BigInt(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = BigInt(trimmed);
    return n > 0n ? n : null;
  }
  if (/^\d+\.\d{1,9}$/.test(trimmed)) {
    const [whole, frac] = trimmed.split('.');
    const n = BigInt(whole) * BigInt(NANOGRIN_PER_GRIN) + BigInt(frac.padEnd(9, '0'));
    return n > 0n ? n : null;
  }
  return null;
}

// ─── proof parsing + verification ────────────────────────────────────

/**
 * Parse a payment-proof JSON object into a normalized {@link GrinReceiverProof}.
 *
 * Accepts both wire shapes in circulation:
 * - GoblinPay's `ReceiverProof`: `{ amount, kernel_excess, sender_address,
 *   recipient_address, recipient_sig }` with hex addresses and nanogrin amount.
 * - grin-wallet proof exports: `{ amount, excess, sender_address,
 *   recipient_address, recipient_sig, sender_sig? }` with `grin1…` addresses.
 *
 * Returns `null` on any malformed field (a proof that does not parse is
 * simply not a proof).
 */
export function parseReceiverProof(input: unknown): GrinReceiverProof | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;

  const amount = decodeProofAmount(obj.amount);
  const excessField = obj.kernel_excess ?? obj.excess;
  const kernelExcess = typeof excessField === 'string' ? hexToBytes(excessField, COMMITMENT_LEN) : null;
  const senderAddress = decodeProofAddress(obj.sender_address);
  const recipientAddress = decodeProofAddress(obj.recipient_address);
  const recipientSig =
    typeof obj.recipient_sig === 'string' ? hexToBytes(obj.recipient_sig, SIGNATURE_LEN) : null;

  if (amount === null || !kernelExcess || !senderAddress || !recipientAddress || !recipientSig) {
    return null;
  }
  return { amount, kernelExcess, senderAddress, recipientAddress, recipientSig };
}

/**
 * Canonical payment-proof message, byte-identical to upstream grin-wallet's
 * `payment_proof_message`: amount as big-endian u64, then the 33-byte kernel
 * excess commitment, then the 32-byte sender ed25519 address.
 */
export function proofMessage(proof: GrinReceiverProof): Uint8Array {
  const msg = new Uint8Array(8 + COMMITMENT_LEN + ADDRESS_LEN);
  let amount = proof.amount;
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(amount & 0xffn);
    amount >>= 8n;
  }
  msg.set(proof.kernelExcess, 8);
  msg.set(proof.senderAddress, 8 + COMMITMENT_LEN);
  return msg;
}

/**
 * Verify the receiver signature of a payment proof (check (b) of the tally
 * rule). Pure crypto — on-chain existence of the kernel is a separate node
 * read ({@link kernelOnChain}), and receiver-address binding to a campaign
 * is the caller's check ({@link verifyDonationEvent}).
 */
export function verifyReceiverProof(proof: GrinReceiverProof): boolean {
  try {
    return ed25519.verify(proof.recipientSig, proofMessage(proof), proof.recipientAddress);
  } catch {
    return false;
  }
}

// ─── kernel on-chain check (Grin node foreign API) ───────────────────

export interface KernelStatus {
  /** The kernel is included in a block on the node's current chain. */
  onChain: boolean;
  /** Block height the kernel landed at (present iff `onChain`). */
  height?: number;
}

/**
 * Check whether a kernel excess is on-chain via a Grin node's foreign API
 * (`get_kernel` JSON-RPC at `{nodeUrl}/v2/foreign`) — check (c) of the tally
 * rule. `Err: "NotFound"` means "not (yet) on chain"; any transport or
 * protocol error rejects so a flaky node can never silently zero (or
 * inflate) a tally.
 */
export async function kernelOnChain(
  nodeUrl: string,
  kernelExcessHex: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<KernelStatus> {
  const excess = hexToBytes(kernelExcessHex, COMMITMENT_LEN);
  if (!excess) throw new Error('kernel excess must be 33 bytes of hex');

  const res = await fetchFn(`${nodeUrl.replace(/\/+$/, '')}/v2/foreign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'get_kernel',
      params: [bytesToHex(excess), null, null],
      id: 1,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`node get_kernel failed (${res.status})`);
  const json: unknown = await res.json();
  const result = (json as Record<string, unknown> | null)?.result;
  if (!result || typeof result !== 'object') throw new Error('node get_kernel returned no result');
  const { Ok, Err } = result as { Ok?: unknown; Err?: unknown };
  if (Err !== undefined) {
    // "NotFound" is the node's well-formed answer for a kernel that has not
    // landed; anything else is a real error.
    if (Err === 'NotFound') return { onChain: false };
    throw new Error(`node get_kernel error: ${JSON.stringify(Err)}`);
  }
  if (Ok && typeof Ok === 'object' && typeof (Ok as Record<string, unknown>).height === 'number') {
    return { onChain: true, height: (Ok as Record<string, unknown>).height as number };
  }
  throw new Error('node get_kernel returned an unexpected shape');
}

// ─── GoblinPay signed receipts (BIP-340) ─────────────────────────────

/** The GoblinPay receipt payload (see GoblinPay `gp-nostr::receipt`). */
export interface GoblinPayReceipt {
  version: number;
  /** Payment id (the Grin slate UUID). */
  payment_id: string;
  /** Amount in nanogrin. */
  amount: number;
  /** Kernel excess commitment, hex — the on-chain anchor. */
  kernel_excess: string;
  confirmed_height: number | null;
  confirmations: number | null;
  /** Embedded receiver-side payment proof, when the payer requested one. */
  proof: unknown;
  issued_at: string;
  /** The signing server's x-only pubkey, hex. */
  server_pubkey: string;
}

/** A receipt plus the server's BIP-340 Schnorr signature over it. */
export interface GoblinPaySignedReceipt {
  receipt: GoblinPayReceipt;
  /** 64-byte Schnorr signature, hex. */
  sig: string;
}

/** Parse a `{ receipt, sig }` object, tolerating missing optionals. Returns `null` if malformed. */
export function parseSignedReceipt(input: unknown): GoblinPaySignedReceipt | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const receipt = obj.receipt;
  if (!receipt || typeof receipt !== 'object' || typeof obj.sig !== 'string') return null;
  const r = receipt as Record<string, unknown>;
  if (
    typeof r.version !== 'number' ||
    typeof r.payment_id !== 'string' ||
    typeof r.amount !== 'number' ||
    typeof r.kernel_excess !== 'string' ||
    typeof r.issued_at !== 'string' ||
    typeof r.server_pubkey !== 'string'
  ) {
    return null;
  }
  return {
    receipt: {
      version: r.version,
      payment_id: r.payment_id,
      amount: r.amount,
      kernel_excess: r.kernel_excess.toLowerCase(),
      confirmed_height: typeof r.confirmed_height === 'number' ? r.confirmed_height : null,
      confirmations: typeof r.confirmations === 'number' ? r.confirmations : null,
      proof: r.proof ?? null,
      issued_at: r.issued_at,
      server_pubkey: r.server_pubkey.toLowerCase(),
    },
    sig: obj.sig,
  };
}

/**
 * Serialize arbitrary JSON with object keys sorted, matching serde_json's
 * `Value` (BTreeMap) round-trip that GoblinPay applies to the embedded
 * `proof` before signing.
 */
function canonicalJsonValue(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJsonValue(v)}`);
    return `{${entries.join(',')}}`;
  }
  return 'null';
}

/**
 * The canonical receipt JSON GoblinPay signs: compact, with the struct's
 * declaration field order (serde serializes structs in declaration order).
 */
export function receiptCanonicalJson(receipt: GoblinPayReceipt): string {
  const fields = [
    `"version":${JSON.stringify(receipt.version)}`,
    `"payment_id":${JSON.stringify(receipt.payment_id)}`,
    `"amount":${JSON.stringify(receipt.amount)}`,
    `"kernel_excess":${JSON.stringify(receipt.kernel_excess)}`,
    `"confirmed_height":${JSON.stringify(receipt.confirmed_height)}`,
    `"confirmations":${JSON.stringify(receipt.confirmations)}`,
    `"proof":${canonicalJsonValue(receipt.proof)}`,
    `"issued_at":${JSON.stringify(receipt.issued_at)}`,
    `"server_pubkey":${JSON.stringify(receipt.server_pubkey)}`,
  ];
  return `{${fields.join(',')}}`;
}

/**
 * Verify a GoblinPay signed receipt: BIP-340 Schnorr over SHA-256 of the
 * canonical receipt JSON, against the `server_pubkey` embedded in the
 * receipt. Callers must still decide whether they trust that pubkey (the
 * tally requires it to be the campaign's declared GoblinPay signer, or the
 * event to come from the campaign author — see {@link verifyDonationEvent}).
 */
export function verifySignedReceipt(signed: GoblinPaySignedReceipt): boolean {
  const pubkey = hexToBytes(signed.receipt.server_pubkey, 32);
  const sig = hexToBytes(signed.sig, SIGNATURE_LEN);
  if (!pubkey || !sig) return false;
  try {
    const digest = sha256(new TextEncoder().encode(receiptCanonicalJson(signed.receipt)));
    return schnorr.verify(sig, digest, pubkey);
  } catch {
    return false;
  }
}

// ─── donation events (kind 3414) ─────────────────────────────────────

/** The campaign identity fields a donation must bind to. */
export interface CampaignGrinIdentity {
  /** Campaign author hex pubkey. */
  pubkey: string;
  /** The campaign's published `grin1…` Slatepack address, if any. */
  grinAddress?: string;
  /** The campaign's declared GoblinPay receipt-signer pubkey (x-only hex), if any. */
  goblinPaySignerPubkey?: string;
}

/** A donation that passed all signature-level checks (kernel check is separate). */
export interface VerifiedDonation {
  /** Amount in nanogrin. */
  amount: bigint;
  /** Kernel excess hex — the dedupe key and the on-chain anchor. */
  kernelExcessHex: string;
  /** Which trust path verified it. */
  path: 'proof' | 'goblinpay';
}

/**
 * Verify a kind-3414 donation event's content against a campaign identity
 * (checks (a) and (b) of the tally rule; kernel-on-chain and dedupe are the
 * caller's job so node reads can be batched per unique kernel).
 *
 * Two accepted shapes:
 *
 * 1. **Bare payment proof** (the `grin1` path, publishable by anyone): the
 *    proof's receiver address must equal the campaign's published `grin1`
 *    address and the receiver signature must verify. Fully trustless.
 *
 * 2. **GoblinPay signed receipt**: the BIP-340 receipt signature must verify,
 *    AND either the event author is the campaign owner (the owner attests
 *    the receipt is theirs) or the receipt's `server_pubkey` equals the
 *    campaign's declared GoblinPay signer. Note the receipt binds an amount
 *    to a kernel, not to a campaign — the campaign's declaration (or the
 *    owner's authorship) is what scopes it; kernel dedupe prevents reuse.
 */
export function verifyDonationEvent(
  event: NostrEvent,
  campaign: CampaignGrinIdentity,
): VerifiedDonation | null {
  if (event.kind !== GRIN_DONATION_KIND) return null;
  if (event.content.length > 65536) return null;

  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return null;
  }

  // GoblinPay signed receipt.
  const signed = parseSignedReceipt(content);
  if (signed) {
    if (!verifySignedReceipt(signed)) return null;
    const fromOwner = event.pubkey === campaign.pubkey;
    const fromDeclaredServer =
      !!campaign.goblinPaySignerPubkey &&
      signed.receipt.server_pubkey === campaign.goblinPaySignerPubkey.toLowerCase();
    if (!fromOwner && !fromDeclaredServer) return null;
    if (!Number.isSafeInteger(signed.receipt.amount) || signed.receipt.amount <= 0) return null;
    if (!hexToBytes(signed.receipt.kernel_excess, COMMITMENT_LEN)) return null;
    return {
      amount: BigInt(signed.receipt.amount),
      kernelExcessHex: signed.receipt.kernel_excess,
      path: 'goblinpay',
    };
  }

  // Bare payment proof (grin1 path).
  const proof = parseReceiverProof(content);
  if (proof) {
    if (!campaign.grinAddress) return null;
    const campaignKey = decodeSlatepackAddress(campaign.grinAddress);
    if (!campaignKey) return null;
    if (bytesToHex(proof.recipientAddress) !== bytesToHex(campaignKey)) return null;
    if (!verifyReceiverProof(proof)) return null;
    return {
      amount: proof.amount,
      kernelExcessHex: bytesToHex(proof.kernelExcess),
      path: 'proof',
    };
  }

  return null;
}
