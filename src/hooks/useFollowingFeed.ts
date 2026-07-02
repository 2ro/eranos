import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCountryFollows } from '@/hooks/useCountryFollows';
import { useFeed } from '@/hooks/useFeed';
import { useFeedRelays } from '@/hooks/useFeedRelays';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useInterests } from '@/hooks/useInterests';
import { getCountryFilterValues, parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind, type FeedItem } from '@/lib/feedUtils';
import { buildTagFilterValues } from '@/lib/tagFilterValues';

const COUNTRY_PAGE_SIZE = 40;
const HASHTAG_PAGE_SIZE = 40;
const CHALLENGE_T_ALIASES = ['agora-action', 'pathos-challenge', 'agora-challenge'];

/**
 * Sliding window used as a fallback recency floor for the Following feed
 * when the network feed has no events yet. Without this, an inactive
 * follow list lets very old community/country/hashtag events take over
 * the top of the feed before the network feed has a chance to populate.
 *
 * 14 days is intentionally short to keep the Following feed feeling
 * "current" — items older than this should only be reachable via
 * pagination on dedicated tabs (Network, Communities, country/hashtag
 * pages).
 */
const RECENCY_WINDOW_SECONDS = 14 * 24 * 60 * 60;

interface CountryFeedPage {
  events: NostrEvent[];
  oldestTimestamp: number | null;
  totalFetched: number;
}

interface HashtagFeedPage {
  events: NostrEvent[];
  oldestTimestamp: number | null;
  totalFetched: number;
}

function eventCountryCode(event: NostrEvent): string | undefined {
  const iTag = event.tags.find(([name]) => name === 'i')?.[1];
  const parsedITag = iTag ? parseCountryIdentifier(iTag) : undefined;
  if (parsedITag) return parsedITag;

  const locationTag = event.tags.find(([name]) => name === 'location')?.[1];
  return locationTag ? parseCountryIdentifier(`iso3166:${locationTag}`) : undefined;
}

