import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useFeedRelays } from '@/hooks/useFeedRelays';

/**
 * Options for fetching the paginated activity feed.
 */
interface UsePaginatedFeedOptions {
  /** ISO 3166-1 alpha-2 country code to filter by (e.g., 'BR', 'US') */
  countryCode?: string;
  /** Number of posts to fetch per page */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Fetches the activity feed with infinite scrolling pagination.
 * 
 * Uses TanStack Query's useInfiniteQuery for cursor-based pagination.
 * Queries for kind 1111 geographic posts, kind 1068 polls, and kind 36639 challenges.
 * 
 * @param options - Query options
 * @returns React Query infinite query result with paginated posts
 * 
 * @example
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = usePaginatedFeed({ 
 *   countryCode: 'BR',
 *   pageSize: 20 
 * });
 * 
 * const allPosts = data?.pages.flatMap(page => page.events) || [];
 * ```
 */
export function usePaginatedFeed({ 
  countryCode, 
  pageSize = DEFAULT_PAGE_SIZE 
}: UsePaginatedFeedOptions = {}) {
  const feedRelays = useFeedRelays();

  return useInfiniteQuery({
    queryKey: ['pathos-feed-paginated', countryCode, pageSize],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      const until = pageParam as number | undefined;
      
      // Query for:
      // 1. kind 1111 events - Geographic root posts and challenge comments
      // 2. kind 1068 events - NIP-88 Polls (country-scoped)
      // 3. kind 36639 events - Challenge creation events
      const filters: NostrFilter[] = [];
      
      if (countryCode) {
        // Country-specific feed
        const { getCountryFilterValues } = await import('@/lib/countryIdentifiers');
        const filterValues = getCountryFilterValues(countryCode, true);
        filters.push(
          { kinds: [1111, 1068], '#i': filterValues, limit: pageSize, ...(until && { until }) },
          { kinds: [36639], '#t': ['agora-challenge'], limit: Math.floor(pageSize / 4), ...(until && { until }) }
        );
      } else {
        // Global feed - get top posts from around the world
        filters.push(
          { kinds: [1111, 1068], '#k': ['iso3166', 'geo'], limit: pageSize, ...(until && { until }) },
          { kinds: [36639], '#t': ['agora-challenge'], limit: Math.floor(pageSize / 4), ...(until && { until }) }
        );
      }
      
      const events = await feedRelays.query(filters, { signal });

      // Apply shared filtering logic
      const filteredEvents = await applyFeedFilters(events, countryCode);

      // Limit to page size
      const sortedEvents = filteredEvents.slice(0, pageSize);

      // Get oldest timestamp for next page cursor
      const oldestTimestamp = sortedEvents.length > 0
        ? sortedEvents[sortedEvents.length - 1].created_at
        : null;

      return {
        events: sortedEvents,
        oldestTimestamp,
        totalFetched: filteredEvents.length,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      // If we fetched fewer than page size, we've reached the end
      if (lastPage.totalFetched < pageSize || !lastPage.oldestTimestamp) {
        return undefined;
      }
      // Return timestamp - 1 to fetch events before this timestamp
      return lastPage.oldestTimestamp - 1;
    },
    staleTime: 30000,
    // No refetchInterval - we'll use background polling instead
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching (avoids flicker)
  });
}

/**
 * Shared filtering logic for feed events.
 * Filters events by kind and applies diversity cap for global feeds.
 */
async function applyFeedFilters(
  events: NostrEvent[],
  countryCode: string | undefined
): Promise<NostrEvent[]> {
  // Filter by kind and tags
  let filteredEvents = events.filter(event => {
    if (event.kind === 36639) {
      if (countryCode) {
        const locationTag = event.tags.find(([name]) => name === 'location')?.[1];
        return locationTag?.toUpperCase() === countryCode.toUpperCase();
      }
      return true;
    }
    if (event.kind === 1068) return true;
    const kTags = event.tags.filter(([name]) => name === 'k').map(([, v]) => v);
    const KTags = event.tags.filter(([name]) => name === 'K').map(([, v]) => v);
    return kTags.includes('iso3166') || kTags.includes('geo') || KTags.includes('36639');
  });

  // Apply diversity for global feed
  if (!countryCode) {
    const { parseCountryIdentifier } = await import('@/lib/countryIdentifiers');
    const postsByCountry = new Map<string, NostrEvent[]>();
    const challenges: NostrEvent[] = [];

    filteredEvents.forEach(event => {
      if (event.kind === 36639) {
        challenges.push(event);
        return;
      }
      const iTag = event.tags.find(([name]) => name === 'i')?.[1];
      if (iTag) {
        const country = parseCountryIdentifier(iTag);
        if (country) {
          const existing = postsByCountry.get(country) || [];
          existing.push(event);
          postsByCountry.set(country, existing);
        }
      }
    });

    const diversePosts: NostrEvent[] = [];
    postsByCountry.forEach((posts, _country) => {
      const sorted = posts.sort((a, b) => b.created_at - a.created_at);
      diversePosts.push(...sorted.slice(0, 4)); // Top 4 posts per country for diversity
    });

    filteredEvents = [...challenges, ...diversePosts]
      .sort((a, b) => b.created_at - a.created_at);
  }

  return filteredEvents.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Polls for new posts on a feed since a given timestamp.
 * Used for the "X new posts" banner without auto-updating the main feed.
 * 
 * @param countryCode - Country code to filter by (optional)
 * @param since - Unix timestamp to query posts after (exclusive - posts must be AFTER this timestamp)
 * @param enabled - Whether polling is enabled
 * @returns New posts array
 */
export function usePaginatedFeedNewPosts(
  countryCode: string | undefined,
  since: number | undefined,
  enabled: boolean
) {
  const feedRelays = useFeedRelays();

  const query = useInfiniteQuery({
    queryKey: ['pathos-feed-new-posts', countryCode, since],
    queryFn: async ({ signal: querySignal }) => {
      if (!since) return { events: [], oldestTimestamp: null, totalFetched: 0 };

      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      
      // Query for new posts AFTER the given timestamp (exclusive)
      const sinceTimestamp = since + 1;
      const filters: NostrFilter[] = [];

      if (countryCode) {
        const { getCountryFilterValues } = await import('@/lib/countryIdentifiers');
        const filterValues = getCountryFilterValues(countryCode, true);
        filters.push(
          { kinds: [1111, 1068], '#i': filterValues, since: sinceTimestamp, limit: 20 },
          { kinds: [36639], '#t': ['agora-challenge'], since: sinceTimestamp, limit: 5 }
        );
      } else {
        // Global feed format (if used without country)
        filters.push(
          { kinds: [1111, 1068], '#k': ['iso3166', 'geo'], since: sinceTimestamp, limit: 20 },
          { kinds: [36639], '#t': ['agora-challenge'], since: sinceTimestamp, limit: 5 }
        );
      }
      
      const events = await feedRelays.query(filters, { signal });
      const filteredEvents = await applyFeedFilters(events, countryCode);

      return {
        events: filteredEvents,
        oldestTimestamp: null,
        totalFetched: filteredEvents.length,
      };
    },
    initialPageParam: undefined,
    getNextPageParam: () => undefined, // No pagination for new posts poll
    enabled: enabled && !!since,
    refetchInterval: 60000, // Poll every 60s
    staleTime: 0, // Always fresh
  });

  // Flatten pages into single array
  const newPosts = query.data?.pages.flatMap(page => page.events) || [];

  return {
    ...query,
    newPosts,
  };
}
