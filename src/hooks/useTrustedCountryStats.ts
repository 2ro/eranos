import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useOrganizers } from '@/hooks/useOrganizers';
import { ADMIN_PUBKEYS } from '@/lib/admins';
import { parseStatsEvent } from '@/lib/statsParser';

// Re-export types for ergonomic single-import call sites.
export type {
  TopAction,
  TopPoster,
  TrendingHashtag,
  TopContributor,
  TopDonor,
  StatName,
  StatsTimeframe,
  TimeframedStats,
  TrustedCountryStats,
} from '@/lib/statsParser';

/**
 * Fetch the latest pre-computed community stats snapshot (kind 30385) for a
 * country. Trusted authors are platform admins plus the country's appointed
 * organizers — see NIP.md → Kind 30385 for the trust/auth model and tag schema.
 *
 * Returns `null` when no trusted snapshot is available.
 */
export function useTrustedCountryStats(countryCode?: string) {
  const { nostr } = useNostr();
  const { getOrganizersByCountry } = useOrganizers();

  return useQuery({
    queryKey: ['trusted-country-stats', countryCode],
    queryFn: async (c) => {
      if (!countryCode) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const upperCode = countryCode.toUpperCase();

      const organizers = getOrganizersByCountry(upperCode);
      const trustedAuthors = [
        ...organizers.map((o) => o.pubkey),
        ...ADMIN_PUBKEYS,
      ];

      if (trustedAuthors.length === 0) return null;

      const statsEvents = await nostr.query(
        [{
          kinds: [30385],
          authors: trustedAuthors,
          '#d': [`iso3166:${upperCode}`],
          limit: 10,
        }],
        { signal },
      );

      if (statsEvents.length === 0) return null;

      const latest = statsEvents.reduce((best, e) => (e.created_at > best.created_at ? e : best));
      return parseStatsEvent(latest);
    },
    enabled: !!countryCode,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
