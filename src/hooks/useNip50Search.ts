import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { DITTO_RELAYS } from '@/lib/appRelays';

/**
 * Sort modes the toolbar exposes — drives NIP-50 `sort:*` tokens and
 * also whether the hook is active when the query box is empty.
 *
 * - `'default'`: the curated/default view. Empty query → inactive (the
 *   page renders its own featured/discovery layout). A typed query
 *   still activates a search, sorted by the relay's default ranking
 *   (chronological in practice).
 * - `'top'`: NIP-50 `sort:top`. Empty query → active with `sort:top`
 *   alone, giving an engagement-ranked feed of the entire kind.
 * - `'new'`: chronological. Empty query → active with the kind alone
 *   (no `search` field), giving a chronological "all events of this
 *   kind" feed. A typed query stays chronological.
 */
export type Nip50Sort = 'default' | 'top' | 'new';

interface UseNip50SearchOptions<T> {
  /** Kind to search. NIP-50 search applies to events of this kind only. */
  kind: number;
  /** Debounced, untrimmed search query. The hook trims and gates internally. */
  query: string;
  /**
   * Parser/validator. Return `null` for events that don't conform to the
   * expected shape (missing required tags, etc.). Nulls are dropped from
   * the result list.
   */
  parse: (event: NostrEvent) => T | null;
  /** Sort mode (see {@link Nip50Sort}). Defaults to `'default'`. */
  sort?: Nip50Sort;
  /** Hard cap on relay results. Default 60. */
  limit?: number;
  /**
   * When `true` (default), addressable-event semantics are applied: results
   * are deduped by `(pubkey, d-tag)` keeping the newest revision. Set to
   * `false` for non-addressable kinds (e.g. kind 1 notes).
   */
  addressable?: boolean;
  /**
   * Optional NIP-73 `i`-tag values to filter on (e.g.
   * `['iso3166:US', 'geo:US']` for a country-scoped search). Forwarded
   * as a standard `#i` filter alongside the `search` field, so the
   * relay returns the intersection. Any single value matches (relay
   * `#i` is OR-of-values).
   *
   * Supplying a non-empty array also **activates** the hook even when
   * the query is empty and the sort is `'default'`, so picking a
   * country (with no typed query) drives the page into the search/
   * filtered view the same way typing a query does.
   */
  iTags?: string[];
  /**
   * Per-event keyword sources used for client-side keyword matching when
   * `query` is non-empty. Many structured kinds (34550 organizations,
   * 36639 pledges, 33863 campaigns) carry the title in tags rather than
   * `content`, and most NIP-50 implementations only match `content`. We
   * widen the net by re-filtering the relay response against a list of
   * caller-supplied strings (e.g. `title`/`name`/`summary` tag values +
   * `content`). Returning `null` for an event drops it from the results.
   *
   * Optional — when omitted, no client-side keyword filtering is applied
   * (relay results pass through unchanged).
   */
  getKeywordHaystack?: (event: NostrEvent) => string[] | null;
}

