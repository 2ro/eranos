import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  type CommunityMember,
  type CommunityMembership,
  type CommunityModeration,
  type ParsedCommunity,
  EMPTY_MEMBERSHIP,
  EMPTY_MODERATION,
  EMPTY_RANK_MAP,
  REPORT_KIND,
  resolveCommunityModeration,
} from '@/lib/communityUtils';
import { queryAll } from '@/lib/queryAll';

interface CommunityMembersResult {
  /** Founder + moderators of the organization. */
  membership: CommunityMembership;
  /** Resolved moderation data (content bans and soft reports). */
  moderation: CommunityModeration;
  /** Flat authority lookup keyed by pubkey. Includes founder + every moderator. */
  rankMap: Map<string, CommunityMember>;
}

/**
 * Resolve the founder/moderator roster and active moderation state for an
 * organization.
 *
 * Agora's organization model has only two trust levels — founder (kind
 * 34550 author) and moderators (`p` tags with `moderator` role on that
 * event). Both are read directly from the parsed community; no separate
 * relay query is needed for membership.
 *
 * The hook still queries kind 1984 moderation events scoped to this
 * organization so the UI can hide content-banned posts and surface soft
 * reports as content warnings.
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

      // Authority roster: founder (rank 0) + every listed moderator (rank 0).
      // Rank is retained so legacy helpers (canBanTarget, getViewerAuthority)
      // keep working with a uniform shape even though only one tier exists.
      const rankMap = new Map<string, CommunityMember>();
      rankMap.set(community.founderPubkey, { pubkey: community.founderPubkey, rank: 0 });
      for (const modPk of community.moderatorPubkeys) {
        if (rankMap.has(modPk)) continue;
        rankMap.set(modPk, { pubkey: modPk, rank: 0 });
      }

      // Moderation reports: paginate so an organization with a long history
      // of moderation actions still loads completely. `queryAll` caps the
      // total per `src/lib/queryAll.ts`.
      const reports = await queryAll(
        nostr,
        { kinds: [REPORT_KIND], authors: [...rankMap.keys()], '#A': [community.aTag], limit: 500 },
        { signal: combinedSignal },
      );

      const moderation = resolveCommunityModeration(community.aTag, reports, rankMap);

      const membership: CommunityMembership = {
        founderPubkey: community.founderPubkey,
        moderatorPubkeys: community.moderatorPubkeys,
      };

      return { membership, moderation, rankMap };
    },
    enabled: !!community,
    staleTime: 2 * 60_000,
  });

  return useMemo(() => ({
    data: query.data?.membership,
    moderation: query.data?.moderation ?? EMPTY_MODERATION,
    rankMap: (query.data?.rankMap ?? EMPTY_RANK_MAP) as Map<string, CommunityMember>,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }), [query.data, query.isLoading, query.isError, query.error]);
}
