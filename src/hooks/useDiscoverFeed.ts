import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { CAMPAIGN_KIND } from '@/lib/campaign';
import { shouldHideFeedEvent } from '@/lib/feedUtils';

const DISCOVER_PAGE_SIZE = 30;

/**
 * Kinds surfaced in the mixed Discover feed:
 *
 *  - **30223** — new campaign creations (addressable). When a campaign is
 *    minted or revised it bubbles back to the top, the same way a new
 *    Substack post would.
 *  - **1111** — NIP-22 comments. We pull two slices: comments scoped to
 *    countries (`#K = iso3166`) and comments scoped to communities
 *    (`#K = 34550`). Together these are "posts from the world" + "voices
 *    inside the communities".
 *  - **36639** — Agora pledges (challenges / civic calls). Always
 *    included because they're the most action-oriented funding signal.
 *
 * We deliberately *exclude* free-form kind 1 notes here — the Discover
 * page is the place to see content that's tagged to a real-world thread
 * (country, community, campaign), not the global text-note firehose. The
 * old plain feed still lives at `/feed`.
 */

/** Tag scopes we accept on kind 1111 comments. */
const COMMENT_K_SCOPES = ['iso3166', 'geo', '34550'];

/** Aliases we accept on kind 36639 pledge `t` tags. */
const ACTION_T_ALIASES = ['agora-action', 'pathos-challenge', 'agora-challenge'];

/**
 * Apply Discover-specific filtering after relay fetch. Drops events that
 * `shouldHideFeedEvent` flags (mutes, content filters happen later) and
 * any 1111 comment that lacks a recognised scope tag, since relays may
 * over-return when we union filters.
 */
function filterDiscoverEvents(events: NostrEvent[]): NostrEvent[] {
  return events
    .filter((event) => {
      if (shouldHideFeedEvent(event)) return false;
      if (event.kind === 1111) {
        const kTags = event.tags
          .filter(([n]) => n === 'k' || n === 'K')
          .map(([, v]) => v);
        return kTags.some((v) => COMMENT_K_SCOPES.includes(v));
      }
      return true;
    })
    .sort((a, b) => b.created_at - a.created_at);
}

/**
 * Public infinite feed for the Discover page. Streams together new
 * campaigns, world-tagged comments, community comments, and Agora
 * pledges, paginated by `created_at` cursor.
 *
 * Each page issues exactly one relay request (the union of all relevant
 * filters) to stay inside per-page rate budgets — the same pattern
 * `useWorldFeed` uses.
 *
 * Returns the standard `useInfiniteQuery` surface plus a flattened
 * `events` list for convenient consumption.
 */
export function useDiscoverFeed(enabled = true) {
  const { nostr } = useNostr();

  const query = useInfiniteQuery({
    queryKey: ['discover-feed'],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(8_000)]);
      const until = pageParam as number | undefined;

      const filters: NostrFilter[] = [
        // New / revised campaigns — addressable, so we lean on a small
        // limit and let the relay's natural newest-first ordering surface
        // recent edits. No `#k` scoping needed.
        {
          kinds: [CAMPAIGN_KIND],
          limit: Math.floor(DISCOVER_PAGE_SIZE / 3),
          ...(until && { until }),
        },
        // Community + country-scoped comments.
        {
          kinds: [1111],
          '#K': COMMENT_K_SCOPES,
          limit: DISCOVER_PAGE_SIZE,
          ...(until && { until }),
        },
        // Agora pledges.
        {
          kinds: [36639],
          '#t': ACTION_T_ALIASES,
          limit: Math.floor(DISCOVER_PAGE_SIZE / 3),
          ...(until && { until }),
        },
      ];

      const raw = await nostr.query(filters, { signal });
      const filtered = filterDiscoverEvents(raw);
      const page = filtered.slice(0, DISCOVER_PAGE_SIZE);

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
      if (lastPage.totalFetched < DISCOVER_PAGE_SIZE || !lastPage.oldestTimestamp) {
        return undefined;
      }
      return lastPage.oldestTimestamp - 1;
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Flatten + dedupe. Each addressable event may legitimately appear
  // across pages if a newer revision lands; we keep the newest version.
  const seen = new Set<string>();
  const events: NostrEvent[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }

  return {
    events,
    isLoading: query.isPending,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    pageCount: query.data?.pages.length,
  };
}
