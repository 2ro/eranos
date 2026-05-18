import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

export interface CampaignDonationStats {
  /** Total satoshis pledged across all kind 8333 receipts (self-reported sum). */
  totalSats: number;
  /** Number of unique on-chain transactions counted. */
  txCount: number;
  /** Number of unique donor pubkeys. */
  donorCount: number;
  /** All kind 8333 receipts for the campaign, newest first. */
  receipts: NostrEvent[];
}

/**
 * Aggregates donation receipts (kind 8333 events) for a campaign by its
 * addressable coordinate.
 *
 * Each kind 8333 event's `amount` tag is the total sats paid to the
 * recipients listed in that event (see `NIP.md`). New donations publish a
 * single event per tx covering every recipient; legacy donations published
 * one event per recipient. In either case, summing `amount` across all
 * events that tag the campaign yields the campaign's total — the legacy
 * per-recipient amounts sum to the full donation, and the new per-tx
 * amount IS the full donation.
 *
 * The returned `totalSats` is **self-reported**. Per the NIP.md spec a
 * strict client would verify each receipt against the on-chain transaction
 * before counting it; that's left to a future iteration (see TODO inline).
 */
export function useCampaignDonations(aTag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['campaign-donations', aTag ?? ''],
    queryFn: async (c): Promise<CampaignDonationStats> => {
      if (!aTag) {
        return { totalSats: 0, txCount: 0, donorCount: 0, receipts: [] };
      }
      const events = await nostr.query(
        [{ kinds: [8333], '#a': [aTag], limit: 500 }],
        { signal: c.signal },
      );

      let totalSats = 0;
      const txids = new Set<string>();
      const donors = new Set<string>();
      for (const event of events) {
        const txid = event.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
        const amountTag = event.tags.find(([n]) => n === 'amount')?.[1];
        const amount = amountTag ? Number(amountTag) : NaN;
        if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

        totalSats += amount;
        txids.add(txid);
        donors.add(event.pubkey);
      }

      // TODO: verify each txid against mempool.space and sum only the outputs
      // that pay listed recipients' derived Taproot addresses. Until then the
      // total is best-effort and trivially spoofable.

      const receipts = [...events].sort((a, b) => b.created_at - a.created_at);

      return {
        totalSats,
        txCount: txids.size,
        donorCount: donors.size,
        receipts,
      };
    },
    enabled: !!aTag,
    staleTime: 15_000,
  });
}
