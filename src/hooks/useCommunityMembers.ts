import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  type CommunityMember,
  type CommunityMembership,
  type CommunityModeration,
  type ParsedCommunity,
  BADGE_AWARD_KIND,
  EMPTY_MEMBERSHIP,
  EMPTY_MODERATION,
  EMPTY_RANK_MAP,
  REPORT_KIND,
  resolveCommunityModeration,
  resolveMembership,
} from '@/lib/communityUtils';
import { queryAll } from '@/lib/queryAll';

interface CommunityMembersResult {
  /** Resolved membership with banned members removed. Use `members` to list active community members. */
  membership: CommunityMembership;
  /** Resolved moderation data (bans, reports, content warnings). */
  moderation: CommunityModeration;
  /** Flat authority lookup before moderation overlay. Includes banned members. Used for authority checks only — do NOT use to list active members. */
  rankMap: Map<string, CommunityMember>;
}

/**
 * Fetch and resolve flat membership and moderation state for a community.
 *
 * Queries founder/moderator-authored membership awards (kind 8), then
 * queries member-authored reports and bans (kind 1984).
 */
export function useCommunityMembers(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();

  const query = useQuery<CommunityMembersResult>({
    queryKey: ['community-members', community?.aTag ?? ''],
    queryFn: async ({ signal }) => {
      if (!community) {
        return {
          membership: EMPTY_MEMBERSHIP,
          moderation: EMPTY_MODERATION,
          rankMap: new Map(),
        };
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

      const awardAuthors = [community.founderPubkey, ...community.moderatorPubkeys];

      // Exhaustive paging: awards and reports are unbounded sets that grow
      // with the community. `queryAll` pages with `until` until the relay
      // drains, capped at 5_000 events / 10 pages so worst-case cost is
      // bounded. See src/lib/queryAll.ts.
      const awards = community.memberBadgeATag
        ? await queryAll(
          nostr,
          { kinds: [BADGE_AWARD_KIND], authors: awardAuthors, '#a': [community.memberBadgeATag], limit: 500 },
          { signal: combinedSignal },
        )
        : [];

      // Step 1-2: Resolve full membership (needed for authority checks)
      const fullMembership = resolveMembership(community, awards);

      // Build authority lookup for checks (includes members even if later banned).
      const rankMap = new Map<string, CommunityMember>();
      for (const m of fullMembership.members) {
        rankMap.set(m.pubkey, m);
      }

      const reportAuthors = fullMembership.members.map((member) => member.pubkey);
      const reports = await queryAll(
        nostr,
        { kinds: [REPORT_KIND], authors: reportAuthors, '#A': [community.aTag], limit: 500 },
        { signal: combinedSignal },
      );

      // Step 3: Resolve moderation using the flat membership map. The resolver
      // filters by `A` tag internally; we pass all reports as-is since
      // the relay query already scoped them to this community.
      const moderation = resolveCommunityModeration(community.aTag, reports, rankMap);

      // Step 4: Apply moderation overlay — filter banned members from the
      // already-computed membership.
      const membership: CommunityMembership = {
        members: fullMembership.members.filter(
          (m) => !moderation.bannedPubkeys.has(m.pubkey),
        ),
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
    rankMap: (query.data?.rankMap ?? EMPTY_RANK_MAP) as Map<string, CommunityMember>,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }), [query.data, query.isLoading, query.isError, query.error]);
}
