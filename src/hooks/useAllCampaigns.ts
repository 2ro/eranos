import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

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
  /** Sort mode. `top` ranks by total sats raised; `none` is chronological. */
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

interface CampaignScore {
  /** Total satoshis raised across all kind 8333 donation receipts. */
  totalSats: number;
  /** Number of unique donors all-time. */
  donorCount: number;
}

const EMPTY_SCORE: CampaignScore = { totalSats: 0, donorCount: 0 };

/**
 * Loads kind 33863 campaigns with optional Top ranking (most-zapped first)
 * and free-text search applied client-side.
 *
 * **Why client-side rather than NIP-50?** Ditto's `sort:top` / `sort:hot`
 * NIP-50 extensions are designed for kind 1 notes — they weight by likes,
 * reposts, and replies, none of which apply to fundraising campaigns. The
 * campaign-native signal is donation volume (kind 8333 receipts tagged
 * with the campaign coord). The relay-side `search:` field has the same
 * problem: it's designed for note content, not addressable-event metadata.
 *
 * Computing rank + filter client-side gives:
 * - **Campaign-native ranking** by total sats raised, derived from kind
 *   8333 donation receipts (the same data shown on each card).
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

  // Step 2: fetch donation receipts for all campaigns in one batched query.
  // The `#a` filter accepts an array, so every relevant receipt comes back
  // in one round-trip. Only runs when Top is active — None doesn't need
  // the score data.
  const aTags = useMemo(() => (campaigns ?? []).map((c) => c.aTag), [campaigns]);
  const aTagsKey = useMemo(() => [...aTags].sort().join(','), [aTags]);

  const scoresQuery = useQuery({
    queryKey: ['campaigns-all-scores', aTagsKey],
    enabled: enabled && aTags.length > 0 && sort === 'top',
    queryFn: async (c): Promise<Map<string, CampaignScore>> => {
      const events = await nostr.query(
        [{ kinds: [8333], '#a': aTags, limit: 5000 }],
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(10_000)]) },
      );
      return aggregateScores(events, aTags);
    },
    staleTime: 30_000,
  });

  const scores = scoresQuery.data;

  // Step 3: apply search filter then sort.
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

    // Top: rank by total sats raised, then donor count, then newest.
    // While scores are still loading we fall back to chronological so the
    // page renders something useful; a subsequent render re-ranks once
    // scores arrive.
    const score = (aTag: string) => scores?.get(aTag) ?? EMPTY_SCORE;
    return [...pool].sort((a, b) => {
      const satsDiff = score(b.aTag).totalSats - score(a.aTag).totalSats;
      if (satsDiff !== 0) return satsDiff;
      const donorDiff = score(b.aTag).donorCount - score(a.aTag).donorCount;
      if (donorDiff !== 0) return donorDiff;
      return b.createdAt - a.createdAt;
    });
  }, [campaigns, scores, sort, trimmedSearch]);

  return {
    data: filteredSorted,
    isLoading: campaignsQuery.isLoading,
    isScoringLoading: scoresQuery.isLoading,
  };
}

/**
 * Aggregate kind 8333 donation receipts into per-coord scores. Only counts
 * events whose `#a` tag matches a known campaign coord and whose `amount`
 * tag is a positive finite number.
 *
 * NOTE: this is **self-reported** — per NIP.md a strict client would
 * verify each receipt against its on-chain transaction. Until that lands,
 * the ranking is trivially spoofable, same as the per-card totals.
 */
function aggregateScores(events: NostrEvent[], aTags: string[]): Map<string, CampaignScore> {
  const valid = new Set(aTags);
  const scores = new Map<string, CampaignScore>();
  const donorsByCoord = new Map<string, Set<string>>();

  for (const event of events) {
    const aTagsOnEvent = event.tags.filter(([n]) => n === 'a').map(([, v]) => v);
    const amountTag = event.tags.find(([n]) => n === 'amount')?.[1];
    const amount = amountTag ? Number(amountTag) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    for (const aTag of aTagsOnEvent) {
      if (!valid.has(aTag)) continue;
      const current = scores.get(aTag) ?? { ...EMPTY_SCORE };
      current.totalSats += amount;
      scores.set(aTag, current);

      let donors = donorsByCoord.get(aTag);
      if (!donors) {
        donors = new Set();
        donorsByCoord.set(aTag, donors);
      }
      donors.add(event.pubkey);
    }
  }

  for (const [aTag, donors] of donorsByCoord) {
    const s = scores.get(aTag);
    if (s) s.donorCount = donors.size;
  }

  return scores;
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
