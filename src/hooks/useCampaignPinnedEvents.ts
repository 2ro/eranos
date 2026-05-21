import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

const CAMPAIGN_PIN_LIST_KIND = 30078;
const CAMPAIGN_PIN_D_TAG_PREFIX = 'agora-campaign-pins:';

function campaignPinDTag(campaignATag: string): string {
  return `${CAMPAIGN_PIN_D_TAG_PREFIX}${campaignATag}`;
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

export function useCampaignPinnedEvents(campaignATag: string, campaignAuthorPubkey: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const dTag = campaignPinDTag(campaignATag);
  const canManagePins = user?.pubkey === campaignAuthorPubkey;

  const pinnedListQuery = useQuery({
    queryKey: ['campaign-pinned-events-list', campaignATag, campaignAuthorPubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [CAMPAIGN_PIN_LIST_KIND], authors: [campaignAuthorPubkey], '#d': [dTag], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events[0] ?? null;
    },
    staleTime: 30_000,
  });

  const pinnedIds = parsePinnedIds(pinnedListQuery.data);

  const pinnedEventsQuery = useQuery({
    queryKey: ['campaign-pinned-events', campaignATag, pinnedIds],
    queryFn: async ({ signal }) => {
      if (pinnedIds.length === 0) return [];
      const events = await nostr.query(
        [{ ids: pinnedIds, limit: pinnedIds.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    },
    enabled: pinnedIds.length > 0,
    staleTime: 30_000,
  });

  const togglePin = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('User is not logged in');
      if (user.pubkey !== campaignAuthorPubkey) throw new Error('Only the campaign author can pin updates.');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [CAMPAIGN_PIN_LIST_KIND],
        authors: [campaignAuthorPubkey],
        '#d': [dTag],
      });

      const current = parsePinnedIds(prev);
      const next = current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [eventId, ...current.filter((id) => id !== eventId)];

      await publishEvent({
        kind: CAMPAIGN_PIN_LIST_KIND,
        content: JSON.stringify({ pinnedEvents: next }),
        tags: [
          ['d', dTag],
          ['a', campaignATag],
          ['k', campaignATag.split(':')[0] ?? '30223'],
          ['alt', 'Pinned campaign activity'],
        ],
        prev: prev ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-pinned-events-list', campaignATag, campaignAuthorPubkey] });
      queryClient.invalidateQueries({ queryKey: ['campaign-pinned-events', campaignATag] });
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
