import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { CAMPAIGN_KIND, type CampaignCategory, parseCampaign, type ParsedCampaign } from '@/lib/campaign';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';

interface UseCampaignsOptions {
  /** Optional category filter (`t` tag). */
  category?: CampaignCategory;
  /** Optional ISO 3166-1 alpha-2 country filter (`i` tag). */
  countryCode?: string;
  /** Maximum number of events to fetch from relays. Default: 60. */
  limit?: number;
  /** Authors to fetch from, e.g. for a profile's campaigns. */
  authors?: string[];
  /**
   * Restrict to campaigns whose recipient `p` tags include any of these
   * pubkeys. Used by the /claim page to find campaigns set up *for* a user.
   */
  recipientPubkeys?: string[];
  /**
   * Restrict to a specific set of `30223:<pubkey>:<d>` coordinates.
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
  /**
   * Include campaigns that have been archived by their creator
   * (`["status", "archived"]`). Defaults to `false` so archived
   * campaigns never appear in the main fundraisers listing.
   */
  includeArchived?: boolean;
}

/**
 * Loads kind 30223 campaign events and returns them as fully-parsed
 * {@link ParsedCampaign} objects, newest first.
 *
 * Campaigns that fail validation (missing title, no recipients, etc.) are
 * dropped so the UI never has to defensively check for missing fields.
 *
 * Archived campaigns (`status=archived`) are excluded by default. Pass
 * `includeArchived: true` to load them — used by the author's own profile
 * view so they can see and reopen their own archives.
 *
 * For each `(pubkey, d)` pair we keep only the latest event — relays may
 * return older revisions of an addressable event alongside the current one.
 */
export function useCampaigns(options: UseCampaignsOptions = {}) {
  const { nostr } = useNostr();
  const {
    category,
    countryCode,
    limit = 60,
    authors,
    recipientPubkeys,
    coordinates,
    includeArchived = false,
  } = options;

  // Stable cache key for the coordinates option; sort so order doesn't
  // change the query identity.
  const coordinatesKey = coordinates ? [...coordinates].sort().join(',') : undefined;

  return useQuery({
    queryKey: [
      'campaigns',
      { category, countryCode, limit, authors, recipientPubkeys, coordinatesKey, includeArchived },
    ],
    queryFn: async (c) => {
      // Sentinel: empty allowlist = empty result. Skip the relay entirely.
      if (coordinates && coordinates.length === 0) return [] as ParsedCampaign[];

      // Build the relay filter(s). When `coordinates` is set, we fan out into
      // one filter per author so we can use the indexed `#d` filter cheaply;
      // a single REQ carries all the sub-filters server-side.
      let filters: NostrFilter[];
      if (coordinates && coordinates.length > 0) {
        const byAuthor = new Map<string, string[]>();
        for (const coord of coordinates) {
          // Expected: `30223:<pubkey>:<d>`
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
          if (category) f['#t'] = [category];
          if (countryCode) f['#i'] = [createCountryIdentifier(countryCode)];
          return f;
        });
      } else {
        const filter: NostrFilter = { kinds: [CAMPAIGN_KIND], limit };
        if (category) filter['#t'] = [category];
        if (countryCode) filter['#i'] = [createCountryIdentifier(countryCode)];
        if (authors && authors.length > 0) filter.authors = authors;
        if (recipientPubkeys && recipientPubkeys.length > 0) {
          filter['#p'] = recipientPubkeys;
        }
        filters = [filter];
      }

      const events = await nostr.query(filters, { signal: c.signal });

      // Dedupe by (pubkey, d) keeping the newest version.
      const latestByCoord = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${event.pubkey}:${d}`;
        const prev = latestByCoord.get(key);
        if (!prev || event.created_at > prev.created_at) {
          latestByCoord.set(key, event);
        }
      }

      const parsed: ParsedCampaign[] = [];
      for (const event of latestByCoord.values()) {
        const campaign = parseCampaign(event);
        if (!campaign) continue;
        if (!includeArchived && campaign.archived) continue;
        parsed.push(campaign);
      }
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      return parsed;
    },
    staleTime: 30_000,
  });
}
