import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { DITTO_RELAY } from '@/lib/appRelays';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { TrackedRegion } from '@/hooks/useEventDashboardConfig';

export interface RegionFeed {
  regionId: string;
  posts: NostrEvent[];
  count: number;
}

export interface UseMultiHashtagFeedOptions {
  /** Must be true for relay queries to fire. */
  enabled?: boolean;
}

const DUPLICATE_WINDOW_SECONDS = 600;
const QUERY_LIMIT = 2000;
const MAX_PAGES = 5;
const MAX_EVENTS = 10_000;
const OVERLAP_SECONDS = 60;
const PAGE_TIMEOUT_MS = 5000;
const POLL_TIMEOUT_MS = 8000;

/**
 * Normalize content for duplicate comparison: trim and collapse internal whitespace.
 */
export function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

/**
 * Build a fingerprint string for duplicate detection.
 */
export function eventFingerprint(event: NostrEvent): string {
  const tTags = event.tags
    .filter(([name]) => name === 't')
    .map(([, value]) => value)
    .sort()
    .join('\0');

  return `${event.pubkey}\0${event.kind}\0${normalizeContent(event.content)}\0${tTags}`;
}

/**
 * Remove near-duplicate posts within a 10-minute window.
 */
export function deduplicatePosts(posts: NostrEvent[]): NostrEvent[] {
  if (posts.length === 0) return posts;

  const groups = new Map<string, NostrEvent[]>();
  for (const post of posts) {
    const key = eventFingerprint(post);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(post);
  }

  const keptIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      keptIds.add(group[0].id);
      continue;
    }

    group.sort((a, b) => a.created_at - b.created_at);
    let lastKeptTime = group[0].created_at;
    keptIds.add(group[0].id);

    for (let i = 1; i < group.length; i++) {
      if (group[i].created_at - lastKeptTime > DUPLICATE_WINDOW_SECONDS) {
        lastKeptTime = group[i].created_at;
        keptIds.add(group[i].id);
      }
    }
  }

  return posts.filter((post) => keptIds.has(post.id));
}

/**
 * Hook for querying multiple hashtags with backfill + incremental polling.
 *
 * Two-phase strategy:
 * 1. Paginated backfill (up to MAX_PAGES pages of QUERY_LIMIT events).
 * 2. Incremental forward polling every 10s.
 */
