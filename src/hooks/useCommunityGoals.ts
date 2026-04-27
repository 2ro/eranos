import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { ZAP_GOAL_KIND, parseGoalEvent, type ParsedGoal } from '@/lib/goalUtils';
import type { NostrEvent } from '@nostrify/nostrify';

export interface CommunityGoal {
  event: NostrEvent;
  goal: ParsedGoal;
}

/**
 * Fetches kind 9041 zap goals that link to a specific community via an `a` tag.
 * Returns parsed goals sorted by creation time (newest first).
 */
export function useCommunityGoals(communityATag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['community-goals', communityATag],
    queryFn: async (c) => {
      if (!communityATag) return [];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{ kinds: [ZAP_GOAL_KIND], '#a': [communityATag], limit: 50 }],
        { signal },
      );

      const goals: CommunityGoal[] = [];
      for (const event of events) {
        const parsed = parseGoalEvent(event);
        if (parsed) {
          goals.push({ event, goal: parsed });
        }
      }

      // Newest first
      goals.sort((a, b) => b.event.created_at - a.event.created_at);
      return goals;
    },
    enabled: !!communityATag,
    staleTime: 60_000,
  });
}