function useFollowedCountriesFeed(countryCodes: string[], enabled: boolean) {
  const feedRelays = useFeedRelays();
  const countryKey = countryCodes.join(',');

  return useInfiniteQuery<CountryFeedPage, Error>({
    queryKey: ['following-country-feed', countryKey],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      if (countryCodes.length === 0) {
        return { events: [], oldestTimestamp: null, totalFetched: 0 };
      }

      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      const until = pageParam as number | undefined;
      const followed = new Set(countryCodes.map((code) => code.toUpperCase()));
      const filterValues = countryCodes.flatMap((code) => getCountryFilterValues(code, true));

      const filters: NostrFilter[] = [
        { kinds: [1111, 1068], '#i': filterValues, limit: COUNTRY_PAGE_SIZE, ...(until && { until }) },
        { kinds: [36639], '#t': CHALLENGE_T_ALIASES, limit: Math.floor(COUNTRY_PAGE_SIZE / 4), ...(until && { until }) },
      ];

      const events = await feedRelays.query(filters, { signal });
      const filteredEvents = events
        .filter((event) => {
          const code = eventCountryCode(event);
          return !!code && followed.has(code);
        })
        .sort((a, b) => b.created_at - a.created_at);

      const pageEvents = filteredEvents.slice(0, COUNTRY_PAGE_SIZE);
      const oldestTimestamp = pageEvents.length > 0
        ? pageEvents[pageEvents.length - 1].created_at
        : null;

      return {
        events: pageEvents,
        oldestTimestamp,
        totalFetched: filteredEvents.length,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.totalFetched < COUNTRY_PAGE_SIZE || !lastPage.oldestTimestamp) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    enabled: enabled && countryCodes.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
}

function useFollowedHashtagsFeed(hashtags: string[], kinds: number[], enabled: boolean) {
  const feedRelays = useFeedRelays();
  const hashtagsKey = hashtags.join(',');
  const kindsKey = [...kinds].sort().join(',');

  return useInfiniteQuery<HashtagFeedPage, Error>({
    queryKey: ['following-hashtag-feed', hashtagsKey, kindsKey],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      if (hashtags.length === 0 || kinds.length === 0) {
        return { events: [], oldestTimestamp: null, totalFetched: 0 };
      }

      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      const until = pageParam as number | undefined;

      // Hashtags on Nostr are case-sensitive at the relay level but the UI
      // treats them as case-insensitive. Pass through the same expansion
      // used by the dedicated hashtag page so we don't miss posts that
      // tag, e.g., `#Grin` instead of `#grin`.
      const filterValues = Array.from(new Set(
        hashtags.flatMap((tag) => buildTagFilterValues(tag, '#t')),
      ));

      const filter: NostrFilter = {
        kinds,
        '#t': filterValues,
        limit: HASHTAG_PAGE_SIZE,
        ...(until && { until }),
      };

      const events = await feedRelays.query([filter], { signal });
      const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
      const pageEvents = sorted.slice(0, HASHTAG_PAGE_SIZE);
      const oldestTimestamp = pageEvents.length > 0
        ? pageEvents[pageEvents.length - 1].created_at
        : null;

      return {
        events: pageEvents,
        oldestTimestamp,
        totalFetched: sorted.length,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.totalFetched < HASHTAG_PAGE_SIZE || !lastPage.oldestTimestamp) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    enabled: enabled && hashtags.length > 0 && kinds.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Combined "Following" feed: people you follow + the countries you follow +
 * the hashtags you follow. Items are sorted strictly by recency
 * (`sortTimestamp` desc) with no per-source prioritisation.
 *
 * Older content from sources with sparse activity is filtered out so the
 * top of the feed doesn't drift back in time while a higher-volume source
 * is still loading. The cutoff is the more recent of:
 *
 *   - the oldest event currently loaded from the network feed, or
 *   - `now - RECENCY_WINDOW_SECONDS` (so an empty network feed still
 *     applies a recency floor).
 */
export function useFollowingFeed(enabled = true) {
  const { feedSettings } = useFeedSettings();
  const hashtagKinds = useMemo(
    () => getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k)),
    [feedSettings],
  );

  const networkFeed = useFeed('network', { enabled });
  const { followedCountries, isLoading: countryFollowsLoading } = useCountryFollows();
  const countryFeed = useFollowedCountriesFeed(followedCountries, enabled);
  const hasFollowedCountries = followedCountries.length > 0;
  const { hashtags: followedHashtags, isLoading: hashtagFollowsLoading } = useInterests('t');
  const hashtagFeed = useFollowedHashtagsFeed(followedHashtags, hashtagKinds, enabled);
  const hasFollowedHashtags = followedHashtags.length > 0;

  const data = useMemo(() => {
    const networkItems = (networkFeed.data?.pages as unknown as { items: FeedItem[] }[] | undefined)
      ?.flatMap((page) => page.items) ?? [];

    const countryItems = (countryFeed.data?.pages ?? [])
      .flatMap((page) => page.events)
      .map((event): FeedItem => ({ event, sortTimestamp: event.created_at }));

    const hashtagItems = (hashtagFeed.data?.pages ?? [])
      .flatMap((page) => page.events)
      .map((event): FeedItem => ({ event, sortTimestamp: event.created_at }));

    // Recency floor: prevent an older event from a sparse source (e.g. a
    // country/hashtag with little recent activity) from out-ranking a
    // newer item that simply hasn't loaded into the network feed yet.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const networkOldest = networkItems.length > 0
      ? Math.min(...networkItems.map((item) => item.sortTimestamp))
      : null;
    const windowFloor = nowSeconds - RECENCY_WINDOW_SECONDS;
    const recencyFloor = networkOldest !== null
      ? Math.max(networkOldest, windowFloor)
      : windowFloor;

    // Network items pass through untouched — they define their own
    // recency floor. Country and hashtag items are filtered to drop
    // anything older than the floor.
    const trimmedExternal = [...countryItems, ...hashtagItems]
      .filter((item) => item.sortTimestamp >= recencyFloor);

    const merged = [...networkItems, ...trimmedExternal];

    const seen = new Map<string, FeedItem>();
    for (const item of merged) {
      const key = item.repostedBy
        ? `repost-${item.repostedBy}-${item.event.id}`
        : item.event.id;
      const existing = seen.get(key);
      if (!existing || item.sortTimestamp > existing.sortTimestamp) {
        seen.set(key, item);
      }
    }

    const sorted = Array.from(seen.values()).sort(
      (a, b) => b.sortTimestamp - a.sortTimestamp,
    );

    return { pages: [{ items: sorted }] };
  }, [networkFeed.data?.pages, countryFeed.data?.pages, hashtagFeed.data?.pages]);

  const networkHasNextPage = networkFeed.hasNextPage;
  const networkFetchNextPage = networkFeed.fetchNextPage;
  const countryHasNextPage = countryFeed.hasNextPage;
  const countryFetchNextPage = countryFeed.fetchNextPage;
  const hashtagHasNextPage = hashtagFeed.hasNextPage;
  const hashtagFetchNextPage = hashtagFeed.fetchNextPage;

  const fetchNextPage = useCallback(async () => {
    await Promise.all([
      networkHasNextPage ? networkFetchNextPage() : Promise.resolve(),
      countryHasNextPage ? countryFetchNextPage() : Promise.resolve(),
      hashtagHasNextPage ? hashtagFetchNextPage() : Promise.resolve(),
    ]);
  }, [
    networkHasNextPage,
    networkFetchNextPage,
    countryHasNextPage,
    countryFetchNextPage,
    hashtagHasNextPage,
    hashtagFetchNextPage,
  ]);

  return {
    data,
    isPending: enabled && (
      networkFeed.isPending
      || countryFollowsLoading
      || (hasFollowedCountries && countryFeed.isPending)
      || hashtagFollowsLoading
      || (hasFollowedHashtags && hashtagFeed.isPending)
    ),
    isLoading: enabled && (
      networkFeed.isLoading
      || countryFollowsLoading
      || (hasFollowedCountries && countryFeed.isLoading)
      || hashtagFollowsLoading
      || (hasFollowedHashtags && hashtagFeed.isLoading)
    ),
    fetchNextPage,
    hasNextPage: !!networkFeed.hasNextPage
      || !!countryFeed.hasNextPage
      || !!hashtagFeed.hasNextPage,
    isFetchingNextPage: networkFeed.isFetchingNextPage
      || countryFeed.isFetchingNextPage
      || hashtagFeed.isFetchingNextPage,
  };
}