export function useMultiHashtagFeed(
  regions: TrackedRegion[],
  since?: number | null,
  options?: UseMultiHashtagFeedOptions,
) {
  // Query DITTO_RELAY directly (NRelay1) instead of via NPool to avoid the
  // pool's 300ms eoseTimeout race condition on large #t filters (400+ values).
  // Kind 1111 dashboard events are published by Agora users to Ditto, so this
  // relay is the canonical source. Multi-relay can be added later if needed.
  const { nostr } = useNostr();
  const relay = useMemo(() => nostr.relay(DITTO_RELAY), [nostr]);
  const enabled = options?.enabled !== false;

  const allHashtags = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((region) => {
      region.hashtags.forEach((hashtag) => set.add(hashtag));
    });
    return Array.from(set).sort();
  }, [regions]);

  const queryKeyParts = useMemo(() => allHashtags.join(','), [allHashtags]);

  const eventMapRef = useRef(new Map<string, NostrEvent>());
  const highWaterMarkRef = useRef(0);
  const [backfillDone, setBackfillDone] = useState(false);

  const scopeKey = `${queryKeyParts}|${since ?? 0}`;
  const prevScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeRef.current !== scopeKey) {
      eventMapRef.current = new Map();
      highWaterMarkRef.current = 0;
      backfillDoneRef.current = false;
      setBackfillDone(false);
      prevScopeRef.current = scopeKey;
    }
  }, [scopeKey]);

  const backfillDoneRef = useRef(backfillDone);
  backfillDoneRef.current = backfillDone;

  const markBackfillDone = useCallback(() => setBackfillDone(true), []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['event-dashboard-feed', queryKeyParts, since ?? 0],
    queryFn: async ({ signal: querySignal }) => {
      if (allHashtags.length === 0) return [];

      const eventMap = eventMapRef.current;

      if (!backfillDoneRef.current) {
        // Resume from oldest known event so retries don't re-fetch from the top.
        let until: number | undefined = undefined;
        if (eventMap.size > 0) {
          let minTs = Infinity;
          for (const evt of eventMap.values()) {
            if (evt.created_at < minTs) minTs = evt.created_at;
          }
          until = minTs; // inclusive — eventMap deduplicates overlap
        }

        let completedCleanly = true;
        // Only set when we hit a definitive end: empty batch, reached `since`,
        // or relay confirms nothing older exists (sub-limit overlap page).
        let reachedEnd = false;

        for (let page = 0; page < MAX_PAGES; page++) {
          if (querySignal.aborted) { completedCleanly = false; break; }
          if (eventMap.size >= MAX_EVENTS) { reachedEnd = true; break; }

          const pageSignal = AbortSignal.any([
            querySignal,
            AbortSignal.timeout(PAGE_TIMEOUT_MS),
          ]);

          const filter: NostrFilter = {
            kinds: [1111],
            '#t': allHashtags,
            limit: QUERY_LIMIT,
            ...(since ? { since } : {}),
            ...(until !== undefined ? { until } : {}),
          };

          let batch: NostrEvent[];
          try {
            batch = await relay.query([filter], { signal: pageSignal });
          } catch {
            // NRelay1 throws on signal abort or timeout — do NOT mark backfill
            // as done. The next refetch (10s) will retry from the current cursor.
            completedCleanly = false;
            break;
          }

          if (batch.length === 0) { reachedEnd = true; break; }

          let newEventsInPage = 0;
          for (const event of batch) {
            if (!eventMap.has(event.id)) {
              eventMap.set(event.id, event);
              newEventsInPage++;
            }
            if (event.created_at > highWaterMarkRef.current) {
              highWaterMarkRef.current = event.created_at;
            }
          }

          const oldestInBatch = Math.min(...batch.map((e) => e.created_at));
          if (since && oldestInBatch <= since) { reachedEnd = true; break; }

          // Inclusive cursor: use oldestInBatch (not oldestInBatch - 1) to avoid
          // skipping events that share the boundary timestamp. The eventMap
          // deduplicates any overlap by event ID.
          if (until !== undefined && oldestInBatch >= until && newEventsInPage === 0) {
            // No timestamp progress and no new events. Check whether the relay
            // confirmed there's nothing older (returned fewer than limit) or the
            // boundary is saturated (returned exactly limit, all already-known).
            if (batch.length < QUERY_LIMIT) {
              // Sub-limit batch with no new events → relay has nothing older.
              reachedEnd = true;
              break;
            }
            // Batch at limit but all known → boundary timestamp is saturated.
            // Skip past it to probe for older events on the next iteration.
            until = oldestInBatch - 1;
          } else {
            until = oldestInBatch;
          }
        }

        // Mark backfill done only when we both avoided errors AND confirmed we
        // reached the end of available data. If the loop exhausted MAX_PAGES
        // without hitting an end condition, the next refetch will continue.
        if (completedCleanly && reachedEnd && !querySignal.aborted) {
          markBackfillDone();
        }
      } else {
        const pollSince = Math.max(
          highWaterMarkRef.current - OVERLAP_SECONDS,
          since ?? 0,
        );

        const pollSignal = AbortSignal.any([
          querySignal,
          AbortSignal.timeout(POLL_TIMEOUT_MS),
        ]);

        let batch: NostrEvent[];
        try {
          batch = await relay.query([{
            kinds: [1111],
            '#t': allHashtags,
            limit: QUERY_LIMIT,
            since: pollSince,
          }], { signal: pollSignal });
        } catch {
          // NRelay1 throws on signal abort — return current data.
          return deduplicatePosts(Array.from(eventMap.values()));
        }

        for (const event of batch) {
          if (!eventMap.has(event.id)) {
            eventMap.set(event.id, event);
          }
          if (event.created_at > highWaterMarkRef.current) {
            highWaterMarkRef.current = event.created_at;
          }
        }
      }

      return deduplicatePosts(Array.from(eventMap.values()));
    },
    enabled: enabled && regions.length > 0,
    refetchInterval: 10000,
    staleTime: 5000,
    placeholderData: (previousData) => previousData,
  });

  // Distribute posts into per-region buckets
  const regionFeeds: RegionFeed[] = useMemo(() => {
    if (!data || data.length === 0) {
      return regions.map((r) => ({ regionId: r.id, posts: [], count: 0 }));
    }

    const hashtagIndex = new Map<string, Set<string>>();
    regions.forEach((region) => {
      region.hashtags.forEach((hashtag) => {
        if (!hashtagIndex.has(hashtag)) {
          hashtagIndex.set(hashtag, new Set());
        }
        hashtagIndex.get(hashtag)!.add(region.id);
      });
    });

    const regionBuckets = new Map<string, Map<string, NostrEvent>>();
    regions.forEach((region) => {
      regionBuckets.set(region.id, new Map());
    });

    data.forEach((post) => {
      const territorialTags = post.tags
        .filter(([name]) => name === 't')
        .map(([, value]) => value);

      territorialTags.forEach((tag) => {
        const matchingRegions = hashtagIndex.get(tag);
        if (matchingRegions) {
          matchingRegions.forEach((regionId) => {
            regionBuckets.get(regionId)!.set(post.id, post);
          });
        }
      });
    });

    return regions.map((region) => {
      const postsMap = regionBuckets.get(region.id)!;
      const posts = Array.from(postsMap.values()).sort(
        (a, b) => b.created_at - a.created_at,
      );
      return { regionId: region.id, posts, count: posts.length };
    });
  }, [data, regions]);

  const globalPosts = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.created_at - a.created_at);
  }, [data]);

  return {
    regionFeeds,
    globalPosts,
    isLoading,
    isBackfilling: !backfillDone,
    error,
  };
}
