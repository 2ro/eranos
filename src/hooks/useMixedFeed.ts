import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useAgoraFeed } from '@/hooks/useAgoraFeed';
import { type FeedItem } from '@/hooks/useFeed';
import { useFollowList } from '@/hooks/useFollowActions';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { getPaginationCursor, shouldHideFeedEvent, isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { parseRepostContent } from '@/lib/feedUtils';

/**
 * The three feed modes available on the home `/feed` page.
 *
 * - `agora` — Agora content only (campaigns, pledges, donations, comments
 *   on Agora entities, communities, `#Agora`-tagged notes).
 * - `all-nostr` — global kind 1 stream from across the network plus the
 *   full Agora content mix, interleaved chronologically.
 * - `following` — same as `all-nostr` but every layer is filtered to authors
 *   you follow.
 */
export type FeedMode = 'agora' | 'all-nostr' | 'following';

const NOSTR_PAGE_SIZE = 30;
/** Kinds included in the "all Nostr" / "following" kind 1 layer. */
const NOSTR_LAYER_KINDS = [1, 6, 16];

interface NostrLayerPage {
  items: FeedItem[];
  oldestTimestamp: number | null;
  rawCount: number;
}

/**
 * A deliberately broad kind 1 + reposts query for the home feed's
 * non-Agora layers. Unlike `useFeed('global')`, which uses Ditto's
 * curated `sort:hot` NIP-50 extension and is filtered by user feed
 * settings, this query is a straight chronological pull of recent
 * kind 1 notes (plus reposts) so "All Nostr" actually lives up to
 * its name.
 */
function useNostrLayer({
  enabled,
  authors,
}: {
  enabled: boolean;
  /** When provided, restrict to these authors (Following mode). */
  authors?: string[];
}) {
  const { nostr } = useNostr();
  const authorsKey = authors ? [...authors].sort().join(',') : '';
  // If `authors` is provided but empty, the query is intentionally empty
  // (e.g. the user follows nobody).
  const authorsEmpty = authors !== undefined && authors.length === 0;
  const queryEnabled = enabled && !authorsEmpty;

  return useInfiniteQuery<NostrLayerPage, Error>({
    queryKey: ['nostr-layer', authorsKey],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(8_000)]);
      const until = pageParam as number | undefined;
      const now = Math.floor(Date.now() / 1000);

      const filter: NostrFilter = {
        kinds: NOSTR_LAYER_KINDS,
        limit: NOSTR_PAGE_SIZE,
        ...(authors && authors.length > 0 ? { authors } : {}),
        ...(until ? { until } : {}),
      };

      const raw = await nostr.query([filter], { signal });
      const valid = raw.filter((ev) => ev.created_at <= now);

      const items: FeedItem[] = [];
      for (const ev of valid) {
        if (isRepostKind(ev.kind)) {
          const embedded = parseRepostContent(ev);
          if (embedded && embedded.created_at <= now) {
            items.push({ event: embedded, repostedBy: ev.pubkey, sortTimestamp: ev.created_at });
          }
        } else {
          items.push({ event: ev, sortTimestamp: ev.created_at });
        }
      }

      const oldestTimestamp = valid.length > 0 ? getPaginationCursor(valid) : null;
      return { items, oldestTimestamp, rawCount: valid.length };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.rawCount === 0 || lastPage.oldestTimestamp === null) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    enabled: queryEnabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/**
 * Orchestrates the three-mode home feed. Internally wires the appropriate
 * combination of {@link useNostrLayer} (a broad chronological kind 1 +
 * reposts query) and {@link useAgoraFeed} (Agora activity mix),
 * interleaving their results chronologically and exposing a single
 * pagination interface.
 */
export function useMixedFeed(mode: FeedMode, enabled: boolean) {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { muteItems } = useMuteList();

  // In Following mode, both layers are filtered to authors the user
  // follows (plus themselves, matching the network feed convention).
  // Passing `authors: []` intentionally disables queries until the
  // follow list has loaded — without this guard a logged-in user
  // would briefly see the global mix before their follows arrive.
  const followAuthors = useMemo<string[] | undefined>(() => {
    if (mode !== 'following') return undefined;
    if (!user) return [];
    const follows = followData?.pubkeys;
    if (follows === undefined) return undefined; // still loading
    return follows.length > 0 ? [...follows, user.pubkey] : [user.pubkey];
  }, [mode, user, followData?.pubkeys]);

  // Following mode is gated on the follow list being loaded.
  const layersReady = enabled && (mode !== 'following' || followAuthors !== undefined);
  const agoraOptions = useMemo(
    () => (followAuthors !== undefined ? { authors: followAuthors } : undefined),
    [followAuthors],
  );
  const agoraFeed = useAgoraFeed(layersReady, agoraOptions);

  // Kind 1 layer: only used by 'all-nostr' and 'following'. 'agora' mode skips it.
  const useNostr = mode === 'all-nostr' || mode === 'following';
  const nostrLayer = useNostrLayer({
    enabled: layersReady && useNostr,
    authors: followAuthors,
  });

  // Flatten kind 1 layer pages → FeedItem[].
  const nostrItems = useMemo<FeedItem[]>(() => {
    if (!useNostr) return [];
    return nostrLayer.data?.pages.flatMap((page) => page.items) ?? [];
  }, [useNostr, nostrLayer.data?.pages]);

  // Flatten Agora layer events → FeedItem[].
  const agoraItems = useMemo<FeedItem[]>(
    () => agoraFeed.events.map((event: NostrEvent) => ({ event, sortTimestamp: event.created_at })),
    [agoraFeed.events],
  );

  // Merge both layers, dedupe by event id, apply mute filter, sort newest-first.
  const items = useMemo<FeedItem[]>(() => {
    const seen = new Map<string, FeedItem>();
    const consider = (item: FeedItem) => {
      const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
      if (!key) return;
      if (shouldHideFeedEvent(item.event)) return;
      if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return;
      const existing = seen.get(key);
      if (!existing || item.sortTimestamp > existing.sortTimestamp) {
        seen.set(key, item);
      }
    };
    for (const item of agoraItems) consider(item);
    for (const item of nostrItems) consider(item);
    return Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
  }, [agoraItems, nostrItems, muteItems]);

  // Unified pagination — advance both layers in lockstep when more is available.
  const agoraHasNext = agoraFeed.hasNextPage;
  const agoraFetchNext = agoraFeed.fetchNextPage;
  const nostrHasNext = nostrLayer.hasNextPage;
  const nostrFetchNext = nostrLayer.fetchNextPage;

  const fetchNextPage = useCallback(async () => {
    await Promise.all([
      agoraHasNext ? agoraFetchNext() : Promise.resolve(),
      useNostr && nostrHasNext ? nostrFetchNext() : Promise.resolve(),
    ]);
  }, [agoraHasNext, agoraFetchNext, useNostr, nostrHasNext, nostrFetchNext]);

  const hasNextPage = !!agoraHasNext || (useNostr && !!nostrHasNext);
  const isFetchingNextPage = agoraFeed.isFetchingNextPage
    || (useNostr && nostrLayer.isFetchingNextPage);
  const isLoading = agoraFeed.isLoading || (useNostr && nostrLayer.isPending);

  return {
    items,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
