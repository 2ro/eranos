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
 * The returned `totalSats` is the **self-reported** sum of the `amount` tags
 * across deduped transactions. Per the NIP.md spec, a strict client would
 * verify each receipt against the on-chain transaction before counting it.
 * That's left to a future iteration — see TODO inline.
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

      const txTotals = new Map<string, number>();
      const donors = new Set<string>();
      for (const event of events) {
        const txid = event.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
        const amountTag = event.tags.find(([n]) => n === 'amount')?.[1];
        const amount = amountTag ? Number(amountTag) : NaN;
        if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

        // Sum per-recipient amounts within the same tx. Multiple receipts for
        // the same (txid, recipient) collapse to the largest claimed amount;
        // multiple receipts for the same txid across different recipients sum.
        const key = `${txid}:${event.tags.find(([n]) => n === 'p')?.[1] ?? ''}`;
        const prev = txTotals.get(key) ?? 0;
        if (amount > prev) txTotals.set(key, amount);
        donors.add(event.pubkey);
      }

      // TODO: verify each txid against mempool.space and sum only the outputs
      // that pay recipients' derived Taproot addresses. Until then the total
      // is best-effort and trivially spoofable.
      const totalSats = Array.from(txTotals.values()).reduce((sum, n) => sum + n, 0);

      const uniqueTxids = new Set<string>();
      for (const key of txTotals.keys()) {
        uniqueTxids.add(key.split(':')[0]);
      }

      const receipts = [...events].sort((a, b) => b.created_at - a.created_at);

      return {
        totalSats,
        txCount: uniqueTxids.size,
        donorCount: donors.size,
        receipts,
      };
    },
    enabled: !!aTag,
    staleTime: 15_000,
  });
}
