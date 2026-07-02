import { useCampaigns } from '@/hooks/useCampaigns';
import type { ParsedCampaign } from '@/lib/campaign';

export interface ProfileCampaignStats {
  /** Total number of non-deleted campaigns authored by this pubkey. */
  campaignCount: number;
  /** True while the underlying campaigns query is still resolving. */
  isVerifying: boolean;
  /** The raw campaigns list, for reuse by the chip click handler. */
  campaigns: ParsedCampaign[];
}

/**
 * Aggregate campaign stats for a single profile.
 *
 * Lazy: returns 0 / empty until the campaigns list resolves. Suitable for
 * header stat chips where an in-flight number is fine. The raised-total
 * tally returns with the Grin payment-proof tally in a later phase.
 */
export function useProfileCampaignStats(pubkey: string | undefined): ProfileCampaignStats {
  const campaignsQuery = useCampaigns(
    pubkey ? { authors: [pubkey], limit: 100 } : { authors: [], limit: 0 },
  );
  const campaigns = pubkey ? (campaignsQuery.data ?? []) : [];

  return {
    campaignCount: campaigns.length,
    isVerifying: campaignsQuery.isLoading,
    campaigns,
  };
}
