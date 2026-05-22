import { useCallback, useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAgoraFeed } from '@/hooks/useAgoraFeed';
import { useFeed, type FeedItem } from '@/hooks/useFeed';
import { useFollowList } from '@/hooks/useFollowActions';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';

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

/**
 * Orchestrates the three-mode home feed. Internally wires the appropriate
 * combination of {@link useFeed} (global / network kind 1 stream) and
 * {@link useAgoraFeed} (Agora activity mix), interleaving their results
 * chronologically and exposing a single pagination interface.
 */
export function useMixedFeed(mode: FeedMode, enabled: boolean) {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { muteItems } = useMuteList();

  // In Following mode, the Agora layer is filtered to authors the user
  // follows (plus themselves, matching the network feed convention).
  // Passing `authors: []` to useAgoraFeed intentionally disables the query
  // until the follow list has loaded — without this guard a logged-in user
  // would briefly see the global Agora mix before their follows arrive.
  const followAuthors = useMemo<string[] | undefined>(() => {
    if (mode !== 'following') return undefined;
    if (!user) return [];
    const follows = followData?.pubkeys;
    if (follows === undefined) return undefined; // still loading
    return follows.length > 0 ? [...follows, user.pubkey] : [user.pubkey];
  }, [mode, user, followData?.pubkeys]);

  // Following mode is gated on the follow list being loaded.
  const agoraEnabled = enabled && (mode !== 'following' || followAuthors !== undefined);
  const agoraOptions = useMemo(
    () => (followAuthors !== undefined ? { authors: followAuthors } : undefined),
    [followAuthors],
  );
  const agoraFeed = useAgoraFeed(agoraEnabled, agoraOptions);

  // Kind 1 layer: only used by 'all-nostr' (global) and 'following' (network).
  // 'agora' mode skips it entirely.
  const useNostrLayer = mode === 'all-nostr' || mode === 'following';
  const nostrTab = mode === 'following' ? 'network' : 'global';
  const nostrFeed = useFeed(nostrTab, { enabled: useNostrLayer && enabled });

  // Flatten kind 1 layer pages → FeedItem[].
  const nostrItems = useMemo<FeedItem[]>(() => {
    if (!useNostrLayer) return [];
    const pages = nostrFeed.data?.pages as unknown as { items: FeedItem[] }[] | undefined;
    return pages?.flatMap((page) => page.items) ?? [];
  }, [useNostrLayer, nostrFeed.data?.pages]);

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

  // Unified pagination — advance both layers when more is available.
  const agoraHasNext = agoraFeed.hasNextPage;
  const agoraFetchNext = agoraFeed.fetchNextPage;
  const nostrHasNext = nostrFeed.hasNextPage;
  const nostrFetchNext = nostrFeed.fetchNextPage;

  const fetchNextPage = useCallback(async () => {
    await Promise.all([
      agoraHasNext ? agoraFetchNext() : Promise.resolve(),
      useNostrLayer && nostrHasNext ? nostrFetchNext() : Promise.resolve(),
    ]);
  }, [agoraHasNext, agoraFetchNext, useNostrLayer, nostrHasNext, nostrFetchNext]);

  const hasNextPage = !!agoraHasNext || (useNostrLayer && !!nostrHasNext);
  const isFetchingNextPage = agoraFeed.isFetchingNextPage
    || (useNostrLayer && nostrFeed.isFetchingNextPage);
  const isLoading = agoraFeed.isLoading || (useNostrLayer && nostrFeed.isPending);

  return {
    items,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
