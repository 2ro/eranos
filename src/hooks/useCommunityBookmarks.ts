import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import { parseATagCoordinate } from '@/lib/nostrEvents';
import { toast } from '@/hooks/useToast';

/** NIP-51 Communities list — kind 10004. */
export const COMMUNITIES_LIST_KIND = 10004;

const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/i;

/** Parse and validate a NIP-51 community list coordinate. */
export function parseCommunityBookmarkATag(aTag: string): { pubkey: string; dTag: string } | undefined {
  const coord = parseATagCoordinate(aTag);
  if (!coord || coord.kind !== COMMUNITY_DEFINITION_KIND) return undefined;
  if (!HEX_PUBKEY_RE.test(coord.pubkey) || !coord.identifier) return undefined;
  return { pubkey: coord.pubkey, dTag: coord.identifier };
}

/**
 * Hook to manage the user's NIP-51 Communities list (kind 10004).
 *
 * This list stores `a` tag coordinates for kind 34550 community definitions
 * that the user follows. Unlike `useBookmarks` (kind 10003)
 * which targets event IDs, this list targets addressable coordinates so the
 * reference remains stable across community updates.
 */
export function useCommunityBookmarks() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Query the user's communities list (kind 10004 — replaceable event)
  const listQuery = useQuery({
    queryKey: ['community-bookmarks', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;
      const events = await nostr.query([{
        kinds: [COMMUNITIES_LIST_KIND],
        authors: [user.pubkey],
        limit: 1,
      }]);
      return events[0] ?? null;
    },
    enabled: !!user,
  });

  // Extract bookmarked community a-tags (only `34550:` coordinates)
  const bookmarkedATags: string[] = (listQuery.data?.tags ?? [])
    .filter(([name, value]) =>
      name === 'a' && typeof value === 'string' && !!parseCommunityBookmarkATag(value),
    )
    .map(([, value]) => value);

  /** Check if a community `a` tag coordinate is bookmarked. */
  function isBookmarked(aTag: string): boolean {
    return bookmarkedATags.includes(aTag);
  }

  /**
   * Toggle bookmark for a given community coordinate.
   * `aTag` is expected to be a `34550:<pubkey>:<d-tag>` string.
   * `relayHint` is optional — appended to the tag per NIP-51 when provided.
   */
  const toggleBookmark = useMutation({
    mutationFn: async ({ aTag, relayHint }: { aTag: string; relayHint?: string }) => {
      if (!user) throw new Error('User is not logged in');

      // Fetch the freshest kind 10004 from relays before mutating
      const prev = await fetchFreshEvent(nostr, {
        kinds: [COMMUNITIES_LIST_KIND],
        authors: [user.pubkey],
      });

      const currentTags = prev?.tags ?? [];
      const currentlyBookmarked = currentTags.some(
        ([name, value]) => name === 'a' && value === aTag,
      );

      let newTags: string[][];

      if (currentlyBookmarked) {
        // Remove all matching a-tags for this coordinate
        newTags = currentTags.filter(
          ([name, value]) => !(name === 'a' && value === aTag),
        );
      } else {
        // Append the new bookmark per NIP-51 recommendation
        const newTag: string[] = relayHint ? ['a', aTag, relayHint] : ['a', aTag];
        newTags = [...currentTags, newTag];
      }

      await publishEvent({
        kind: COMMUNITIES_LIST_KIND,
        content: prev?.content ?? '',
        tags: newTags,
        created_at: Math.floor(Date.now() / 1000),
        prev: prev ?? undefined,
      });

      // Return whether this was a remove or add so onSuccess can pick the
      // right toast wording. Callbacks live on the mutation (not per-call)
      // so they still fire when the triggering UI (e.g. a dialog) unmounts
      // before the publish resolves.
      return { removed: currentlyBookmarked };
    },
    onSuccess: ({ removed }) => {
      queryClient.invalidateQueries({ queryKey: ['community-bookmarks', user?.pubkey] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['community-activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['followed-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-home-activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['following-feed'] });
      toast({
        title: removed ? 'Community unfollowed' : 'Community followed',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to update community follow',
        variant: 'destructive',
      });
    },
  });

  return {
    /** The kind 10004 list event itself. */
    listEvent: listQuery.data,
    /** Array of followed community `a` tag coordinates from kind 10004. */
    bookmarkedATags,
    /** Whether the list query is still loading. */
    isLoading: listQuery.isLoading,
    /** Check whether a given `a` tag coordinate is bookmarked. */
    isBookmarked,
    /** Toggle a kind 10004 community follow on/off. */
    toggleBookmark,
  };
}
