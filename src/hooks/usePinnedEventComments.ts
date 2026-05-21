import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

const PIN_LIST_KIND = 30078;
const PIN_D_TAG_PREFIX = 'agora-pinned-comments:';

function pinDTag(rootATag: string): string {
  return `${PIN_D_TAG_PREFIX}${rootATag}`;
}

function parsePinnedIds(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];

  try {
    const parsed = JSON.parse(event.content) as { pinnedEvents?: unknown };
    if (!Array.isArray(parsed.pinnedEvents)) return [];
    return parsed.pinnedEvents.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function usePinnedEventComments(rootATag: string | undefined, ownerPubkey: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const dTag = rootATag ? pinDTag(rootATag) : undefined;
  const canManagePins = !!user && !!ownerPubkey && user.pubkey === ownerPubkey;

  const pinnedListQuery = useQuery({
    queryKey: ['pinned-event-comments-list', rootATag, ownerPubkey],
    queryFn: async ({ signal }) => {
      if (!rootATag || !ownerPubkey || !dTag) return null;
      const events = await nostr.query(
        [{ kinds: [PIN_LIST_KIND], authors: [ownerPubkey], '#d': [dTag], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!rootATag && !!ownerPubkey && !!dTag,
    staleTime: 30_000,
  });

  const pinnedIds = parsePinnedIds(pinnedListQuery.data);

  const pinnedEventsQuery = useQuery({
    queryKey: ['pinned-event-comments', rootATag, pinnedIds],
    queryFn: async ({ signal }) => {
      if (pinnedIds.length === 0) return [];
      const events = await nostr.query(
        [{ ids: pinnedIds, limit: pinnedIds.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    },
    enabled: !!rootATag && pinnedIds.length > 0,
    staleTime: 30_000,
  });

  const togglePin = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('User is not logged in');
      if (!rootATag || !ownerPubkey || !dTag) throw new Error('Missing pin context.');
      if (user.pubkey !== ownerPubkey) throw new Error('Only the event owner can pin comments.');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [PIN_LIST_KIND],
        authors: [ownerPubkey],
        '#d': [dTag],
      });

      const current = parsePinnedIds(prev);
      const next = current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [eventId, ...current.filter((id) => id !== eventId)];

      await publishEvent({
        kind: PIN_LIST_KIND,
        content: JSON.stringify({ pinnedEvents: next }),
        tags: [
          ['d', dTag],
          ['a', rootATag],
          ['k', rootATag.split(':')[0] ?? ''],
          ['alt', 'Pinned event comments'],
        ],
        prev: prev ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-event-comments-list', rootATag, ownerPubkey] });
      queryClient.invalidateQueries({ queryKey: ['pinned-event-comments', rootATag] });
    },
  });

  return {
    pinnedIds,
    pinnedEvents: pinnedEventsQuery.data ?? [],
    isLoading: pinnedListQuery.isLoading || pinnedEventsQuery.isLoading,
    isPinned: (eventId: string) => pinnedIds.includes(eventId),
    canManagePins,
    togglePin,
  };
}
