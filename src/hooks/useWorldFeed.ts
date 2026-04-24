import { useNostr } from '@nostrify/react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMuteList } from './useMuteList';
import { useContentFilters } from './useContentFilters';
import { isEventMuted } from '@/lib/muteHelpers';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { DITTO_RELAYS } from '@/lib/appRelays';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/**
 * Kinds used in the world feed: geographic posts, polls, and challenges.
 */
const WORLD_KINDS = [1111, 1068];
const CHALLENGE_KIND = 36639;

/**
 * Canonical write tag is `agora-action`. We also accept `pathos-challenge`
 * and `agora-challenge` as read aliases so legacy events stay visible.
 */
const CHALLENGE_T_ALIASES = ['agora-action', 'pathos-challenge', 'agora-challenge'];

const DEFAULT_PAGE_SIZE = 20;

/**
 * Filter raw events to only include valid world feed events.
 * Keeps challenges, polls, and events with geographic tags.
 */
function filterWorldEvents(events: NostrEvent[]): NostrEvent[] {
  return events
    .filter(event => {
      if (event.kind === CHALLENGE_KIND) return true;
      if (event.kind === 1068) return true;
      const kTags = event.tags.filter(([name]) => name === 'k').map(([, v]) => v);
      const KTags = event.tags.filter(([name]) => name === 'K').map(([, v]) => v);
      return kTags.includes('iso3166') || kTags.includes('geo') || KTags.includes('36639');
    })
    .sort((a, b) => b.created_at - a.created_at);
}

/**
 * World feed hook: combines infinite-scroll pagination with live streaming
 * and a "X new posts" buffer.
 *
 * - Initial load + pagination: queries all country-tagged events globally,
 *   sorted by recency.
 * - Live streaming: opens a persistent subscription for new events,
 *   buffering them when the user is scrolled down.
 * - Flush: merges buffered events into the visible list with highlight
 *   animation support.
 */
