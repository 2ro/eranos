import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

const CALENDAR_EVENT_KINDS = [31922, 31923];

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function isValidCalendarEvent(event: NostrEvent): boolean {
  if (!CALENDAR_EVENT_KINDS.includes(event.kind)) return false;

  const d = getTag(event.tags, 'd');
  const title = getTag(event.tags, 'title');
  const start = getTag(event.tags, 'start');
  if (!d || !title || !start) return false;

  if (event.kind === 31922) {
    return /^\d{4}-\d{2}-\d{2}$/.test(start);
  }

  const startTs = parseInt(start, 10);
  return Number.isFinite(startTs) && startTs > 0;
}

/** Fetches NIP-52 calendar events scoped to a community via the uppercase `A` tag. */
export function useCommunityEvents(communityATag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['community-events', communityATag],
    queryFn: async ({ signal }): Promise<NostrEvent[]> => {
      if (!communityATag) return [];
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{ kinds: CALENDAR_EVENT_KINDS, '#A': [communityATag], limit: 50 }],
        { signal: combinedSignal },
      );

      return events.filter(isValidCalendarEvent);
    },
    enabled: !!communityATag,
    staleTime: 60_000,
  });
}
