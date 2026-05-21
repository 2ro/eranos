import { useQueries, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { fetchTxDetail, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';
import { CAMPAIGN_KIND, parseCampaign } from '@/lib/campaign';
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
export function extractOnchainZapClaimedAmount(event: NostrEvent): number {
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
export function extractOnchainZapRecipients(event: NostrEvent): string[] {
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
 * Convenience: returns the first recipient pubkey, or '' if none. Useful for
 * single-recipient callsites (profile zaps, etc.) that don't yet care about
 * multi-output events.
 */
export function extractOnchainZapRecipient(event: NostrEvent): string {
  return extractOnchainZapRecipients(event)[0] ?? '';
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
 * @param esploraBaseUrl  Esplora REST root used to fetch the tx detail.
 * @param campaignWallet  When the receipt targets a kind 33863 campaign,
 *                        the campaign's `w` value. Required for campaign-wallet
 *                        mode; ignored otherwise.
 */
export async function verifyOnchainZap(
  event: NostrEvent,
  esploraBaseUrl: string,
  campaignWallet?: string,
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
    detail = await fetchTxDetail(txid, esploraBaseUrl);
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

/**
 * Query all kind 8333 on-chain zaps targeting a specific event, then verify
 * each one on-chain. Returns only verified entries (deduped by txid).
 *
 * When the target is a kind 33863 campaign, verification matches against
 * the campaign's `w` wallet address rather than derived recipient
 * addresses. Silent-payment campaigns (`w` starts with `sp1…`) return an
 * empty list — donations to those campaigns are unlinkable by design.
 */
export function useOnchainZaps(target: NostrEvent | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const isAddressable = target && target.kind >= 30000 && target.kind < 40000;
  const dTag = isAddressable
    ? target.tags.find(([n]) => n === 'd')?.[1] ?? ''
    : '';
  const aCoord = isAddressable && target ? `${target.kind}:${target.pubkey}:${dTag}` : '';

  // If the target is a campaign, parse its `w` wallet for campaign-wallet
  // mode verification. Silent-payment campaigns short-circuit to "no
  // verifiable donations" — we don't issue any verifier queries.
  const campaignWallet = target && target.kind === CAMPAIGN_KIND
    ? parseCampaign(target)?.wallet
    : undefined;
  const isSilentPayment = campaignWallet?.mode === 'sp';

  // Step 1: fetch the raw kind 8333 events for this target
  const eventsQuery = useQuery({
    queryKey: ['onchain-zaps', 'events', target?.id ?? '', aCoord],
    queryFn: async ({ signal }) => {
      if (!target) return [] as NostrEvent[];
      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      const filters: Parameters<typeof nostr.query>[0] = [
        { kinds: [8333], '#e': [target.id], limit: 100 },
      ];
      if (aCoord) {
        filters.push({ kinds: [8333], '#a': [aCoord], limit: 100 });
      }

      const events = await nostr.query(filters, { signal: combined });

      // Dedupe by event id, then by txid (one canonical zap per tx per target).
      const byId = new Map<string, NostrEvent>();
      for (const e of events) byId.set(e.id, e);

      const byTxid = new Map<string, NostrEvent>();
      for (const e of byId.values()) {
        const txid = extractOnchainZapTxid(e);
        if (!txid) continue;
        const existing = byTxid.get(txid);
        // Prefer the earliest event for each txid (first to claim this tx).
        if (!existing || e.created_at < existing.created_at) {
          byTxid.set(txid, e);
        }
      }

      return Array.from(byTxid.values());
    },
    enabled: !!target && !isSilentPayment,
    staleTime: 30_000,
  });

  // Step 2: verify each event on-chain (parallel, cached per event)
  const events = eventsQuery.data ?? [];
  const walletValue = campaignWallet?.value;
  const verifications = useQueries({
    queries: events.map((event) => ({
      queryKey: ['onchain-zaps', 'verify', esploraBaseUrl, event.id, walletValue ?? ''],
      queryFn: () => verifyOnchainZap(event, esploraBaseUrl, walletValue),
      staleTime: 60_000,
    })),
  });

  const verified: OnchainZapEntry[] = verifications
    .map((v) => v.data)
    .filter((v): v is OnchainZapEntry => !!v);

  // Sort by verified amount (largest first)
  verified.sort((a, b) => b.amountSats - a.amountSats);

  const totalSats = verified.reduce((s, v) => s + v.amountSats, 0);
  const isLoading = !isSilentPayment && (eventsQuery.isLoading || verifications.some((v) => v.isLoading));

  return {
    zaps: verified,
    totalSats,
    count: verified.length,
    isLoading,
  };
}

/**
 * Verify a single kind 8333 event against the Bitcoin blockchain and return
 * the resulting `OnchainZapEntry`. Used by standalone surfaces (embedded
 * cards, detail page) that need to display a verified amount without doing
 * a full `#e`/`#a` fan-out.
 *
 * Returns `undefined` while loading, `null` if the event fails verification
 * (invalid tx, wrong recipient, self-zap, etc.), or the entry.
 *
 * If the receipt targets a kind 33863 campaign, pass the campaign's `w`
 * value as `campaignWallet` so the verifier can match outputs against the
 * campaign address. Without it, campaign-targeted receipts always fail
 * verification (no `p` tags, no fallback).
 */
export function useVerifiedOnchainZap(
  event: NostrEvent | undefined,
  campaignWallet?: string,
): OnchainZapEntry | null | undefined {
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  const txid = event ? extractOnchainZapTxid(event) : null;
  const targetsCampaign = event ? !!extractCampaignTarget(event) : false;
  const hasIdentityRecipient = event ? extractOnchainZapRecipients(event).length > 0 : false;

  // Enable verification when:
  // - we have a txid AND
  // - either the receipt targets a campaign AND we know the wallet, OR
  // - the receipt has an identity recipient (`p` tag).
  const enabled = !!event && !!txid && (
    (targetsCampaign && !!campaignWallet)
    || (!targetsCampaign && hasIdentityRecipient)
  );

  const { data } = useQuery({
    queryKey: ['onchain-zaps', 'verify', esploraBaseUrl, event?.id ?? '', campaignWallet ?? ''],
    queryFn: () => verifyOnchainZap(event!, esploraBaseUrl, campaignWallet),
    enabled,
    staleTime: 60_000,
  });

  if (!event) return null;
  return data;
}
