import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { ZAP_GOAL_KIND, parseGoalEvent } from '@/lib/goalUtils';

/**
 * Fetches kind 9041 zap goals linked to a community via an `a` tag.
 * Returns validated events sorted newest-first.
 */
export function useCommunityGoals(communityATag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['community-goals', communityATag],
    queryFn: async (c): Promise<NostrEvent[]> => {
      if (!communityATag) return [];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{ kinds: [ZAP_GOAL_KIND], '#a': [communityATag], limit: 50 }],
        { signal },
      );

      return events
        .filter((e) => parseGoalEvent(e) !== null)
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!communityATag,
    staleTime: 60_000,
  });
}
