import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  type CommunityMember,
  type CommunityMembership,
  type CommunityModeration,
  type ParsedCommunity,
  BADGE_AWARD_KIND,
  EMPTY_MODERATION,
  REPORT_KIND,
  resolveCommunityModeration,
  resolveMembership,
} from '@/lib/communityUtils';

interface CommunityMembersResult {
  /** Resolved membership with banned members removed. Use `members` to list active community members. */
  membership: CommunityMembership;
  /** Resolved moderation data (bans, reports, content warnings). */
  moderation: CommunityModeration;
  /** Chain-validated rank lookup (pubkey → rank) BEFORE moderation overlay. Includes banned members. Used for authority checks only — do NOT use to list active members. */
  rankMap: Map<string, CommunityMember>;
}



const EMPTY_RANK_MAP = new Map<string, CommunityMember>();

/**
 * Fetch and resolve the full membership tree and moderation state for a community.
 *
 * Queries badge awards (kind 8) and reports (kind 1984),
 * then runs the chain validation algorithm with moderation overlay.
 */
export function useCommunityMembers(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();

  const query = useQuery<CommunityMembersResult>({
    queryKey: ['community-members', community?.aTag ?? ''],
    queryFn: async ({ signal }) => {
      if (!community) {
        return {
          membership: { members: [], totalCount: 0 },
          moderation: EMPTY_MODERATION,
           rankMap: new Map(),
        };
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

      // Collect all badge a-tag coordinates from the community definition
      const badgeATags = community.ranks
        .filter((r) => r.badgeATag)
        .map((r) => r.badgeATag!);

      // Fetch awards and reports in parallel
      const [awards, reports] = await Promise.all([
        badgeATags.length > 0
          ? nostr.query(
            [{ kinds: [BADGE_AWARD_KIND], '#a': badgeATags, limit: 500 }],
            { signal: combinedSignal },
          )
          : Promise.resolve([]),
        nostr.query(
          [{ kinds: [REPORT_KIND], '#A': [community.aTag], limit: 500 }],
          { signal: combinedSignal },
        ),
      ]);

      // Step 1-2: Resolve full membership (needed for authority checks)
      const fullMembership = resolveMembership(community, awards);

      // Build rank lookup for authority checks (includes all chain-validated members, even those later banned)
      const rankMap = new Map<string, CommunityMember>();
      for (const m of fullMembership.members) {
        rankMap.set(m.pubkey, m);
      }

      // Step 3: Resolve moderation using the rank map
      const moderation = resolveCommunityModeration(reports, rankMap);

      // Step 4: Apply moderation overlay — filter banned members from the
      // already-computed membership rather than re-running chain validation.
      const filteredMembers = fullMembership.members.filter(
        (m) => !moderation.bannedPubkeys.has(m.pubkey),
      );
      const membership: CommunityMembership = {
        members: filteredMembers,
        totalCount: filteredMembers.length,
      };

      return { membership, moderation, rankMap };
    },
    enabled: !!community,
    staleTime: 2 * 60_000,
  });

  // Provide backward-compatible access to the membership data
  return useMemo(() => ({
    data: query.data?.membership,
    moderation: query.data?.moderation ?? EMPTY_MODERATION,
    rankMap: query.data?.rankMap ?? EMPTY_RANK_MAP,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }), [query.data, query.isLoading, query.isError, query.error]);
}
