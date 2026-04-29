import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { COLOR_MOMENT_KIND } from '@/lib/letterTypes';

/** Validate a color moment event. Returns the event if valid, null otherwise. */
function validateColorMoment(event: NostrEvent): NostrEvent | null {
  if (event.kind !== COLOR_MOMENT_KIND) return null;
  const colorTags = event.tags.filter(([name]) => name === 'c');
  if (colorTags.length < 3 || colorTags.length > 6) return null;
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!colorTags.every(([, color]) => hexColorRegex.test(color))) return null;
  return event;
}

/** Fetch a page of color moments for stationery infinite scroll */
export function useColorMomentsPage(limit = 24, until?: number, authors?: string[]) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['color-moments-page', limit, until, authors ?? null],
    queryFn: async () => {
      const filter = {
        kinds: [COLOR_MOMENT_KIND],
        limit,
        ...(until ? { until } : {}),
        ...(authors && authors.length > 0 ? { authors } : {}),
      };
      const events = await nostr.query([filter]);
      // Deduplicate by event id
      const seen = new Map<string, NostrEvent>();
      for (const e of events) seen.set(e.id, e);
      return Array.from(seen.values())
        .filter((e): e is NostrEvent => validateColorMoment(e) !== null)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });
}

