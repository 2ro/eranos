import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';

/**
 * Hand-curated list of featured organization authors.
 *
 * We query all organizations authored by these accounts in one relay request,
 * then latest-wins dedupe addressable revisions client-side.
 */
export const FEATURED_ORGANIZATION_AUTHORS = [
  '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  'be7358c4fe50148cccafc02ea205d80145e253889aa3958daafa8637047c840e',
  '3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24',
] as const;

export interface FeaturedOrganization {
  community: ParsedCommunity;
  event: NostrEvent;
}

/**
 * Fetch featured organizations by author.
 *
 * One author-filtered query is more reliable than pinning individual event IDs
 * because kind 34550 definitions are addressable and can be revised.
 */
export function useFeaturedOrganizations() {
  const { nostr } = useNostr();

  return useQuery<FeaturedOrganization[]>({
    queryKey: ['featured-organizations', FEATURED_ORGANIZATION_AUTHORS.join(',')],
    queryFn: async ({ signal }) => {
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [...FEATURED_ORGANIZATION_AUTHORS],
          limit: 60,
        }],
        { signal: combinedSignal },
      );

      const entries: FeaturedOrganization[] = [];
      for (const event of dedupeAddressableLatest(events)) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        entries.push({ community, event });
      }

      entries.sort((a, b) => b.event.created_at - a.event.created_at);

      return entries;
    },
    // 5 minutes — featured list is hand-curated, doesn't churn.
    staleTime: 5 * 60_000,
  });
}
