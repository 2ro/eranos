import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { isAddressableKind } from '@/lib/eventKinds';

interface DeleteEventParams {
  eventId: string;
  eventKind: number;
  /** For addressable events: the event's pubkey (author). */
  eventPubkey?: string;
  /** For addressable events: the `d` tag value. */
  eventDTag?: string;
}

/**
 * Prefixes of query keys that can contain a deleted event and therefore
 * need a refetch after a NIP-09 deletion. This is wider than the average
 * mutation invalidation — a deletion is inherently cross-cutting (a single
 * post can sit in the main feed, the author's profile feed, a country
 * feed, the community activity feed, a comment thread, and more), and
 * over-invalidating is cheap relative to leaving stale items on screen.
 */
const FEED_INVALIDATION_PREFIXES: ReadonlySet<string> = new Set([
  // Generic / legacy feed
  'feed',
  // Agora country feeds
  'agora-feed',
  'agora-feed-paginated',
  'agora-feed-new-posts',
  // Profile + likes
  'profile-feed',
  'profile-likes-infinite',
  'profile-media',
  'profile-pinned-events',
  // Replies + comments
  'replies',
  'nostr', // useComments (NIP-22) uses ['nostr', 'comments', ...]
  'event-comments',
  'wall-comments',
  'pinned-event-comments',
  'pinned-event-comments-list',
  // Notifications
  'notifications',
  'notifications-unread',
  // Campaigns & pledges
  'campaign',
  'campaigns',
  'campaigns-all',
  'campaigns-all-scores',
  'agora-action',
  'agora-actions',
  'community-actions',
  // Community / org activity surfaces
  'community-activity-feed',
  'organization-activity',
  'organization-home-activity-feed',
  // Trending & curated
  'trending',
  'trending-posts',
  'sorted-posts',
  'infinite-sorted-posts',
  'infinite-hot-feed',
  'ditto-curated-feed',
  'world-feed',
  'following-feed',
  'following-country-feed',
  'following-hashtag-feed',
  'my-feed',
  'tab-feed',
  'relay-feed',
  'domain-feed',
  // Misc per-event caches
  'event',
  'addr-event',
]);

/**
 * Hook to publish a kind 5 deletion request event (NIP-09).
 *
 * For addressable events (kinds 30000-39999), the deletion includes both
 * an `e` tag and an `a` tag so it works on relays that only support
 * e-tag deletion as well as relays that support a-tag deletion.
 *
 * After publishing, invalidates every feed-shaped cache so relays are
 * re-queried and the deleted event is no longer returned. The set is
 * deliberately broad — deletions are user-initiated and rare, and the
 * cost of an extra refetch is much smaller than the cost of leaving a
 * deleted post visible across the app.
 */
export function useDeleteEvent() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ eventId, eventKind, eventPubkey, eventDTag }: DeleteEventParams) => {
      if (!user) throw new Error('User is not logged in');

      const tags: string[][] = [
        ['e', eventId],
        ['k', String(eventKind)],
      ];

      // For addressable events, also include an 'a' tag so relays that
      // support a-tag deletion will also process the request.
      if (isAddressableKind(eventKind) && eventPubkey && eventDTag !== undefined) {
        tags.push(['a', `${eventKind}:${eventPubkey}:${eventDTag}`]);
      }

      await publishEvent({
        kind: 5,
        content: '',
        tags,
      });

      return eventId;
    },
    onSuccess: () => {
      // Invalidate every feed-shaped query so relays are re-queried and
      // the deleted event drops out of every surface it appeared on.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const root = q.queryKey[0];
          return typeof root === 'string' && FEED_INVALIDATION_PREFIXES.has(root);
        },
      });
    },
  });
}
