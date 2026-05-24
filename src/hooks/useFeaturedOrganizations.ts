import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';

interface FeaturedOrganization {
  community: ParsedCommunity;
  event: NostrEvent;
}

/**
 * Parse a kind 34550 coordinate string (`34550:<pubkey>:<d>`) into its
 * pubkey and d-tag components. Returns `null` for malformed coords so the
 * caller can skip them without crashing the query.
 */
function parseCoord(coord: string): { pubkey: string; dTag: string } | null {
  const colon1 = coord.indexOf(':');
  if (colon1 < 0) return null;
  const colon2 = coord.indexOf(':', colon1 + 1);
  if (colon2 < 0) return null;
  const pubkey = coord.slice(colon1 + 1, colon2);
  const dTag = coord.slice(colon2 + 1);
  if (!pubkey || !dTag) return null;
  return { pubkey, dTag };
}

/**
 * Fetch the featured organizations selected by Agora moderators.
 *
 * Featured selection rides the shared `agora.moderation` namespace (kind
 * 1985 NIP-32 labels): a moderator publishes a `featured` label tagging
 * the organization's `34550:<pubkey>:<d>` coordinate, and the home/communities
 * page surfaces it here. A `hidden` label on the same coord always wins —
 * even if `featured` is set, a hidden org never reaches this list.
 *
 * Coords are grouped by author into one filter per unique author, then OR'd
 * into a single `nostr.query` call. For the typical case (a small handful
 * of featured orgs across a few authors) this stays one relay round-trip.
 * Results are sorted by the `created_at` of the latest `featured` label so
 * moderators control ordering by simply re-publishing the label to bump an
 * org to the top.
 */
export function useFeaturedOrganizations() {
  const { nostr } = useNostr();
  const { data: moderation, isReady: moderationReady } = useOrganizationModeration();

  // Derive the curated coord set: featured minus hidden, sorted by the
  // recency of the `featured` label. No cap — the moderator pack controls
  // how many orgs surface.
  const featuredCoords = moderationReady
    ? Array.from(moderation.featuredCoords)
        .filter((coord) => !moderation.hiddenCoords.has(coord))
        .sort(
          (a, b) =>
            (moderation.featuredOrder.get(b) ?? 0) -
            (moderation.featuredOrder.get(a) ?? 0),
        )
    : [];

  // Include the coord set in the query key so the cache busts whenever the
  // curation changes (mutations invalidate `featured-organizations` too, so
  // there's no one-tick gap).
  const featuredCoordsKey = featuredCoords.join('|');

  return useQuery<FeaturedOrganization[]>({
    queryKey: ['featured-organizations', featuredCoordsKey],
    enabled: moderationReady,
    queryFn: async ({ signal }) => {
      if (featuredCoords.length === 0) return [];

      // Group coord d-tags by author so we can issue one filter per author
      // instead of one per coord. Most featured orgs cluster around a few
      // founders, so this typically collapses to a single-digit number of
      // filters in one round-trip.
      const dTagsByAuthor = new Map<string, string[]>();
      for (const coord of featuredCoords) {
        const parsed = parseCoord(coord);
        if (!parsed) continue;
        const bucket = dTagsByAuthor.get(parsed.pubkey);
        if (bucket) {
          bucket.push(parsed.dTag);
        } else {
          dTagsByAuthor.set(parsed.pubkey, [parsed.dTag]);
        }
      }
      if (dTagsByAuthor.size === 0) return [];

      const filters: NostrFilter[] = Array.from(dTagsByAuthor.entries()).map(
        ([pubkey, dTags]) => ({
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [pubkey],
          '#d': dTags,
        }),
      );

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(filters, { signal: combinedSignal });

      // Latest-wins dedupe of addressable revisions, then index by coord so
      // we can return them in the moderator-controlled `featuredOrder`.
      const byCoord = new Map<string, FeaturedOrganization>();
      for (const event of dedupeAddressableLatest(events)) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        byCoord.set(community.aTag, { community, event });
      }

      // Preserve the moderator's chosen ordering by walking `featuredCoords`
      // (already sorted newest-label-first) and emitting entries in that
      // order. Drops coords whose underlying 34550 event we couldn't fetch
      // (e.g. it was deleted or never reached the queried relays).
      const ordered: FeaturedOrganization[] = [];
      for (const coord of featuredCoords) {
        const entry = byCoord.get(coord);
        if (entry) ordered.push(entry);
      }
      return ordered;
    },
    // Featured org definitions don't change often — orgs publish a
    // new revision when their banner or description changes, not minute
    // to minute — so a generous staleTime makes back-navigation to
    // /communities feel instant. The moderation hook explicitly
    // invalidates this key on mutation, so moderator-driven churn is
    // still visible immediately.
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
}
