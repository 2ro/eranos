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

interface CommunityMembersResult {
  /** Resolved membership with banned members removed. Use `members` to list active community members. */
  membership: CommunityMembership;
  /** Resolved moderation data (bans, reports, content warnings). */
  moderation: CommunityModeration;
  /** Chain-validated rank lookup (pubkey → rank) BEFORE moderation overlay. Includes banned members. Used for authority checks only — do NOT use to list active members. */
  rankMap: Map<string, CommunityMember>;
}

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
          membership: EMPTY_MEMBERSHIP,
          moderation: EMPTY_MODERATION,
          rankMap: new Map(),
        };
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

      const awardAuthors = [community.founderPubkey, ...community.moderatorPubkeys];

      const awards = community.memberBadgeATag
        ? await nostr.query(
          [{ kinds: [BADGE_AWARD_KIND], authors: awardAuthors, '#a': [community.memberBadgeATag], limit: 500 }],
          { signal: combinedSignal },
        )
        : [];

      // Step 1-2: Resolve full membership (needed for authority checks)
      const fullMembership = resolveMembership(community, awards);

      // Build rank lookup for authority checks (includes all chain-validated members, even those later banned)
      const rankMap = new Map<string, CommunityMember>();
      for (const m of fullMembership.members) {
        rankMap.set(m.pubkey, m);
      }

      const reportAuthors = fullMembership.members.map((member) => member.pubkey);
      const reports = await nostr.query(
        [{ kinds: [REPORT_KIND], authors: reportAuthors, '#A': [community.aTag], limit: 500 }],
        { signal: combinedSignal },
      );

      // Step 3: Resolve moderation using the flat membership map. The resolver
      // filters by `A` tag internally; we pass all reports as-is since
      // the relay query already scoped them to this community.
      const moderation = resolveCommunityModeration(community.aTag, reports, rankMap);

      // Step 4: Apply moderation overlay — filter banned members from the
      // already-computed membership rather than re-running chain validation.
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
