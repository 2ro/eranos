import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { DITTO_RELAYS } from '@/lib/appRelays';

/** Sort modes the toolbar exposes — drives NIP-50 `sort:*` tokens. */
export type Nip50Sort = 'top' | 'new';

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
  /**
   * Ditto's NIP-50 sort extension. `'new'` (default) issues the raw search
   * query and relies on the relay's default chronological order. `'top'`
   * appends ` sort:top` so the relay scores results by engagement; this
   * also lets us run the hook with an empty keyword query (the sort token
   * alone is a valid NIP-50 search payload) to power a "Top" feed.
   */
  sort?: Nip50Sort;
  /** Hard cap on relay results. Default 60. */
  limit?: number;
  /**
   * When `true` (default), addressable-event semantics are applied: results
   * are deduped by `(pubkey, d-tag)` keeping the newest revision. Set to
   * `false` for non-addressable kinds (e.g. kind 1 notes).
   */
  addressable?: boolean;
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
 * set; downside is search is only as good as Ditto's index.
 *
 * Active states:
 *  - keyword-only            → `search: '<query>'`
 *  - keyword + Top sort      → `search: '<query> sort:top'`
 *  - empty keyword + Top sort → `search: 'sort:top'`   (a top feed)
 *  - empty keyword + New sort → hook is inactive; page renders its
 *    curated/default layout
 *
 * `placeholderData: prev` preserves the previous result list across
 * keystrokes for a less janky feel.
 */
export function useNip50Search<T>({
  kind,
  query,
  parse,
  sort = 'new',
  limit = 60,
  addressable = true,
}: UseNip50SearchOptions<T>): UseNip50SearchResult<T> {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  // Hook is "active" — i.e. drives the page body — whenever the user
  // typed something *or* picked Top. Empty + New = the default state,
  // no need to issue a search at all.
  const enabled = trimmed.length >= 1 || sort === 'top';

  // Assemble the NIP-50 search payload. Empty query + Top is the only
  // case where the payload is just the sort token; the keyword cases
  // either send the raw query or append the sort token after a space.
  const searchPayload = (() => {
    if (sort === 'top') {
      return trimmed ? `${trimmed} sort:top` : 'sort:top';
    }
    return trimmed;
  })();

  const result = useQuery<T[]>({
    queryKey: ['nip50-search', kind, searchPayload, limit, addressable],
    enabled,
    queryFn: async ({ signal }) => {
      const group = nostr.group(DITTO_RELAYS);
      const events = await group.query(
        [{ kinds: [kind], search: searchPayload, limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      if (addressable) {
        // Keep only the newest revision per (pubkey, d) coordinate. We
        // also preserve relay order for `sort:top` results by walking
        // the events array once and dropping older revisions — the first
        // occurrence of each coord wins its slot.
        const seenCoord = new Set<string>();
        const orderedEvents: NostrEvent[] = [];
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
        // once, using its latest revision. Preserves relay ranking when
        // sort:top is in effect.
        for (const event of events) {
          const d = event.tags.find(([n]) => n === 'd')?.[1];
          if (!d) continue;
          const key = `${event.pubkey}:${d}`;
          if (seenCoord.has(key)) continue;
          seenCoord.add(key);
          const latest = latestByCoord.get(key);
          if (latest) orderedEvents.push(latest);
        }

        const parsed: T[] = [];
        for (const event of orderedEvents) {
          const next = parse(event);
          if (next !== null) parsed.push(next);
        }
        return parsed;
      }

      const parsed: T[] = [];
      for (const event of events) {
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

