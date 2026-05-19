import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { CAMPAIGN_KIND, type ParsedCampaign } from '@/lib/campaign';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { parseCampaignEvents } from '@/hooks/useCampaigns';

/** Sort modes for the All Campaigns page. */
export type CampaignSort = 'top' | 'hot' | 'none';

interface UseAllCampaignsOptions {
  /** Sort mode. `top` and `hot` query Ditto's NIP-50 extension. */
  sort: CampaignSort;
  /** Already-debounced free-text search query. Empty string disables search. */
  search: string;
  /** Maximum events to fetch. Default 200. */
  limit?: number;
  /** Disable the query (e.g. while waiting on dependent state). */
  enabled?: boolean;
}

/**
 * Loads kind 30223 campaigns with NIP-50 sort and free-text search.
 *
 * Routing:
 * - Any non-empty `search` field, including `sort:top`/`sort:hot`, goes to
 *   the Ditto relay group (`DITTO_RELAYS`) — Ditto is the only relay in
 *   Agora's pool implementing the NIP-50 sort/search extensions used here.
 *   See `src/lib/appRelays.ts` for the relay list.
 * - `sort: 'none'` with no search query uses the default user-configured
 *   pool, which gives the broadest possible campaign coverage. This is
 *   the only path that can surface campaigns published only to non-Ditto
 *   relays the user happens to have configured.
 *
 * Ordering:
 * - For `top` and `hot`, Ditto returns events score-desc. We preserve that
 *   order through dedupe (`parseCampaignEvents({ sortByCreatedAt: false })`)
 *   so we don't undo the relay's scoring.
 * - For `none`, results are sorted newest-`created_at`-first.
 *
 * Fallback:
 * - If `top`/`hot` returns zero events (cold cache, or Ditto doesn't yet
 *   weight engagement for kind 30223), we silently retry against the same
 *   Ditto group with the `search:` field stripped, so the user sees
 *   chronological campaigns rather than an empty page. Same pattern as
 *   `useMusicFeed.ts`.
 */
export function useAllCampaigns({
  sort,
  search,
  limit = 200,
  enabled = true,
}: UseAllCampaignsOptions) {
  const { nostr } = useNostr();
  const trimmedSearch = search.trim();

  return useQuery({
    queryKey: ['campaigns-all', sort, trimmedSearch, limit],
    enabled,
    queryFn: async (c) => {
      // Build the NIP-50 search string by joining non-empty parts.
      // `sort:top`/`sort:hot` are Ditto extensions on top of base NIP-50.
      const searchParts: string[] = [];
      if (trimmedSearch) searchParts.push(trimmedSearch);
      if (sort === 'top') searchParts.push('sort:top');
      else if (sort === 'hot') searchParts.push('sort:hot');
      const searchString = searchParts.join(' ');

      const filter: NostrFilter & { search?: string } = {
        kinds: [CAMPAIGN_KIND],
        limit,
      };
      if (searchString) filter.search = searchString;

      // Any NIP-50 search/sort field requires Ditto. Plain chronological
      // queries can hit the user's full relay pool.
      const target = searchString ? nostr.group(DITTO_RELAYS) : nostr;
      const timeout = AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]);

      const events = await target.query([filter as NostrFilter], { signal: timeout });

      // Fallback for empty top/hot responses: retry chronologically against
      // Ditto without the search field. Preserves the search query itself
      // if the user was searching; the only thing we drop is the sort.
      if (events.length === 0 && (sort === 'top' || sort === 'hot')) {
        const fallbackFilter: NostrFilter & { search?: string } = {
          kinds: [CAMPAIGN_KIND],
          limit,
        };
        if (trimmedSearch) fallbackFilter.search = trimmedSearch;
        const fallback = await target.query([fallbackFilter as NostrFilter], { signal: timeout });
        return parseCampaignEvents(fallback, {
          includeArchived: false,
          sortByCreatedAt: !trimmedSearch,
        });
      }

      // Preserve relay-scored order for top/hot/search; sort chronologically
      // otherwise.
      return parseCampaignEvents(events, {
        includeArchived: false,
        sortByCreatedAt: !searchString,
      });
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev as ParsedCampaign[] | undefined,
  });
}