interface UseNip50SearchResult<T> {
  data: T[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** `true` when the search hook is actively driving the page. */
  isActive: boolean;
}

/**
 * Generic NIP-50 search hook used by the discovery pages (Campaigns,
 * Communities, Pledges). Targets the Ditto search-capable relay group
 * (`DITTO_RELAYS`) explicitly rather than the default pool because most
 * non-Ditto relays either ignore the `search` field (returning everything
 * matching the other filters) or return nothing — both modes break the
 * UX. Pinning to `nostr.group(DITTO_RELAYS)` gives a predictable result
 * set; downside is search quality is bound to Ditto's index.
 *
 * Hybrid matching. Many structured kinds keep the human-readable
 * label in tags (`title`, `name`, `summary`), not in `content`. NIP-50
 * relays SHOULD match against `content` and MAY match against other
 * fields, so relay-side hits alone can miss obvious matches. When a
 * caller supplies `getKeywordHaystack`, the hook post-filters the
 * relay response against that haystack (case-insensitive substring
 * match) so the title/name/summary tags are searched too. This costs
 * a small amount of false-negative recall (we still rely on the relay
 * to surface the candidate event in the first place) but fixes the
 * "search returns nothing" failure mode for kinds whose title lives
 * outside `content`.
 *
 * Active states (when the hook fires a relay request):
 *  - keyword + any sort   → relay sees `search: '<query>'` (or
 *    `'<query> sort:top'` for Top); client-side keyword filter runs
 *    over the response when `getKeywordHaystack` is supplied.
 *  - empty keyword + Top  → `search: 'sort:top'` (a top feed).
 *  - empty keyword + New  → no `search` field (a chronological feed
 *    of the kind from the relay group).
 *  - empty keyword + Default → hook is inactive; page renders its
 *    curated/default layout.
 *
 * `placeholderData: prev` preserves the previous result list across
 * keystrokes for a less janky feel.
 */
export function useNip50Search<T>({
  kind,
  query,
  parse,
  sort = 'default',
  limit = 60,
  addressable = true,
  iTags,
  getKeywordHaystack,
}: UseNip50SearchOptions<T>): UseNip50SearchResult<T> {
  const { nostr } = useNostr();
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 1;
  const hasITags = !!iTags && iTags.length > 0;

  // The hook is "active" — drives the page body — whenever:
  //   - The user typed something (any sort), OR
  //   - They picked Top or New as the sort (which both produce a flat
  //     feed even with an empty box), OR
  //   - They picked an `i`-tag filter (e.g. a country) with no other
  //     input — narrowing the kind by external identifier still
  //     deserves the filtered grid view.
  // Empty + Default + no iTags is the curated fall-through case.
  const enabled = hasQuery || sort === 'top' || sort === 'new' || hasITags;

  // Build the NIP-50 search payload for the active cases. `undefined`
  // means "don't send a `search` field at all" which is the chronological
  // empty-query case.
  const searchPayload: string | undefined = (() => {
    if (!enabled) return undefined;
    if (sort === 'top') {
      return hasQuery ? `${trimmed} sort:top` : 'sort:top';
    }
    // 'new' or 'default' — both send the raw query when present, and
    // for empty-query Top is handled above.
    if (hasQuery) return trimmed;
    // empty + 'new', or empty + 'default' with iTags only — no search
    // field, just the kind filter (+ #i if supplied).
    return undefined;
  })();

  // Lowercased keyword for client-side filter; kept stable across
  // keystrokes by reading from the trimmed query directly.
  const keyword = hasQuery ? trimmed.toLowerCase() : '';

  // Stable key for the `#i` filter — sorted so reordering doesn't bust
  // the cache. `null` rather than `undefined`/`[]` so the cache key
  // serializes consistently.
  const iTagsKey = hasITags ? [...iTags!].sort().join(',') : null;

  const result = useQuery<T[]>({
    queryKey: ['nip50-search', kind, searchPayload ?? null, limit, addressable, keyword, iTagsKey],
    enabled,
    queryFn: async ({ signal }) => {
      const group = nostr.group(DITTO_RELAYS);
      const filter: { kinds: number[]; limit: number; search?: string; '#i'?: string[] } = {
        kinds: [kind],
        limit,
      };
      if (searchPayload !== undefined) {
        filter.search = searchPayload;
      }
      if (hasITags) {
        filter['#i'] = iTags!;
      }
      const events = await group.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Step 1: dedupe by (pubkey, d) for addressable kinds, preserving
      // relay order so `sort:top` scoring sticks.
      let orderedEvents: NostrEvent[];
      if (addressable) {
        const seenCoord = new Set<string>();
        const latestByCoord = new Map<string, NostrEvent>();

        // First pass: pick the newest event per coord.
        for (const event of events) {
          const d = event.tags.find(([n]) => n === 'd')?.[1];
          if (!d) continue;
          const key = `${event.pubkey}:${d}`;
          const prev = latestByCoord.get(key);
          if (!prev || event.created_at > prev.created_at) {
            latestByCoord.set(key, event);
          }
        }

        // Second pass: walk events in relay order and emit each coord
        // once, using its latest revision.
        orderedEvents = [];
        for (const event of events) {
          const d = event.tags.find(([n]) => n === 'd')?.[1];
          if (!d) continue;
          const key = `${event.pubkey}:${d}`;
          if (seenCoord.has(key)) continue;
          seenCoord.add(key);
          const latest = latestByCoord.get(key);
          if (latest) orderedEvents.push(latest);
        }
      } else {
        orderedEvents = events;
      }

      // Step 2: optional client-side keyword filter. Only runs when the
      // caller wired up a haystack AND the user actually typed something
      // (empty keyword = nothing to match against, just pass through).
      // Each haystack string is matched case-insensitively as a substring
      // of the lowercased keyword. Any single match keeps the event;
      // events whose haystack returns `null` are dropped (lets the
      // caller pre-reject malformed events without parsing twice).
      let filteredEvents: NostrEvent[];
      if (getKeywordHaystack && keyword) {
        filteredEvents = [];
        for (const event of orderedEvents) {
          const haystack = getKeywordHaystack(event);
          if (haystack === null) continue;
          const hit = haystack.some((field) =>
            field.toLowerCase().includes(keyword),
          );
          if (hit) filteredEvents.push(event);
        }
      } else {
        filteredEvents = orderedEvents;
      }

      // Step 3: parse and drop nulls.
      const parsed: T[] = [];
      for (const event of filteredEvents) {
        const next = parse(event);
        if (next !== null) parsed.push(next);
      }
      return parsed;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isActive: enabled,
  };
}
