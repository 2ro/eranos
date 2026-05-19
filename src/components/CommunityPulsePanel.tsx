/**
 * CommunityPulsePanel
 *
 * "Pulse" tab on the community detail page — an infinite-scrolling feed of
 * posts published by community members *outside* this community. The intent
 * is to surface what members are sharing in the wider Nostr ecosystem, as
 * opposed to the in-community Activity tab.
 *
 * Implementation notes:
 *   - Authors come from the community `rankMap` (founders + moderators +
 *     members). Without authors the relay would return the entire global
 *     timeline.
 *   - Kinds come from `getEnabledFeedKinds(feedSettings)` so the feed
 *     respects the user's "Notes / Articles / Reposts / etc." preferences,
 *     exactly like the home feed.
 *   - Events tagged with this community's `a` reference are dropped — those
 *     belong on the Activity tab.
 *   - Replies (NIP-10 / NIP-22) are dropped so the Pulse reads like a
 *     timeline of top-level posts, not threaded responses.
 *   - Mute list, content-warning, and repost unwrap behavior come for free
 *     by reusing `useTabFeed` + the `feedUtils` helpers.
 */
import { useEffect, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import type { NostrFilter } from '@nostrify/nostrify';

import { NoteCard } from '@/components/NoteCard';
import { FeedCard } from '@/components/FeedCard';
import { Skeleton } from '@/components/ui/skeleton';

import { useTabFeed } from '@/hooks/useProfileFeed';
import { useMuteList } from '@/hooks/useMuteList';

import { isEventMuted } from '@/lib/muteHelpers';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { isReplyEvent } from '@/lib/nostrEvents';

interface CommunityPulsePanelProps {
  /** `34550:<pubkey>:<d>` — used both for the cache key and the in-community filter. */
  communityATag: string;
  /** Author allowlist — founders + moderators + members. */
  memberPubkeys: string[];
  /** True while membership is still resolving; suppresses an empty-state flash. */
  isMembershipLoading: boolean;
}

export function CommunityPulsePanel({
  communityATag,
  memberPubkeys,
  isMembershipLoading,
}: CommunityPulsePanelProps) {
  const { muteItems } = useMuteList();
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  // Build the TabFeed filter — kinds default to the user's enabled feed kinds
  // (handled inside useTabFeed when `kinds` is omitted from the filter).
  const filter = useMemo<NostrFilter | null>(
    () => (memberPubkeys.length > 0 ? { authors: memberPubkeys } : null),
    [memberPubkeys],
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(filter, `community-pulse-${communityATag}`, memberPubkeys.length > 0);

  // Fetch next page when the sentinel scrolls into view.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /**
   * Drop events that reference *this* community via an `a` tag — they belong
   * to the Activity tab, not Pulse. We check both the original event and the
   * embedded event of a repost.
   */
  const referencesThisCommunity = (tags: string[][]): boolean => {
    for (const tag of tags) {
      if (tag[0] === 'a' && tag[1] === communityATag) return true;
    }
    return false;
  };

  // Flatten pages, dedupe, and apply mute / content-warning / reply /
  // in-community filters.
  const feedItems = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    return data.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (seen.has(key)) return false;
        seen.add(key);

        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;

        // Hide replies on original (non-repost) text notes; a repost of a
        // reply is still a legitimate top-level surface.
        if (item.event.kind === 1 && !item.repostedBy && isReplyEvent(item.event)) {
          return false;
        }

        // Drop anything authored against this community — that's Activity.
        if (referencesThisCommunity(item.event.tags)) return false;
        if (item.repostEvent && referencesThisCommunity(item.repostEvent.tags)) return false;

        return true;
      });
    // `referencesThisCommunity` and `communityATag` referenced via closure —
    // adding `communityATag` to deps is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pages, muteItems, communityATag]);

  // ── States ────────────────────────────────────────────────────────────────
  if (memberPubkeys.length === 0 && !isMembershipLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm px-5">
        No community members yet — nothing to surface here.
      </div>
    );
  }

  if ((isLoading || isMembershipLoading) && feedItems.length === 0) {
    return (
      <FeedCard className="mx-0 sm:mx-0 mt-2 divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </FeedCard>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm px-5">
        No posts from community members elsewhere yet.
      </div>
    );
  }

  return (
    <>
      <FeedCard className="mx-0 sm:mx-0 mt-2">
        {feedItems.map((item) => (
          <NoteCard
            key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
            event={item.event}
            repostedBy={item.repostedBy}
          />
        ))}
      </FeedCard>
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </>
  );
}
