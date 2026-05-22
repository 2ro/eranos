import { useQueries } from '@tanstack/react-query';

import { useCampaigns } from '@/hooks/useCampaigns';
import { useAppContext } from '@/hooks/useAppContext';
import { fetchAddressData } from '@/lib/bitcoin';
import type { ParsedCampaign } from '@/lib/campaign';

export interface ProfileCampaignStats {
  /** Total number of non-deleted campaigns authored by this pubkey. */
  campaignCount: number;
  /**
   * Sum of cumulative on-chain receipts (`chain_stats.funded_txo_sum`)
   * across all of this user's on-chain campaigns, in sats. Silent-payment
   * campaigns contribute 0 by design (donations are unlinkable).
   */
  totalRaisedSats: number;
  /** True while underlying address-balance queries are still resolving. */
  isVerifying: boolean;
  /** The raw campaigns list, for reuse by the chip click handler. */
  campaigns: ParsedCampaign[];
}

/**
 * Aggregate campaign and donation stats for a single profile.
 *
 * Mirrors {@link useCampaignDonations} per campaign — fans out a balance
 * lookup against each on-chain campaign's `w` address via the configured
 * Esplora endpoint (default: mempool.space) and sums `totalReceived`
 * across them. Silent-payment campaigns are excluded (their donations
 * are intentionally unlinkable).
 *
 * Lazy: returns 0 / empty until the campaigns list resolves, then fans
 * out balance fetches in parallel. Suitable for header stat chips where
 * an in-flight number is fine.
 */
export function useProfileCampaignStats(pubkey: string | undefined): ProfileCampaignStats {
  const { config } = useAppContext();
  const { esploraApis } = config;

  const campaignsQuery = useCampaigns(
    pubkey ? { authors: [pubkey], limit: 100 } : { authors: [], limit: 0 },
  );
  const campaigns = pubkey ? (campaignsQuery.data ?? []) : [];

  // Fan out: one balance lookup per on-chain campaign address.
  const onchainCampaigns = campaigns.filter((c) => c.wallet?.mode === 'onchain');
  const balanceQueries = useQueries({
    queries: onchainCampaigns.map((campaign) => ({
      // Share the cache key with useCampaignDonations so both surfaces
      // refresh together when useDonateCampaign invalidates
      // ['bitcoin-balance'].
      queryKey: ['bitcoin-balance', 'campaign', esploraApis, campaign.wallet?.value ?? ''],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchAddressData(campaign.wallet!.value, esploraApis, signal),
      staleTime: 30_000,
      enabled: !!campaign.wallet?.value,
    })),
  });

  const totalRaisedSats = balanceQueries.reduce(
    (sum, q) => sum + (q.data?.totalReceived ?? 0),
    0,
  );

  const isVerifying =
    campaignsQuery.isLoading || balanceQueries.some((q) => q.isLoading);

  return {
    campaignCount: campaigns.length,
    totalRaisedSats,
    isVerifying,
    campaigns,
  };
}
