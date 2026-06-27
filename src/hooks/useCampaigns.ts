import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { CAMPAIGN_KIND, parseCampaign, type ParsedCampaign } from '@/lib/campaign';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';

interface ParseCampaignEventsOptions {
  /**
   * When `true`, sort the parsed campaigns newest-`created_at`-first.
   * When `false`, preserve the order in which events were returned —
   * critical for NIP-50 relay-scored responses (e.g. `sort:top`, `sort:hot`)
   * where the relay's score order would be destroyed by a chronological
   * resort. Defaults to `true`.
   */
  sortByCreatedAt?: boolean;
}

/**
 * Deduplicate, parse, and (optionally) reorder a flat list of kind 33863
 * events into `ParsedCampaign` objects.
 *
 * For each `(pubkey, d)` pair we keep only the latest event — relays may
 * return older revisions of an addressable event alongside the current one.
 * The dedupe step preserves the position of the kept event in the incoming
 * order, so callers relying on relay-scored ordering (NIP-50) see results
 * in the relay's order; callers that want chronological can opt in via
 * `sortByCreatedAt`.
 */
export function parseCampaignEvents(
  events: NostrEvent[],
  { sortByCreatedAt = true }: ParseCampaignEventsOptions = {},
): ParsedCampaign[] {
  // Track insertion order keyed by coord so we can preserve relay-scored
  // order when we don't want to re-sort. `Map` iteration order is insertion
  // order in ECMAScript.
  const latestByCoord = new Map<string, NostrEvent>();
  const orderByCoord: string[] = [];

  for (const event of events) {
    const d = event.tags.find(([n]) => n === 'd')?.[1];
    if (!d) continue;
    const key = `${event.pubkey}:${d}`;
    const prev = latestByCoord.get(key);
    if (!prev) {
      latestByCoord.set(key, event);
      orderByCoord.push(key);
    } else if (event.created_at > prev.created_at) {
      latestByCoord.set(key, event);
    }
  }

  const parsed: ParsedCampaign[] = [];
  for (const key of orderByCoord) {
    const event = latestByCoord.get(key);
    if (!event) continue;
    const campaign = parseCampaign(event);
    if (!campaign) continue;
    parsed.push(campaign);
  }

  if (sortByCreatedAt) {
    parsed.sort((a, b) => b.createdAt - a.createdAt);
  }

  return parsed;
}

interface UseCampaignsOptions {
  /** Optional ISO 3166-1 alpha-2 country filter (`i` tag). */
  countryCode?: string;
  /**
   * Optional category `t`-tag filter. When set, only campaigns carrying at
   * least one of these slugs are returned (relay-side set membership via
   * the indexed `#t` filter). Combined with {@link countryCode} as a
   * logical AND at the relay.
   */
  categories?: string[];
  /** Maximum number of events to fetch from relays. Default: 60. */
  limit?: number;
  /** Only return campaigns created at or after this Unix timestamp (seconds). */
  since?: number;
  /** Authors to fetch from, e.g. for a profile's campaigns. */
  authors?: string[];
  /** Disable the query while dependent state is unresolved. */
  enabled?: boolean;
  /**
   * Restrict to a specific set of `33863:<pubkey>:<d>` coordinates.
   *
   * Used by moderator-curated surfaces (the home page, Discover) that only
   * want to render campaigns labeled `approved` by a Team Soapbox moderator
   * — see `useCampaignModeration`.
   *
   * Semantics:
   *  - `undefined` (default): no coordinate restriction.
   *  - `[]`: return an empty result without issuing a relay request. This is
   *    a sentinel for "the moderator allowlist is empty" — distinct from
   *    omitting the option, so consumers don't accidentally fall through to
   *    the unfiltered behavior while their moderator query loads.
   */
  coordinates?: string[];
}

/**
 * Loads kind 33863 campaign events and returns them as fully-parsed
 * {@link ParsedCampaign} objects, newest first.
 *
 * Campaigns that fail validation (missing title, no `w` wallet, etc.) are
 * dropped so the UI never has to defensively check for missing fields.
 *
 * To stop a campaign from appearing the creator publishes a NIP-09 kind 5
 * deletion request referencing the campaign's `a` coordinate; well-behaved
 * relays honor the deletion and the campaign drops out of result sets
 * automatically.
 *
 * For each `(pubkey, d)` pair we keep only the latest event — relays may
 * return older revisions of an addressable event alongside the current one.
 */
export function useCampaigns(options: UseCampaignsOptions = {}) {
  const { nostr } = useNostr();
  const {
    countryCode,
    categories,
    limit = 60,
    since,
    authors,
    coordinates,
    enabled = true,
  } = options;

  // Stable cache key for the coordinates option; sort so order doesn't
  // change the query identity.
  const coordinatesKey = coordinates ? [...coordinates].sort().join(',') : undefined;
  // Stable cache key for the categories option, order-independent.
  const categoriesKey = categories ? [...categories].sort().join(',') : undefined;

  return useQuery({
    queryKey: [
      'campaigns',
      { countryCode, categoriesKey, limit, since, authors, coordinatesKey },
    ],
    enabled,
    queryFn: async (c) => {
      // Sentinel: empty allowlist = empty result. Skip the relay entirely.
      if (coordinates && coordinates.length === 0) return [] as ParsedCampaign[];

      const categoryFilter =
        categories && categories.length > 0 ? categories : undefined;

      // Build the relay filter(s). When `coordinates` is set, we fan out into
      // one filter per author so we can use the indexed `#d` filter cheaply;
      // a single REQ carries all the sub-filters server-side.
      let filters: NostrFilter[];
      if (coordinates && coordinates.length > 0) {
        const byAuthor = new Map<string, string[]>();
        for (const coord of coordinates) {
          // Expected: `33863:<pubkey>:<d>`
          const parts = coord.split(':');
          if (parts.length < 3) continue;
          const kindPart = Number(parts[0]);
          if (kindPart !== CAMPAIGN_KIND) continue;
          const pubkey = parts[1];
          const dTag = parts.slice(2).join(':');
          if (!pubkey || !dTag) continue;
          const list = byAuthor.get(pubkey) ?? [];
          list.push(dTag);
          byAuthor.set(pubkey, list);
        }
        if (byAuthor.size === 0) return [] as ParsedCampaign[];
        filters = Array.from(byAuthor, ([author, dTags]) => {
          const f: NostrFilter = { kinds: [CAMPAIGN_KIND], authors: [author], '#d': dTags };
          if (countryCode) f['#i'] = [createCountryIdentifier(countryCode)];
          if (categoryFilter) f['#t'] = categoryFilter;
          if (since !== undefined) f.since = since;
          return f;
        });
      } else {
        const filter: NostrFilter = { kinds: [CAMPAIGN_KIND], limit };
        if (countryCode) filter['#i'] = [createCountryIdentifier(countryCode)];
        if (categoryFilter) filter['#t'] = categoryFilter;
        if (since !== undefined) filter.since = since;
        if (authors && authors.length > 0) filter.authors = authors;
        filters = [filter];
      }

      const events = await nostr.query(filters, { signal: c.signal });
      return parseCampaignEvents(events, { sortByCreatedAt: true });
    },
    staleTime: 30_000,
  });
}
