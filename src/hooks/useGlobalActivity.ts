import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { ADMIN_PUBKEYS } from '@/lib/admins';

/**
 * Per-country activity counts derived from kind 30385 community stats
 * snapshots. Returns a Map keyed by ISO 3166-1 alpha-2 country code → comment
 * count.
 *
 * Only events from trusted admin publishers are consumed — see NIP.md →
 * Kind 30385. The global aggregate (`iso3166:ZZ`) is intentionally skipped so
 * the map only renders per-country dots.
 */
export function useGlobalActivity() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['agora-global-activity-counts'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]);

      const statsEvents = await nostr.query(
        [{
          kinds: [30385],
          authors: ADMIN_PUBKEYS,
          limit: 500,
        }],
        { signal },
      );

      const activityByCountry = new Map<string, number>();

      for (const event of statsEvents) {
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        if (!dTag?.startsWith('iso3166:')) continue;

        const code = dTag.slice(8);
        if (code === 'ZZ') continue;

        const commentCnt = event.tags.find(([n]) => n === 'comment_cnt')?.[1];
        const count = commentCnt ? parseInt(commentCnt, 10) || 0 : 0;
        if (count <= 0) continue;

        // Keep the highest count when multiple events exist for the same code.
        const existing = activityByCountry.get(code) ?? 0;
        if (count > existing) activityByCountry.set(code, count);
      }

      return activityByCountry;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Top trending hashtag (7-day window) per country, sourced from the same
 * kind 30385 snapshots that `useGlobalActivity` reads. Returns a Map keyed by
 * ISO 3166-1 alpha-2 country code → bare hashtag (no `#`).
 */
export function useTopCountryHashtags() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['agora-top-country-hashtags'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]);

      const statsEvents = await nostr.query(
        [{
          kinds: [30385],
          authors: ADMIN_PUBKEYS,
          limit: 500,
        }],
        { signal },
      );

      const topHashtagByCountry = new Map<string, string>();

      for (const event of statsEvents) {
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        if (!dTag?.startsWith('iso3166:')) continue;

        const code = dTag.slice(8);
        if (code === 'ZZ') continue;

        const hashtagTag = event.tags.find(([n]) => n === 'trending_hashtag_7d');
        if (hashtagTag?.[1]) topHashtagByCountry.set(code, hashtagTag[1]);
      }

      return topHashtagByCountry;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}
