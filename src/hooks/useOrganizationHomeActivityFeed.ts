import { useMemo } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import type { UserOrganization } from '@/hooks/useUserOrganizations';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import { getPaginationCursor } from '@/lib/feedUtils';

const PLEDGE_KIND = 36639;
const CALENDAR_EVENT_KINDS = [31922, 31923];
const COMMENTS_PAGE_SIZE = 60;
const OFFICIAL_PAGE_SIZE = 40;

interface OrganizationFeedPage {
  events: NostrEvent[];
  rawCount: number;
  oldestTimestamp: number | null;
}

function getEventOrganizationATag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'A')?.[1];
}

function buildLeadershipByATag(organizations: UserOrganization[]) {
  const leadershipByATag = new Map<string, Set<string>>();
  for (const entry of organizations) {
    leadershipByATag.set(
      entry.community.aTag,
      new Set([entry.community.founderPubkey, ...entry.community.moderatorPubkeys]),
    );
  }
  return leadershipByATag;
}

/** Feed of comments and official activity from the user's founded/moderated/followed organizations. */
export function useOrganizationHomeActivityFeed(
  organizations: UserOrganization[] | undefined,
  membersOnly: boolean,
  enabled = true,
) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  const aTags = useMemo(
    () => organizations?.map((entry) => entry.community.aTag) ?? [],
    [organizations],
  );
  const aTagsKey = aTags.join(',');
  const leadershipByATag = useMemo(
    () => buildLeadershipByATag(organizations ?? []),
    [organizations],
  );
  const officialAuthors = useMemo(() => {
    const authors = new Set<string>();
    for (const leaders of leadershipByATag.values()) {
      for (const pubkey of leaders) authors.add(pubkey);
    }
    return [...authors];
  }, [leadershipByATag]);

  const query = useInfiniteQuery<OrganizationFeedPage, Error>({
    queryKey: ['organization-home-activity-feed', aTagsKey, membersOnly],
    queryFn: async ({ pageParam, signal }) => {
      if (aTags.length === 0) {
        return { events: [], rawCount: 0, oldestTimestamp: null };
      }

      const until = pageParam as number | undefined;
      const filters: NostrFilter[] = [
        {
          kinds: [1111],
          '#A': aTags,
          ...(membersOnly && officialAuthors.length > 0 ? { authors: officialAuthors } : {}),
          limit: COMMENTS_PAGE_SIZE,
          ...(until ? { until } : {}),
        },
        {
          kinds: [CAMPAIGN_KIND, PLEDGE_KIND, ...CALENDAR_EVENT_KINDS],
          authors: officialAuthors,
          '#A': aTags,
          limit: OFFICIAL_PAGE_SIZE,
          ...(until ? { until } : {}),
        },
      ];

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const raw = await nostr.query(filters, { signal: combinedSignal });
      const seen = new Set<string>();
      const events: NostrEvent[] = [];

      for (const event of raw.sort((a, b) => b.created_at - a.created_at)) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);

        const aTag = getEventOrganizationATag(event);
        if (!aTag) continue;
        const leaders = leadershipByATag.get(aTag);
        if (!leaders) continue;

        if (event.kind === 1111) {
          if (membersOnly && !leaders.has(event.pubkey)) continue;
          events.push(event);
          continue;
        }

        if (!leaders.has(event.pubkey)) continue;
        events.push(event);
      }

      const page = events.slice(0, COMMENTS_PAGE_SIZE);
      for (const event of page) {
        if (!queryClient.getQueryData(['event', event.id])) {
          queryClient.setQueryData(['event', event.id], event);
        }
      }

      return {
        events: page,
        rawCount: raw.length,
        oldestTimestamp: raw.length > 0 ? getPaginationCursor(raw) : null,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.rawCount < OFFICIAL_PAGE_SIZE || !lastPage.oldestTimestamp) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: enabled && aTags.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    const seen = new Set<string>();
    const events = (query.data?.pages ?? [])
      .flatMap((page) => page.events)
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at);

    return {
      events,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      fetchNextPage: query.fetchNextPage,
      pageCount: query.data?.pages.length,
    };
  }, [query.data, query.error, query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage, query.isLoading]);
}
