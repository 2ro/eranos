import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CAMPAIGN_KIND, type ParsedCampaign } from '@/lib/campaign';
import { parseCampaignEvents } from '@/hooks/useCampaigns';
import type { Nip50Sort } from '@/hooks/useNip50Search';

/** Sort modes for the All Campaigns page. */
export type CampaignSort = 'top' | 'none';

/**
 * Map the toolbar's sort vocabulary (`default` / `top` / `new`) onto
 * `useAllCampaigns`'s vocabulary (`top` / `none`). `'new'` and `'default'`
 * both map to `'none'` (chronological) — discovery sections apply the
 * "show featured only when idle" framing on top of the chronological
 * feed, so the underlying query doesn't need to distinguish them.
 *
 * Exported so the section component and any page-level consumer using
 * the same hook stay aligned through one helper instead of two
 * hand-rolled ternaries.
 */
export const toQuerySort = (s: Nip50Sort): CampaignSort =>
  s === 'top' ? 'top' : 'none';

interface UseAllCampaignsOptions {
  /** Sort mode. `top` currently ranks by recency; `none` is chronological. */
  sort: CampaignSort;
  /** Already-debounced free-text search query. Empty string disables search. */
  search: string;
  /**
   * Optional ISO 3166-1 alpha-2 country code to narrow by. When set,
   * the relay query is constrained with a NIP-73 `#i` tag filter
   * (`iso3166:XX` + legacy `geo:XX`) so only campaigns tagged for that
   * country are returned. Picking a country with no typed query still
   * produces a useful filtered grid.
   */
  countryCode?: string;
  /** Maximum events to fetch. Default 200. */
  limit?: number;
  /** Disable the query (e.g. while waiting on dependent state). */
  enabled?: boolean;
}

/**
 * Loads kind 33863 campaigns with free-text search applied client-side.
 *
 * **Why client-side rather than NIP-50?** Ditto's `sort:top` / `sort:hot`
 * NIP-50 extensions are designed for kind 1 notes — they weight by likes,
 * reposts, and replies, none of which apply to fundraising campaigns. The
 * relay-side `search:` field has the same problem: it's designed for note
 * content, not addressable-event metadata.
 *
 * Computing filter + sort client-side gives:
 * - **Full relay coverage** — we fetch from the user's default pool, not
 *   just Ditto, so campaigns published anywhere are discoverable.
 * - **Search that actually matches** — substring across title, summary,
 *   and story.
 *
 * Tradeoff: we fetch up to `limit` (default 200) campaigns regardless of
 * search, then filter in JavaScript. At current campaign volume this is
 * comfortable; if we outgrow it we'll need server-side indexing.
 */
export function useAllCampaigns({
  sort,
  search,
  countryCode,
  limit = 200,
  enabled = true,
}: UseAllCampaignsOptions) {
  const { nostr } = useNostr();
  const trimmedSearch = search.trim().toLowerCase();
  const country = countryCode?.toUpperCase();

  // Step 1: fetch the universe of campaigns from the default pool.
  const campaignsQuery = useQuery({
    queryKey: ['campaigns-all', limit, country ?? null],
    enabled,
    queryFn: async (c) => {
      const filter: { kinds: number[]; limit: number; '#i'?: string[] } = {
        kinds: [CAMPAIGN_KIND],
        limit,
      };
      if (country) {
        // NIP-73 `i`-tag values for the country. We send both the
        // canonical `iso3166:` form and the legacy `geo:` form so
        // campaigns tagged either way are returned.
        filter['#i'] = [`iso3166:${country}`, `geo:${country}`];
      }
      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]) },
      );
      return parseCampaignEvents(events, { sortByCreatedAt: true });
    },
    staleTime: 30_000,
  });

  const campaigns = campaignsQuery.data;

  // Step 2: apply search filter then sort.
  const filteredSorted = useMemo<ParsedCampaign[]>(() => {
    if (!campaigns) return [];

    let pool = campaigns;
    if (trimmedSearch) {
      pool = campaigns.filter((c) => matchesQuery(c, trimmedSearch));
    }

    if (sort === 'none') {
      // `parseCampaignEvents` already returned newest-first; keep that.
      return pool;
    }

    // Top: rank by recency (newest first).
    return [...pool].sort((a, b) => b.createdAt - a.createdAt);
  }, [campaigns, sort, trimmedSearch]);

  return {
    data: filteredSorted,
    isLoading: campaignsQuery.isLoading,
  };
}

/**
 * Case-insensitive substring match across the campaign's user-visible
 * text fields. Query is expected pre-lowercased.
 */
function matchesQuery(campaign: ParsedCampaign, lowerQuery: string): boolean {
  if (campaign.title.toLowerCase().includes(lowerQuery)) return true;
  if (campaign.summary.toLowerCase().includes(lowerQuery)) return true;
  if (campaign.story.toLowerCase().includes(lowerQuery)) return true;
  return false;
}
