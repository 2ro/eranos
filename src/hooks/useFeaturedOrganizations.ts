import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';

/**
 * Hand-curated list of featured organization event IDs.
 *
 * These are kind 34550 (NIP-72 community definition) event IDs that the
 * Agora team has selected to showcase on the Organize page until a
 * data-driven featuring mechanism exists.
 *
 * NIP-72 communities are addressable events keyed by
 * \`(pubkey, d-tag)\`, so the same community can have many revisions
 * over time — pinning a specific event ID locks the featured card to
 * the revision the curator approved. To promote a newer revision,
 * update the ID below.
 *
 * Replace this constant with a configurable source (AppConfig field,
 * NIP-51 list, etc.) when the featuring story matures.
 */
export const FEATURED_ORGANIZATION_EVENT_IDS = [
  'd29b870d2a02f2c098380f89d435748cf8d0b89f807f1e5e673cc58e3a1a7891',
  '007e55ccbf16bd21bcf0efe920eb9cc397bbfa5b97046a6fb9e76d4fc68a5353',
  'ee4cea2b458ff514fc1dc6b554da74520f4c551cfd0670768f6475de07f69ba3',
  'b0ea85386358346a4549f0ad0039e9ae00e7eebe188f08556f185a1230376739',
  '790b08be1c8d90ea4738d146ce2b749b42e528bba5dd8c5704804ff52e69b715',
  'fa5159b095aa376cea652967889fd5340367ec99cec64a355cfe459a68a974fc',
  '7ca2a21e9328711f7f0423cd1d9c6f3c7c23c4c7e85dd544a248f963d0d96728',
] as const;

export interface FeaturedOrganization {
  community: ParsedCommunity;
  event: NostrEvent;
}

/**
 * Fetch the hand-curated featured organizations by event ID.
 *
 * Results are returned in the same order as
 * {@link FEATURED_ORGANIZATION_EVENT_IDS} so the curator controls the
 * shelf ordering. Events that can't be parsed as a valid community
 * definition are dropped without failing the whole shelf.
 *
 * Single-letter \`ids\` filter is indexed by relays, so this is one
 * cheap round-trip regardless of list length.
 */
export function useFeaturedOrganizations() {
  const { nostr } = useNostr();

  return useQuery<FeaturedOrganization[]>({
    queryKey: ['featured-organizations', FEATURED_ORGANIZATION_EVENT_IDS.join(',')],
    queryFn: async ({ signal }) => {
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{
          kinds: [COMMUNITY_DEFINITION_KIND],
          ids: [...FEATURED_ORGANIZATION_EVENT_IDS],
          limit: FEATURED_ORGANIZATION_EVENT_IDS.length,
        }],
        { signal: combinedSignal },
      );

      // Index by id so we can preserve the curator's ordering.
      const byId = new Map<string, NostrEvent>();
      for (const event of events) {
        byId.set(event.id, event);
      }

      const entries: FeaturedOrganization[] = [];
      for (const id of FEATURED_ORGANIZATION_EVENT_IDS) {
        const event = byId.get(id);
        if (!event) continue;
        const community = parseCommunityEvent(event);
        if (!community) continue;
        entries.push({ community, event });
      }

      return entries;
    },
    // 5 minutes — featured list is hand-curated, doesn't churn.
    staleTime: 5 * 60_000,
  });
}
