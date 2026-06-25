import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { satsToUsd } from '@/lib/formatCampaignAmount';
import {
  VENEZUELA_RELIEF_CAMPAIGN_IDENTIFIER,
  VENEZUELA_RELIEF_CAMPAIGN_PUBKEY,
} from '@/lib/venezuelaRelief';

/** Live fundraising snapshot for the baked-in Venezuela relief campaign. */
export interface VenezuelaReliefGoalData {
  /** True while the campaign or its donation totals are still loading. */
  isLoading: boolean;
  /** Sats raised so far (cumulative amount ever sent to the address). */
  raisedSats: number;
  /** USD equivalent of {@link raisedSats}, or `undefined` if no BTC price. */
  raisedUsd: number | undefined;
  /** Campaign goal in whole USD (per NIP.md Kind 33863), if set. */
  goalUsd: number | undefined;
  /** Number of distinct donations, if known. */
  donationCount: number;
  /** Goal completion 0–100, clamped, or `undefined` if no goal/price. */
  percent: number | undefined;
  /** Live BTC/USD price, for sats↔USD formatting at the call site. */
  btcPrice: number | undefined;
  /** True once we have a real campaign + non-loading totals to show. */
  hasData: boolean;
}

/**
 * Resolves the baked-in Venezuela relief campaign (`terremoto-venezuela`,
 * kind 33863) and its live donation totals, shared by the home hero
 * ({@link VenezuelaReliefBanner}), the session popup
 * ({@link VenezuelaReliefPopup}), and the dedicated page
 * ({@link VenezuelaReliefPage}) so all three render the same goal/progress.
 *
 * Donation totals come from the same on-chain balance lookup the campaign
 * detail page uses ({@link useCampaignDonations}); no polling here, since
 * these surfaces are ambient rather than the primary donate destination.
 */
export function useVenezuelaReliefCampaign(): VenezuelaReliefGoalData {
  const { data: campaign, isLoading: campaignLoading } = useCampaign({
    pubkey: VENEZUELA_RELIEF_CAMPAIGN_PUBKEY,
    identifier: VENEZUELA_RELIEF_CAMPAIGN_IDENTIFIER,
  });
  const { data: btcPrice } = useBtcPrice();
  const { data: stats, isLoading: statsLoading } = useCampaignDonations(
    campaign ?? undefined,
  );

  const raisedSats = stats?.totalSats ?? 0;
  const raisedUsd = satsToUsd(raisedSats, btcPrice);
  const goalUsd = campaign?.goalUsd;
  const donationCount = stats?.receipts?.length ?? 0;

  const percent =
    goalUsd && goalUsd > 0 && raisedUsd !== undefined
      ? Math.min(100, Math.round((raisedUsd / goalUsd) * 100))
      : undefined;

  const isLoading = campaignLoading || statsLoading;

  return {
    isLoading,
    raisedSats,
    raisedUsd,
    goalUsd,
    donationCount,
    percent,
    btcPrice,
    hasData: !!campaign && !statsLoading,
  };
}
