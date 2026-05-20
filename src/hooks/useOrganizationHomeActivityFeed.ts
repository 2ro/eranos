import { useMemo } from 'react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import type { UserOrganization } from '@/hooks/useUserOrganizations';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import { getPaginationCursor } from '@/lib/feedUtils';

const PLEDGE_KIND = 36639;
const CALENDAR_EVENT_KINDS = [31922, 31923];
const OFFICIAL_ACTIVITY_KINDS = [CAMPAIGN_KIND, PLEDGE_KIND, ...CALENDAR_EVENT_KINDS];
const OFFICIAL_ACTIVITY_KIND_SET = new Set(OFFICIAL_ACTIVITY_KINDS);
const COMMENTS_PAGE_SIZE = 60;
const OFFICIAL_PAGE_SIZE = 40;

interface OrganizationFeedPage {
  events: NostrEvent[];
  commentsRawCount: number;
  officialRawCount: number;
  commentsOldestTimestamp: number | null;
  officialOldestTimestamp: number | null;
}

interface OrganizationFeedPageParam {
  commentsUntil?: number;
  officialUntil?: number;
  commentsDone?: boolean;
  officialDone?: boolean;
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
        return {
          events: [],
          commentsRawCount: 0,
          officialRawCount: 0,
          commentsOldestTimestamp: null,
          officialOldestTimestamp: null,
        };
      }

      const cursor = pageParam as OrganizationFeedPageParam | undefined;
      const filters: NostrFilter[] = [];

      if (!cursor?.commentsDone) {
        filters.push({
          kinds: [1111],
          '#A': aTags,
          ...(membersOnly && officialAuthors.length > 0 ? { authors: officialAuthors } : {}),
          limit: COMMENTS_PAGE_SIZE,
          ...(cursor?.commentsUntil ? { until: cursor.commentsUntil } : {}),
        });
      }

      if (!cursor?.officialDone && officialAuthors.length > 0) {
        filters.push({
          kinds: OFFICIAL_ACTIVITY_KINDS,
          authors: officialAuthors,
          '#A': aTags,
          limit: OFFICIAL_PAGE_SIZE,
          ...(cursor?.officialUntil ? { until: cursor.officialUntil } : {}),
        });
      }

      if (filters.length === 0) {
        return {
          events: [],
          commentsRawCount: 0,
          officialRawCount: 0,
          commentsOldestTimestamp: null,
          officialOldestTimestamp: null,
        };
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const raw = await nostr.query(filters, { signal: combinedSignal });
      const rawComments = raw.filter((event) => event.kind === 1111);
      const rawOfficial = raw.filter((event) => OFFICIAL_ACTIVITY_KIND_SET.has(event.kind));
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

      for (const event of events) {
        if (!queryClient.getQueryData(['event', event.id])) {
          queryClient.setQueryData(['event', event.id], event);
        }
      }

      return {
        events,
        commentsRawCount: rawComments.length,
        officialRawCount: rawOfficial.length,
        commentsOldestTimestamp: rawComments.length > 0 ? getPaginationCursor(rawComments) : null,
        officialOldestTimestamp: rawOfficial.length > 0 ? getPaginationCursor(rawOfficial) : null,
      };
    },
    getNextPageParam: (lastPage) => {
      const commentsCursor = lastPage.commentsOldestTimestamp;
      const officialCursor = lastPage.officialOldestTimestamp;
      const commentsDone = lastPage.commentsRawCount < COMMENTS_PAGE_SIZE || commentsCursor === null;
      const officialDone = lastPage.officialRawCount < OFFICIAL_PAGE_SIZE || officialCursor === null;

      if (commentsDone && officialDone) return undefined;

      return {
        commentsDone,
        officialDone,
        commentsUntil: commentsDone ? undefined : commentsCursor - 1,
        officialUntil: officialDone ? undefined : officialCursor - 1,
      } satisfies OrganizationFeedPageParam;
    },
    initialPageParam: undefined as OrganizationFeedPageParam | undefined,
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
