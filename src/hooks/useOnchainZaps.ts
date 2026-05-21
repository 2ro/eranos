import { useQueries, useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { fetchTxDetail, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';
/** A single verified on-chain zap, with the amount that actually paid the recipient(s) on-chain. */
export interface OnchainZapEntry {
  /** The kind 8333 event. */
  event: NostrEvent;
  /** Bitcoin transaction id (lowercase hex). */
  txid: string;
  /** Pubkey of the sender (the 8333 event author). */
  senderPubkey: string;
  /**
   * Pubkeys of the recipients (one per `p` tag). For legacy single-recipient
   * events this has length 1; for multi-output events (campaign donations,
   * community batch zaps) it has one entry per recipient.
   */
  recipientPubkeys: string[];
  /**
   * Verified total in sats — sum of tx outputs that pay any of the listed
   * recipients' derived Taproot addresses. Excludes the sender's change
   * output even if some helpful soul tagged the sender as a recipient.
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
 * Legacy single-recipient events have exactly one `p` tag; multi-output
 * events (campaigns, community batch zaps) list every recipient under its
 * own `p` tag. Returns the pubkeys in `p`-tag order, deduplicated.
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
 * Verify a kind 8333 on-chain zap event against the Bitcoin blockchain.
 *
 * Returns the verified amount (sum of tx outputs paying any listed
 * recipient's derived Taproot address) and confirmation status. Returns
 * `null` if the event is malformed or the transaction cannot be verified.
 *
 * A verified amount of 0 means the transaction exists but does not pay
 * any listed recipient — callers should discard such events.
 *
 * @param event       The kind 8333 event to verify.
 * @param esploraApis  Ordered list of Esplora REST roots tried with failover.
 * @param signal      Optional abort signal (e.g. from TanStack Query).
 */
export async function verifyOnchainZap(
  event: NostrEvent,
  esploraApis: string[],
  signal?: AbortSignal,
): Promise<OnchainZapEntry | null> {
  const txid = extractOnchainZapTxid(event);
  const recipientPubkeys = extractOnchainZapRecipients(event);
  if (!txid || recipientPubkeys.length === 0) return null;

  // Reject self-zaps: the sender already controls each derived destination
  // address, so any output paying the sender is change. We strip the sender
  // from the recipient set rather than discarding the whole event so a tx
  // that pays the sender plus legitimate recipients still verifies for the
  // others.
  const externalRecipients = recipientPubkeys.filter((p) => p !== event.pubkey);
  if (externalRecipients.length === 0) return null;

  const recipientAddresses = new Set<string>();
  for (const pubkey of externalRecipients) {
    const address = nostrPubkeyToBitcoinAddress(pubkey);
    if (address) recipientAddresses.add(address);
  }
  if (recipientAddresses.size === 0) return null;

  let detail;
  try {
    detail = await fetchTxDetail(txid, esploraApis, signal);
  } catch {
    return null;
  }

  const amountSats = detail.outputs
    .filter((o) => o.address && recipientAddresses.has(o.address))
    .reduce((sum, o) => sum + o.value, 0);

  if (amountSats === 0) return null;

  const claimed = extractOnchainZapClaimedAmount(event);
  // If the sender is claiming more than the tx actually paid, cap it at the verified amount.
  const effectiveClaim = Math.min(claimed || amountSats, amountSats);

  return {
    event,
    txid,
    senderPubkey: event.pubkey,
    recipientPubkeys: externalRecipients,
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
 */
export function useOnchainZaps(target: NostrEvent | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraApis } = config;
  const isAddressable = target && target.kind >= 30000 && target.kind < 40000;
  const dTag = isAddressable
    ? target.tags.find(([n]) => n === 'd')?.[1] ?? ''
    : '';
  const aCoord = isAddressable && target ? `${target.kind}:${target.pubkey}:${dTag}` : '';

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
    enabled: !!target,
    staleTime: 30_000,
  });

  // Step 2: verify each event on-chain (parallel, cached per event)
  const events = eventsQuery.data ?? [];
  const verifications = useQueries({
    queries: events.map((event) => ({
      queryKey: ['onchain-zaps', 'verify', esploraApis, event.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => verifyOnchainZap(event, esploraApis, signal),
      staleTime: 60_000,
    })),
  });

  const verified: OnchainZapEntry[] = verifications
    .map((v) => v.data)
    .filter((v): v is OnchainZapEntry => !!v);

  // Sort by verified amount (largest first)
  verified.sort((a, b) => b.amountSats - a.amountSats);

  const totalSats = verified.reduce((s, v) => s + v.amountSats, 0);
  const isLoading = eventsQuery.isLoading || verifications.some((v) => v.isLoading);

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
 */
export function useVerifiedOnchainZap(event: NostrEvent | undefined): OnchainZapEntry | null | undefined {
  const { config } = useAppContext();
  const { esploraApis } = config;
  const txid = event ? extractOnchainZapTxid(event) : null;
  const hasRecipient = event ? extractOnchainZapRecipients(event).length > 0 : false;

  const { data } = useQuery({
    queryKey: ['onchain-zaps', 'verify', esploraApis, event?.id ?? ''],
    queryFn: ({ signal }) => verifyOnchainZap(event!, esploraApis, signal),
    enabled: !!event && !!txid && hasRecipient,
    staleTime: 60_000,
  });

  if (!event) return null;
  return data;
}
