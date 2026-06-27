import { useQueries } from '@tanstack/react-query';

import { useCampaigns } from '@/hooks/useCampaigns';
import { useAppContext } from '@/hooks/useAppContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { fetchAddressData } from '@/lib/bitcoin';
import { satsToUsd } from '@/lib/formatCampaignAmount';
import type { ParsedCampaign } from '@/lib/campaign';
import {
  VENEZUELA_EARTHQUAKE_TIMESTAMP,
  VENEZUELA_RELIEF_CATEGORIES,
  VENEZUELA_RELIEF_COUNTRY,
  VENEZUELA_RELIEF_PINNED_COORDINATES,
} from '@/lib/venezuelaRelief';

/** Live snapshot of the Venezuela relief showcase. */
export interface VenezuelaReliefData {
  /** True while the campaign list or its aggregate totals are still loading. */
  isLoading: boolean;
  /** Every matching campaign (Venezuela + a relief category), newest first. */
  campaigns: ParsedCampaign[];
  /** Number of matching campaigns. */
  campaignCount: number;
  /**
   * Aggregate sats raised across all matching on-chain campaigns
   * (sum of `chain_stats.funded_txo_sum`). Silent-payment campaigns
   * contribute 0 by design (donations are unlinkable).
   */
  raisedSats: number;
  /** USD equivalent of {@link raisedSats}, or `undefined` if no BTC price. */
  raisedUsd: number | undefined;
  /** Live BTC/USD price, for sats↔USD formatting at the call site. */
  btcPrice: number | undefined;
  /** True once we have at least one campaign and non-loading totals. */
  hasData: boolean;
}

/**
 * Resolves every Venezuela-located campaign tagged for relief
 * (`humanitarian-aid` or `emergency-relief`) and created at or after the
 * earthquake ({@link VENEZUELA_EARTHQUAKE_TIMESTAMP}), then aggregates
 * their live on-chain donation totals. Shared by the home hero
 * ({@link VenezuelaReliefBanner}), the session popup
 * ({@link VenezuelaReliefPopup}), and the dedicated page
 * ({@link VenezuelaReliefPage}) so all three render the same showcase and
 * progress.
 *
 * Aggregate totals mirror {@link useProfileCampaignStats}: one Esplora
 * `/address` balance lookup per on-chain campaign, summed. No per-receipt
 * `/tx` fan-out — these ambient surfaces only need the headline number.
 *
 * Pinned campaigns ({@link VENEZUELA_RELIEF_PINNED_COORDINATES}) — the
 * flagship effort that predates the geo-tagging convention — are fetched
 * by coordinate and merged in ahead of the filtered results, deduped by
 * `aTag` so a pinned campaign that also matches the filter isn't doubled.
 */
export function useVenezuelaReliefCampaigns(): VenezuelaReliefData {
  const { config } = useAppContext();
  const { esploraApis } = config;
  const { data: btcPrice } = useBtcPrice();

  const campaignsQuery = useCampaigns({
    countryCode: VENEZUELA_RELIEF_COUNTRY,
    categories: [...VENEZUELA_RELIEF_CATEGORIES],
    since: VENEZUELA_EARTHQUAKE_TIMESTAMP,
    limit: 60,
  });

  // Always-included flagship campaign(s), fetched by exact coordinate so
  // they appear even without the `iso3166:VE` country tag the filter needs.
  const pinnedQuery = useCampaigns({
    coordinates: [...VENEZUELA_RELIEF_PINNED_COORDINATES],
  });

  // Pinned first, then the filtered results, deduped by addressable coord.
  const campaigns: ParsedCampaign[] = (() => {
    const seen = new Set<string>();
    const merged: ParsedCampaign[] = [];
    for (const c of [...(pinnedQuery.data ?? []), ...(campaignsQuery.data ?? [])]) {
      if (seen.has(c.aTag)) continue;
      seen.add(c.aTag);
      merged.push(c);
    }
    return merged;
  })();

  // Fan out: one balance lookup per on-chain campaign address. Silent-payment
  // campaigns are excluded (donations are unlinkable by design).
  const onchainCampaigns = campaigns.flatMap((c) => {
    const address = c.wallets?.onchain?.value;
    return address ? [{ campaign: c, address }] : [];
  });
  const balanceQueries = useQueries({
    queries: onchainCampaigns.map(({ address }) => ({
      // Share the cache key with useCampaignDonations / useProfileCampaignStats
      // so all surfaces refresh together when a donation invalidates
      // ['bitcoin-balance'].
      queryKey: ['bitcoin-balance', 'campaign', esploraApis, address],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchAddressData(address, esploraApis, signal),
      staleTime: 60_000,
      enabled: !!address,
    })),
  });

  const raisedSats = balanceQueries.reduce(
    (sum, q) => sum + (q.data?.totalReceived ?? 0),
    0,
  );
  const raisedUsd = satsToUsd(raisedSats, btcPrice);

  const balancesLoading = balanceQueries.some((q) => q.isLoading);
  const isLoading =
    campaignsQuery.isLoading || pinnedQuery.isLoading || balancesLoading;

  return {
    isLoading,
    campaigns,
    campaignCount: campaigns.length,
    raisedSats,
    raisedUsd,
    btcPrice,
    hasData: campaigns.length > 0 && !balancesLoading,
  };
}
