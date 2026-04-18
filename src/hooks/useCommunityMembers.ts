import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  type ParsedCommunity,
  type CommunityMembership,
  BADGE_AWARD_KIND,
  REPORT_KIND,
  DELETION_KIND,
  resolveMembership,
} from '@/lib/communityUtils';

/**
 * Fetch and resolve the full membership tree for a community.
 *
 * Queries badge awards (kind 8), reports (kind 1984), and deletions (kind 5)
 * then runs the chain validation algorithm from the community NIP.
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
        return resolveMembership(community, [], [], []);
      }

      // Single combined query for awards, reports, and deletions
      const events = await nostr.query(
        [
          { kinds: [BADGE_AWARD_KIND], '#a': badgeATags, limit: 500 },
          { kinds: [REPORT_KIND], '#A': [community.aTag], limit: 200 },
          { kinds: [DELETION_KIND], '#k': ['8', '1984'], limit: 200 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );

      const awards = events.filter((e) => e.kind === BADGE_AWARD_KIND);
      const reports = events.filter((e) => e.kind === REPORT_KIND);
      const deletions = events.filter((e) => e.kind === DELETION_KIND);

      return resolveMembership(community, awards, reports, deletions);
    },
    enabled: !!community,
    staleTime: 2 * 60_000,
  });
}
