import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

export interface GlobalDonationStats {
  /** Self-reported total satoshis across all kind 8333 receipts. */
  totalSats: number;
  /** Number of unique on-chain transactions counted. */
  txCount: number;
  /** Number of unique donor pubkeys. */
  donorCount: number;
  /** Number of unique campaigns that received at least one donation. */
  campaignCount: number;
}

/**
 * Aggregates **all** kind 8333 on-chain donation receipts across the
 * network into a single set of totals. Used by the Discover page hero
 * ticker to show network-wide impact ("X sats raised across Y campaigns
 * in Z countries").
 *
 * Like {@link useCampaignDonations}, totals are **self-reported**: a
 * strict verifier would re-check each `i` tag against mempool.space
 * before counting. That's left to a future iteration.
 *
 * Costs one relay round-trip; cached for 5 minutes so the ticker
 * stabilises after the first load.
 */
export function useGlobalDonations() {
  const { nostr } = useNostr();

  return useQuery<GlobalDonationStats>({
    queryKey: ['discover-global-donations'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [8333], limit: 2000 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );

      // Sum per-(txid,recipient) to avoid double-counting receipts where
      // multiple recipients claim the same tx. Mirrors the dedupe logic
      // in useCampaignDonations.
      const txTotals = new Map<string, number>();
      const donors = new Set<string>();
      const campaigns = new Set<string>();

      for (const event of events) {
        const txid = event.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
        const amountTag = event.tags.find(([n]) => n === 'amount')?.[1];
        const amount = amountTag ? Number(amountTag) : NaN;
        if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

        const recipient = event.tags.find(([n]) => n === 'p')?.[1] ?? '';
        const key = `${txid}:${recipient}`;
        const prev = txTotals.get(key) ?? 0;
        if (amount > prev) txTotals.set(key, amount);

        donors.add(event.pubkey);
        const aTag = event.tags.find(([n]) => n === 'a')?.[1];
        if (aTag) campaigns.add(aTag);
      }

      const totalSats = Array.from(txTotals.values()).reduce((sum, n) => sum + n, 0);
      const uniqueTxids = new Set<string>();
      for (const key of txTotals.keys()) {
        uniqueTxids.add(key.split(':')[0]);
      }

      return {
        totalSats,
        txCount: uniqueTxids.size,
        donorCount: donors.size,
        campaignCount: campaigns.size,
      };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}
