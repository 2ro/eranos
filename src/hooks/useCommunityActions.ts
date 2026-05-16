import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { parseAction, type Action } from '@/hooks/useActions';

/** Fetches kind 36639 actions scoped to a community via the uppercase `A` tag. */
export function useCommunityActions(communityATag: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['community-actions', communityATag],
    queryFn: async ({ signal }): Promise<Action[]> => {
      if (!communityATag) return [];
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const events = await nostr.query(
        [{ kinds: [36639], '#A': [communityATag], limit: 50 }],
        { signal: combinedSignal },
      );

      const byAddrKey = new Map<string, Action>();
      for (const event of events) {
        const action = parseAction(event);
        if (!action) continue;
        const addrKey = `${action.pubkey}:${action.id}`;
        const existing = byAddrKey.get(addrKey);
        if (!existing || action.createdAt > existing.createdAt) {
          byAddrKey.set(addrKey, action);
        }
      }

      return [...byAddrKey.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!communityATag,
    staleTime: 60_000,
  });
}