export function useWorldFeed(enabled: boolean) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { shouldFilterEvent } = useContentFilters();

  // --- Streaming state ---
  const [streamEvents, setStreamEvents] = useState<NostrEvent[]>([]);
  const streamBufferRef = useRef<NostrEvent[]>([]);
  const [streamBufferCount, setStreamBufferCount] = useState(0);
  const isScrolledRef = useRef(false);
  const [flushedIds, setFlushedIds] = useState<Set<string>>(new Set());
  const flushedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const streamKnownIds = useRef(new Set<string>());

  // --- Pagination query ---
  const paginatedQuery = useInfiniteQuery({
    queryKey: ['world-feed'],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      const until = pageParam as number | undefined;

      const filters: NostrFilter[] = [
        { kinds: WORLD_KINDS, '#k': ['iso3166', 'geo'], limit: DEFAULT_PAGE_SIZE, ...(until && { until }) },
        { kinds: [CHALLENGE_KIND], '#t': CHALLENGE_T_ALIASES, limit: Math.floor(DEFAULT_PAGE_SIZE / 4), ...(until && { until }) },
      ];

      const events = await nostr.query(filters, { signal });
      const filtered = filterWorldEvents(events);
      const page = filtered.slice(0, DEFAULT_PAGE_SIZE);

      // Register all paginated event IDs so the stream doesn't duplicate them
      for (const e of page) {
        streamKnownIds.current.add(e.id);
      }

      const oldestTimestamp = page.length > 0
        ? page[page.length - 1].created_at
        : null;

      return {
        events: page,
        oldestTimestamp,
        totalFetched: filtered.length,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.totalFetched < DEFAULT_PAGE_SIZE || !lastPage.oldestTimestamp) {
        return undefined;
      }
      return lastPage.oldestTimestamp - 1;
    },
    enabled,
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  // --- Flush logic ---
  const doFlush = useCallback(() => {
    if (streamBufferRef.current.length === 0) return;
    const ids = new Set(streamBufferRef.current.map((e) => e.id));
    setStreamEvents((prev) => {
      const merged = [...prev, ...streamBufferRef.current];
      merged.sort((a, b) => b.created_at - a.created_at);
      return merged;
    });
    streamBufferRef.current = [];
    setStreamBufferCount(0);
    setFlushedIds(ids);
    clearTimeout(flushedTimerRef.current);
    flushedTimerRef.current = setTimeout(() => setFlushedIds(new Set()), 1500);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(flushedTimerRef.current), []);

  // Monitor scroll position
  useEffect(() => {
    const threshold = 200;
    function onScroll() {
      isScrolledRef.current = window.scrollY > threshold;
      if (!isScrolledRef.current && streamBufferRef.current.length > 0) {
        doFlush();
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [doFlush]);

  // --- Live streaming subscription ---
  useEffect(() => {
    if (!enabled) return;

    const ac = new AbortController();
    let alive = true;

    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const dittoRelay = nostr.group(DITTO_RELAYS);

        const streamFilters: NostrFilter[] = [
          { kinds: WORLD_KINDS, '#k': ['iso3166', 'geo'], since: now, limit: 0 },
          { kinds: [CHALLENGE_KIND], '#t': CHALLENGE_T_ALIASES, since: now, limit: 0 },
        ];

        for await (const msg of dittoRelay.req(streamFilters, { signal: ac.signal })) {
          if (!alive) break;
          if (msg[0] === 'EVENT') {
            const event = msg[2];

            // Reject future events
            if (event.created_at > Math.floor(Date.now() / 1000)) continue;

            // Deduplicate against paginated events and previously seen stream events
            if (streamKnownIds.current.has(event.id)) continue;
            streamKnownIds.current.add(event.id);

            if (isScrolledRef.current) {
              // Buffer when scrolled down
              streamBufferRef.current = [...streamBufferRef.current, event];
              setStreamBufferCount(streamBufferRef.current.length);
            } else {
              // Insert directly when at top
              setStreamEvents((prev) => {
                const merged = [...prev, event];
                merged.sort((a, b) => b.created_at - a.created_at);
                return merged;
              });
            }
          } else if (msg[0] === 'CLOSED') {
            break;
          }
        }
      } catch {
        // abort expected
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [nostr, enabled]);

  // Reset stream state when the feed is toggled off/on
  useEffect(() => {
    if (!enabled) {
      setStreamEvents([]);
      streamBufferRef.current = [];
      setStreamBufferCount(0);
      streamKnownIds.current.clear();
    }
  }, [enabled]);

  // --- Combine paginated + streamed events, apply filters ---
  const paginatedEvents = useMemo(() => {
    if (!paginatedQuery.data?.pages) return [];
    return paginatedQuery.data.pages.flatMap((page) => page.events);
  }, [paginatedQuery.data?.pages]);

  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...streamEvents, ...paginatedEvents];
    return combined
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        if (shouldHideFeedEvent(event)) return false;
        if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
        if (shouldFilterEvent(event)) return false;
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at);
  }, [streamEvents, paginatedEvents, muteItems, shouldFilterEvent]);

  // Count buffered events that pass filters
  const newPostCount = useMemo(() => {
    return streamBufferRef.current.filter((event) => {
      if (shouldHideFeedEvent(event)) return false;
      if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
      if (shouldFilterEvent(event)) return false;
      return true;
    }).length;
  // streamBufferCount triggers recalculation when buffer changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamBufferCount, muteItems, shouldFilterEvent]);

  return {
    events: allEvents,
    isLoading: paginatedQuery.isPending,
    isFetchingNextPage: paginatedQuery.isFetchingNextPage,
    hasNextPage: paginatedQuery.hasNextPage,
    fetchNextPage: paginatedQuery.fetchNextPage,
    newPostCount,
    flushStreamBuffer: doFlush,
    flushedIds,
  };
}
