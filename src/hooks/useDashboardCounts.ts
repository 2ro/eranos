import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';
import type { TrackedRegion } from '@/hooks/useEventDashboardConfig';
import { getStateCodeForHashtag } from '@/lib/venezuelaTerritorial';

interface DashboardCounts {
  /** Global NIP-45 COUNT for all tracked hashtags, or null if unavailable. */
  globalCount: number | null;
  /** Per-state NIP-45 COUNTs keyed by state code, or null if unavailable. */
  stateCounts: Map<string, number> | null;
}

const COUNT_TIMEOUT_MS = 8000;

/**
 * Wraps relay.count() with graceful failure: returns null when the relay
 * does not support NIP-45, times out, or refuses the query.
 */
async function safeCount(
  relay: { count?: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<{ count: number; approximate?: boolean }> },
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<number | null> {
  if (!relay.count) return null;
  const timeoutSignal = AbortSignal.timeout(COUNT_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeoutSignal]);
  try {
    const result = await relay.count(filters, { signal: combined });
    return result.count;
  } catch {
    return null;
  }
}

/**
 * NIP-45 COUNT queries for the event dashboard.
 *
 * Provides a stable global count and per-state counts as a floor for
 * the event-based aggregation. Falls back to null if COUNT is unsupported.
 */
export function useDashboardCounts(
  regions: TrackedRegion[],
  since: number | null,
  options: { enabled: boolean },
) {
  const { nostr } = useNostr();
  const relay = useMemo(() => nostr.relay(DITTO_RELAY), [nostr]);

  // Collect all hashtags and group by state
  const { allHashtags, stateHashtagMap } = useMemo(() => {
    const all = new Set<string>();
    const byState = new Map<string, Set<string>>();

    for (const region of regions) {
      if (!region.type) continue;
      const codes = region.hashtags.length > 0 ? region.hashtags : (region.code ? [region.code] : []);
      for (const hashtag of codes) {
        all.add(hashtag);
        const stateCode = getStateCodeForHashtag(hashtag);
        if (stateCode) {
          if (!byState.has(stateCode)) byState.set(stateCode, new Set());
          byState.get(stateCode)!.add(hashtag);
        }
      }
    }

    return {
      allHashtags: Array.from(all).sort(),
      stateHashtagMap: byState,
    };
  }, [regions]);

  const queryKeyParts = allHashtags.join(',');

  const { data } = useQuery<DashboardCounts>({
    queryKey: ['dashboard-counts', queryKeyParts, since ?? 0],
    queryFn: async ({ signal }) => {
      if (allHashtags.length === 0) {
        return { globalCount: null, stateCounts: null };
      }

      const baseFilter: Partial<NostrFilter> = {
        kinds: [1111],
        '#t': allHashtags,
        ...(since ? { since } : {}),
      };

      // Global count
      const globalCount = await safeCount(relay, [baseFilter as NostrFilter], signal);

      // Per-state counts (parallel, max 24 queries)
      let stateCounts: Map<string, number> | null = null;

      if (globalCount !== null) {
        // Only attempt per-state if global succeeded (relay supports COUNT)
        const entries = Array.from(stateHashtagMap.entries());
        const results = await Promise.all(
          entries.map(async ([stateCode, hashtags]) => {
            const filter: NostrFilter = {
              kinds: [1111],
              '#t': Array.from(hashtags).sort(),
              ...(since ? { since } : {}),
            };
            const count = await safeCount(relay, [filter], signal);
            return [stateCode, count] as const;
          }),
        );

        stateCounts = new Map<string, number>();
        for (const [code, count] of results) {
          if (count !== null) {
            stateCounts.set(code, count);
          }
        }
      }

      return { globalCount, stateCounts };
    },
    enabled: options.enabled && allHashtags.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return data ?? { globalCount: null, stateCounts: null };
}
