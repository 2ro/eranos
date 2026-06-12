import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { CAMPAIGN_KIND, type ParsedCampaign } from '@/lib/campaign';
import { LABEL_KIND } from '@/lib/agoraModeration';
import {
  AGORA_VERIFIED_NAMESPACE,
  AGORA_VERIFIED_VALUE,
} from '@/lib/agoraVerification';
import { useCampaigns } from './useCampaigns';

/**
 * Campaigns a specific account has verified.
 *
 * A verification is a NIP-32 kind 1985 label in the `agora.verified`
 * namespace whose `a` tag points at a campaign coordinate (see
 * `agoraVerification.ts` / `useCampaignVerifications`). This hook scopes
 * the read to a single author (`pubkey`) — i.e. "campaigns this profile
 * has vouched for" — and resolves those coordinates into full
 * {@link ParsedCampaign} objects for rendering.
 *
 * Scoping by `authors: [pubkey]` is what makes this safe to render on an
 * arbitrary profile: we only ever surface verifications the profile itself
 * signed, so the list can't be forged by a third party.
 */
export function useVerifiedCampaigns(pubkey: string | undefined) {
  const { nostr } = useNostr();

  // Fetch the coordinates this account has verified.
  const coordsQuery = useQuery({
    queryKey: ['verified-campaign-coords', pubkey ?? ''],
    enabled: !!pubkey,
    queryFn: async ({ signal }): Promise<string[]> => {
      if (!pubkey) return [];

      const events = await nostr.query(
        [
          {
            kinds: [LABEL_KIND],
            authors: [pubkey],
            '#L': [AGORA_VERIFIED_NAMESPACE],
            '#l': [AGORA_VERIFIED_VALUE],
            limit: 2000,
          },
        ],
        { signal },
      );

      // Keep only events carrying the `verified` value in our namespace,
      // then collect their campaign coordinates (deduped).
      const coordPrefix = `${CAMPAIGN_KIND}:`;
      const coords = new Set<string>();

      for (const event of events) {
        const value = event.tags.find(
          ([n, , ns]) => n === 'l' && ns === AGORA_VERIFIED_NAMESPACE,
        )?.[1];
        if (value !== AGORA_VERIFIED_VALUE) continue;

        for (const tag of event.tags) {
          if (
            tag[0] === 'a' &&
            typeof tag[1] === 'string' &&
            tag[1].startsWith(coordPrefix)
          ) {
            coords.add(tag[1]);
          }
        }
      }

      return [...coords];
    },
    staleTime: 30_000,
  });

  // Resolve the coordinates into campaigns. Passing `[]` (empty allowlist)
  // returns an empty result without a relay round-trip; `undefined` while
  // the coords query is still loading keeps the campaigns query disabled.
  const coordinates = coordsQuery.data;
  const campaignsQuery = useCampaigns({
    coordinates: coordinates ?? [],
    enabled: !!pubkey && coordsQuery.isSuccess,
  });

  const campaigns: ParsedCampaign[] = campaignsQuery.data ?? [];

  return {
    campaigns,
    /** Number of verified coordinates found (before campaign resolution). */
    verifiedCount: coordinates?.length ?? 0,
    isLoading:
      !!pubkey &&
      (coordsQuery.isLoading ||
        (coordsQuery.isSuccess &&
          (coordinates?.length ?? 0) > 0 &&
          campaignsQuery.isLoading)),
  };
}
