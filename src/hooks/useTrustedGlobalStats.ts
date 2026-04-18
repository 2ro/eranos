import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { ADMIN_PUBKEYS } from '@/lib/admins';
import { parseStatsEvent } from '@/lib/statsParser';

/**
 * Fetch the latest pre-computed *global* community stats snapshot.
 *
 * The bot publishes a single addressable kind 30385 event with d-tag
 * `iso3166:ZZ` containing aggregated leaderboards across every country. Only
 * platform admins are trusted as the global publisher — see NIP.md → Kind 30385.
 */
export function useTrustedGlobalStats() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['trusted-global-stats'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]);

      const statsEvents = await nostr.query(
        [{
          kinds: [30385],
          authors: ADMIN_PUBKEYS,
          '#d': ['iso3166:ZZ'],
          limit: 10,
        }],
        { signal },
      );

      if (statsEvents.length === 0) return null;

      const latest = statsEvents.reduce((best, e) => (e.created_at > best.created_at ? e : best));
      return parseStatsEvent(latest);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
