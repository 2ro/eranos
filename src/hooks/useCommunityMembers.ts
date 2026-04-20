import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  type ParsedCommunity,
  type CommunityMembership,
  BADGE_AWARD_KIND,
  resolveMembership,
} from '@/lib/communityUtils';

/**
 * Fetch and resolve the full membership tree for a community.
 *
 * Queries badge awards (kind 8) and runs the chain validation algorithm
 * from the community NIP.
 *
 * TODO: add kind 1984 (reports) and kind 5 (deletions) for moderation overlay.
 */
export function useCommunityMembers(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();

  return useQuery<CommunityMembership>({
    queryKey: ['community-members', community?.aTag ?? ''],
    queryFn: async ({ signal }) => {
      if (!community) return { members: [], totalCount: 0 };

      // Collect all badge a-tag coordinates from the community definition
      const badgeATags = community.ranks
        .filter((r) => r.badgeATag)
        .map((r) => r.badgeATag!);

      if (badgeATags.length === 0) {
        // No badge ranks defined — only founder + moderators
        return resolveMembership(community, []);
      }

      // Fetch badge awards scoped to this community's badge definitions
      const awards = await nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], '#a': badgeATags, limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );

      // TODO: query kind 1984 reports and kind 5 deletions for moderation overlay
      return resolveMembership(community, awards);
    },
    enabled: !!community,
    staleTime: 2 * 60_000,
  });
}
