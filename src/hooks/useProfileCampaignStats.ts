import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCampaigns } from '@/hooks/useCampaigns';
import { useAppContext } from '@/hooks/useAppContext';
import {
  extractOnchainZapTxid,
  verifyOnchainZap,
} from '@/hooks/useOnchainZaps';
import type { ParsedCampaign } from '@/lib/campaign';

export interface ProfileCampaignStats {
  /** Total number of non-deleted campaigns authored by this pubkey. */
  campaignCount: number;
  /**
   * Sum of verified on-chain donations across all of this user's
   * campaigns, in sats. Silent-payment campaigns contribute 0 by design
   * (donations are unlinkable, no receipts are published).
   */
  totalRaisedSats: number;
  /** True while donation verification queries are still resolving. */
  isVerifying: boolean;
  /** The raw campaigns list, for reuse by the chip click handler. */
  campaigns: ParsedCampaign[];
}

/**
 * Aggregate campaign and donation stats for a single profile.
 *
 * Mirrors {@link useCampaignDonations} per campaign — fetches kind 8333
 * receipts targeting each `a` coord, dedupes by txid, and verifies each
 * one on-chain against the campaign's `w` address before counting it
 * toward the total. Silent-payment campaigns are excluded from the
 * verification fan-out (their donations are intentionally unlinkable).
 *
 * Lazy: returns 0 / empty until the campaigns list resolves, then fans
 * out receipt fetches in parallel. Suitable for header stat chips where
 * an in-flight number is fine.
 */
export function useProfileCampaignStats(pubkey: string | undefined): ProfileCampaignStats {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraApis } = config;

  const campaignsQuery = useCampaigns(
    pubkey ? { authors: [pubkey], limit: 100 } : { authors: [], limit: 0 },
  );
  const campaigns = pubkey ? (campaignsQuery.data ?? []) : [];

  // Fan out: one receipt fetch per on-chain campaign.
  const onchainCampaigns = campaigns.filter((c) => c.wallet?.mode === 'onchain');
  const receiptsQueries = useQueries({
    queries: onchainCampaigns.map((campaign) => ({
      queryKey: ['campaign-donations', 'events', campaign.aTag],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<NostrEvent[]> => {
        return nostr.query(
          [{ kinds: [8333], '#a': [campaign.aTag], limit: 500 }],
          { signal },
        );
      },
      staleTime: 15_000,
    })),
  });

  // Flatten the receipts and dedupe by txid (prefer earliest, like
  // useCampaignDonations does). Track which campaign each txid belongs to
  // so we can verify against the right wallet.
  const verificationInputs: Array<{ campaign: ParsedCampaign; event: NostrEvent }> = [];
  const seenByCampaign = new Map<string, Set<string>>();
  for (let i = 0; i < onchainCampaigns.length; i++) {
    const campaign = onchainCampaigns[i];
    const receipts = receiptsQueries[i]?.data ?? [];
    const sortedAsc = [...receipts].sort((a, b) => a.created_at - b.created_at);
    const seenTxids = new Set<string>();
    for (const event of sortedAsc) {
      const txid = extractOnchainZapTxid(event);
      if (!txid) continue;
      if (seenTxids.has(txid)) continue;
      seenTxids.add(txid);
      verificationInputs.push({ campaign, event });
    }
    seenByCampaign.set(campaign.aTag, seenTxids);
  }

  const verifications = useQueries({
    queries: verificationInputs.map(({ campaign, event }) => ({
      queryKey: ['onchain-zaps', 'verify', esploraApis, event.id, campaign.wallet?.value ?? ''],
      queryFn: () => verifyOnchainZap(event, esploraApis, campaign.wallet?.value),
      staleTime: 60_000,
      enabled: !!campaign.wallet?.value,
    })),
  });

  const totalRaisedSats = verifications.reduce(
    (sum, v) => sum + (v.data?.amountSats ?? 0),
    0,
  );

  const isVerifying =
    campaignsQuery.isLoading ||
    receiptsQueries.some((q) => q.isLoading) ||
    verifications.some((v) => v.isLoading);

  return {
    campaignCount: campaigns.length,
    totalRaisedSats,
    isVerifying,
    campaigns,
  };
}
