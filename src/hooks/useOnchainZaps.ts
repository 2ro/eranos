import type { NostrEvent } from '@nostrify/nostrify';

import { fetchTxDetail, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { CAMPAIGN_KIND } from '@/lib/campaign';
/** A single verified on-chain zap, with the amount that actually paid the recipient(s) on-chain. */
export interface OnchainZapEntry {
  /** The kind 8333 event. */
  event: NostrEvent;
  /** Bitcoin transaction id (lowercase hex). */
  txid: string;
  /** Pubkey of the sender (the 8333 event author). */
  senderPubkey: string;
  /**
   * Pubkeys of the recipients (one per `p` tag). For identity zaps this has
   * length 1 (or more for batch community zaps). For campaign donations
   * (kind 33863 targets) this is always empty — campaigns are not
   * Nostr-identity recipients and the receipt carries no `p` tags.
   */
  recipientPubkeys: string[];
  /**
   * Verified total in sats — sum of tx outputs paying any expected
   * destination. In identity-recipient mode this is "any of the listed
   * recipients' derived Taproot addresses." In campaign-wallet mode
   * (target is a kind 33863 campaign) it is "outputs paying the campaign's
   * `w` address." Excludes the sender's change output in either case.
   */
  amountSats: number;
  /** Sender's self-reported amount tag (may differ from verified). */
  claimedAmountSats: number;
  /** Comment from the 8333 event content. */
  comment: string;
  /** Unix timestamp of the 8333 event. */
  createdAt: number;
  /** Whether the Bitcoin tx is confirmed on-chain. */
  confirmed: boolean;
}

/** Parse the txid from a kind 8333 event's `i` tag. Returns null if missing or malformed. */
export function extractOnchainZapTxid(event: NostrEvent): string | null {
  const iTag = event.tags.find(([n, v]) => n === 'i' && typeof v === 'string' && v.startsWith('bitcoin:tx:'));
  if (!iTag?.[1]) return null;
  const txid = iTag[1].slice('bitcoin:tx:'.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) return null;
  return txid;
}

/** Parse the claimed amount (sats) from a kind 8333 event. */
function extractOnchainZapClaimedAmount(event: NostrEvent): number {
  const tag = event.tags.find(([n]) => n === 'amount');
  if (!tag?.[1]) return 0;
  const n = parseInt(tag[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Parse the recipient pubkey(s) from a kind 8333 event.
 *
 * Identity-recipient events carry one or more `p` tags; campaign-donation
 * events carry none (a campaign is not a Nostr identity). Returns the
 * pubkeys in `p`-tag order, deduplicated.
 */
function extractOnchainZapRecipients(event: NostrEvent): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'p') continue;
    const pubkey = tag[1];
    if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) continue;
    const normalized = pubkey.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }
  return recipients;
}

/**
 * Returns the addressable coordinate from the receipt's `a` tag if it
 * points at a kind 33863 campaign, or null otherwise.
 */
function extractCampaignTarget(event: NostrEvent): string | null {
  const aTag = event.tags.find(([n]) => n === 'a')?.[1];
  if (typeof aTag !== 'string') return null;
  if (!aTag.startsWith(`${CAMPAIGN_KIND}:`)) return null;
  return aTag;
}

/**
 * Verify a kind 8333 on-chain zap event against the Bitcoin blockchain.
 *
 * Returns the verified amount (sum of tx outputs paying the expected
 * destination) and confirmation status. Returns `null` if the event is
 * malformed or the transaction cannot be verified.
 *
 * Verification has two modes depending on the event shape:
 *
 * - **Identity-recipient mode** — event has one or more `p` tags and no
 *   campaign `a` tag. The expected destinations are the recipients'
 *   derived Taproot addresses (`nostrPubkeyToBitcoinAddress`).
 * - **Campaign-wallet mode** — event has an `a` tag pointing at a kind
 *   33863 campaign and no `p` tags. The expected destination is the
 *   campaign's declared `w` bech32(m) address. Silent-payment campaigns
 *   (`w` starts with `sp1…`) cannot be verified on-chain by definition
 *   and are rejected.
 *
 * @param event           The kind 8333 event to verify.
 * @param esploraApis     Ordered list of Esplora REST roots tried with failover.
 * @param campaignWallet  When the receipt targets a kind 33863 campaign,
 *                        the campaign's `w` value. Required for campaign-wallet
 *                        mode; ignored otherwise.
 * @param signal          Optional abort signal (e.g. from TanStack Query).
 */
export async function verifyOnchainZap(
  event: NostrEvent,
  esploraApis: string[],
  campaignWallet?: string,
  signal?: AbortSignal,
): Promise<OnchainZapEntry | null> {
  const txid = extractOnchainZapTxid(event);
  if (!txid) return null;

  const campaignTarget = extractCampaignTarget(event);

  // Determine the set of expected destination addresses for verification.
  const expectedAddresses = new Set<string>();
  let recipientPubkeys: string[] = [];

  if (campaignTarget) {
    // Campaign-wallet mode: match outputs against the campaign's declared
    // `w` address. Silent-payment campaigns publish no receipts, so a
    // receipt referencing an `sp1…` campaign is malformed.
    if (!campaignWallet) return null;
    if (campaignWallet.startsWith('sp1')) return null;
    expectedAddresses.add(campaignWallet);
    // No identity recipients in this mode.
  } else {
    // Identity-recipient mode.
    const recipients = extractOnchainZapRecipients(event);
    if (recipients.length === 0) return null;

    // Reject self-zaps: the sender already controls each derived destination
    // address, so any output paying the sender is change. Strip the sender
    // from the recipient set rather than discarding the whole event so a tx
    // that pays the sender plus legitimate recipients still verifies for
    // the others.
    recipientPubkeys = recipients.filter((p) => p !== event.pubkey);
    if (recipientPubkeys.length === 0) return null;

    for (const pubkey of recipientPubkeys) {
      const address = nostrPubkeyToBitcoinAddress(pubkey);
      if (address) expectedAddresses.add(address);
    }
    if (expectedAddresses.size === 0) return null;
  }

  let detail;
  try {
    detail = await fetchTxDetail(txid, esploraApis, signal);
  } catch {
    return null;
  }

  const amountSats = detail.outputs
    .filter((o) => o.address && expectedAddresses.has(o.address))
    .reduce((sum, o) => sum + o.value, 0);

  if (amountSats === 0) return null;

  const claimed = extractOnchainZapClaimedAmount(event);
  // If the sender is claiming more than the tx actually paid, cap it at the verified amount.
  const effectiveClaim = Math.min(claimed || amountSats, amountSats);

  return {
    event,
    txid,
    senderPubkey: event.pubkey,
    recipientPubkeys,
    amountSats: effectiveClaim,
    claimedAmountSats: claimed,
    comment: event.content,
    createdAt: event.created_at,
    confirmed: detail.confirmed,
  };
}

