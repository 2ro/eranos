import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useFollowList } from './useFollowActions';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import { TEAM_SOAPBOX_PACK } from '@/lib/helpContent';

const PAGE_SIZE = 20;

/**
 * Infinite-scroll feed of community definition events (kind 34550)
 * from users the current user follows.
 *
 * When logged out, uses the Team Soapbox follow pack as the author list
 * (same pattern as useBadgeFeed).
 */
export function useCommunityFeed() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const followList = followData?.pubkeys;

  // When logged out, fetch the Team Soapbox follow pack for default authors
  const { data: packPubkeys } = useQuery({
    queryKey: ['team-soapbox-pack-pubkeys'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{
          kinds: [TEAM_SOAPBOX_PACK.kind],
          authors: [TEAM_SOAPBOX_PACK.pubkey],
          '#d': [TEAM_SOAPBOX_PACK.identifier],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (events.length === 0) return [];
      return events[0].tags.filter(([n]) => n === 'p').map(([, pk]) => pk);
    },
    enabled: !user,
    staleTime: 10 * 60_000,
  });

  const followsReady = user ? followList !== undefined : packPubkeys !== undefined;

  const authorsList = user ? followList : packPubkeys;
  const authorsKey = authorsList ? [...authorsList].sort().join(',') : '';

  return useInfiniteQuery({
    queryKey: ['community-feed', 'follows', user?.pubkey ?? '', authorsKey],
    queryFn: async ({ pageParam, signal }) => {
      const baseUntil = pageParam as number | undefined;

      let authors: string[] | undefined;
      if (user && followList) {
        authors = followList.length > 0 ? [...followList, user.pubkey] : [user.pubkey];
      } else if (!user && packPubkeys && packPubkeys.length > 0) {
        authors = packPubkeys;
      }

      const events = await nostr.query(
        [{
          kinds: [COMMUNITY_DEFINITION_KIND],
          ...(authors ? { authors } : {}),
          ...(baseUntil ? { until: baseUntil } : {}),
          limit: PAGE_SIZE,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Deduplicate and sort
      const seen = new Set<string>();
      return events
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, PAGE_SIZE);
    },
    getNextPageParam: (lastPage: NostrEvent[]) => {
      if (lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: followsReady,
    staleTime: 2 * 60_000,
  });
}
