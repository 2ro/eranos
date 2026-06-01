import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';

interface UseDiscoverCommunitiesOptions {
  /** Maximum number of communities to fetch. Default: 24. */
  limit?: number;
  /**
   * Gate the underlying query. Useful for callers that only need the
   * full kind-34550 universe under a moderator role (e.g. the Hidden
   * section on `/groups`); skipping the fetch for everyone else avoids
   * a global relay round-trip whose results would only feed
   * moderator-only UI. Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Loads recent kind 34550 community definitions globally, parsed and
 * deduped by addressable coordinate. Sorted newest first.
 *
 * The Discover page uses this to surface communities the visitor hasn't
 * joined yet — distinct from `useManageableOrganizations`, which only
 * returns communities the current user founded or moderates.
 *
 * Validation is permissive: any community whose `parseCommunityEvent`
 * succeeds (has a `d` tag, etc.) is kept. We do *not* filter by image
 * presence here so a community-without-banner is still discoverable —
 * the card just shows a gradient fallback.
 */
export function useDiscoverCommunities(options: UseDiscoverCommunitiesOptions = {}) {
  const { limit = 24, enabled = true } = options;
  const { nostr } = useNostr();

  return useQuery<ParsedCommunity[]>({
    queryKey: ['discover-communities', limit],
    enabled,
    queryFn: async ({ signal }) => {
      // Global discovery (no `authors:` filter), so fan out to the whole
      // read pool: more relays means broader community coverage, and it
      // keeps Discover off the single-relay critical path.
      const events = await nostr.query(
        [{ kinds: [COMMUNITY_DEFINITION_KIND], limit }],
        { signal },
      );

      // Dedupe by (pubkey, d) keeping newest version. Relays may return
      // older revisions of an addressable event alongside the current one.
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

      const parsed: ParsedCommunity[] = [];
      const tsByATag = new Map<string, number>();
      for (const event of latestByCoord.values()) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        parsed.push(community);
        tsByATag.set(community.aTag, event.created_at);
      }
      parsed.sort((a, b) => (tsByATag.get(b.aTag) ?? 0) - (tsByATag.get(a.aTag) ?? 0));
      return parsed;
    },
    staleTime: 60_000,
  });
}
