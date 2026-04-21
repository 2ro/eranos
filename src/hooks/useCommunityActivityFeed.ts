import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useMyCommunities } from './useMyCommunities';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';

/**
 * Fetches a chronological activity feed for communities the current user
 * belongs to (founded or joined).
 *
 * The feed merges:
 * 1. Kind 34550 community definition events for the user's communities
 * 2. Kind 1111 NIP-22 comments scoped to those communities (via #A tag)
 *
 * Sorted by created_at descending.
 */
export function useCommunityActivityFeed() {
  const { nostr } = useNostr();
  const { data: myCommunities, isLoading: communitiesLoading } = useMyCommunities();

  const aTags = myCommunities?.map((c) => c.community.aTag).filter(Boolean) ?? [];
  const aTagsKey = aTags.join(',');

  return useQuery<NostrEvent[]>({
    queryKey: ['community-activity-feed', aTagsKey],
    queryFn: async ({ signal }) => {
      if (aTags.length === 0) return [];

      const timeout = AbortSignal.timeout(8_000);
      const combinedSignal = AbortSignal.any([signal, timeout]);

      // Fetch community definition events and scoped comments in parallel
      const [definitionEvents, comments] = await Promise.all([
        // The community definitions themselves
        nostr.query(
          [{
            kinds: [COMMUNITY_DEFINITION_KIND],
            authors: myCommunities!.map((c) => c.event.pubkey),
            '#d': myCommunities!.map((c) => c.community.dTag),
            limit: 50,
          }],
          { signal: combinedSignal },
        ),
        // Kind 1111 comments scoped to these communities via uppercase A tag
        nostr.query(
          [{
            kinds: [1111],
            '#A': aTags,
            limit: 100,
          }],
          { signal: combinedSignal },
        ),
      ]);

      // Merge and deduplicate
      const seen = new Set<string>();
      const merged: NostrEvent[] = [];

      for (const event of [...definitionEvents, ...comments]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        merged.push(event);
      }

      // Sort by created_at descending
      return merged.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !communitiesLoading && aTags.length > 0,
    staleTime: 2 * 60_000,
  });
}
