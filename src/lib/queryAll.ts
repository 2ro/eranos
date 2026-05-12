import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/**
 * Minimal Nostr query interface that `queryAll` needs. Matches the shape of
 * `useNostr().nostr` as well as `nostr.relay()` / `nostr.group()` results,
 * so the helper is portable across any pool/relay/group handle.
 */
interface NostrQueryable {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]>;
}

interface QueryAllOptions {
  /**
   * Hard cap on total events collected. Protects against runaway relays
   * that never stop returning events. Default: 5_000.
   */
  maxEvents?: number;
  /**
   * Hard cap on paged round-trips. Also protects against misbehaving relays
   * (e.g. ones that return duplicates instead of advancing). Default: 10.
   */
  maxPages?: number;
  /**
   * Abort signal forwarded to each page query.
   */
  signal?: AbortSignal;
}

/**
 * Query a Nostr pool/relay/group exhaustively by paging with the `until`
 * cursor, stopping when the relay returns fewer events than the filter's
 * `limit` (indicating the underlying set is drained) or when either hard
 * cap is reached.
 *
 * The filter's `limit` is used as the page size. Callers SHOULD set it
 * explicitly; relays may interpret missing `limit` very differently.
 *
 * Caps exist so we bound worst-case work regardless of relay behaviour:
 * - `maxEvents` — total events across all pages.
 * - `maxPages` — total round-trips.
 *
 * Deduplication happens by `event.id`. A relay returning a duplicate page
 * (no forward progress on the cursor) terminates the loop early.
 *
 * Returns events in the order they were received across pages. Callers
 * that need a stable order should sort the result.
 *
 * This helper intentionally accepts a single filter object — the `until`
 * cursor has to be applied per-filter, so a multi-filter query cannot be
 * paged as a single pool. If you need to exhaust multiple independent
 * filters, call `queryAll` once per filter and merge the results.
 */
export async function queryAll(
  nostr: NostrQueryable,
  filter: NostrFilter,
  opts: QueryAllOptions = {},
): Promise<NostrEvent[]> {
  const { maxEvents = 5_000, maxPages = 10, signal } = opts;
  const pageSize = filter.limit;
  if (!pageSize || pageSize <= 0) {
    throw new Error('queryAll: filter.limit must be a positive integer');
  }

  const collected: NostrEvent[] = [];
  const seen = new Set<string>();
  let until = filter.until;

  for (let page = 0; page < maxPages; page++) {
    const pageFilter: NostrFilter = until !== undefined
      ? { ...filter, until }
      : filter;

    const events = await nostr.query([pageFilter], { signal });

    let newCount = 0;
    let oldest = Infinity;
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      collected.push(ev);
      newCount++;
      if (ev.created_at < oldest) oldest = ev.created_at;
      if (collected.length >= maxEvents) return collected;
    }

    // Stop when the relay indicates the set is drained (short page) or
    // when we made no forward progress (all duplicates).
    if (events.length < pageSize) return collected;
    if (newCount === 0) return collected;

    // Advance the cursor one second past the oldest seen event. Using
    // `oldest - 1` avoids re-fetching the boundary event on the next page.
    until = oldest - 1;
  }

  return collected;
}
