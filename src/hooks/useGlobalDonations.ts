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
 * Like {@link useCampaignDonations}, each event's `amount` tag is the
 * total sats paid to the recipients it lists (see `NIP.md`), so summing
 * `amount` across all events yields the network total whether the events
 * are legacy single-recipient receipts or new multi-recipient ones.
 *
 * Totals are **self-reported**: a strict verifier would re-check each
 * `i` tag against mempool.space before counting. That's left to a future
 * iteration.
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

      let totalSats = 0;
      const txids = new Set<string>();
      const donors = new Set<string>();
      const campaigns = new Set<string>();

      for (const event of events) {
        const txid = event.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
        const amountTag = event.tags.find(([n]) => n === 'amount')?.[1];
        const amount = amountTag ? Number(amountTag) : NaN;
        if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

        totalSats += amount;
        txids.add(txid);
        donors.add(event.pubkey);
        const aTag = event.tags.find(([n]) => n === 'a')?.[1];
        if (aTag) campaigns.add(aTag);
      }

      return {
        totalSats,
        txCount: txids.size,
        donorCount: donors.size,
        campaignCount: campaigns.size,
      };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}
