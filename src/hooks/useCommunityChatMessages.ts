import { useEffect, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { applyCommunityModerationToEvents, type CommunityModeration } from '@/lib/communityUtils';

export const COMMUNITY_CHAT_KIND = 1311;

function isCommunityChatMessage(event: NostrEvent, communityATag: string): boolean {
  return event.kind === COMMUNITY_CHAT_KIND
    && event.tags.some(([name, value]) => name === 'a' && value === communityATag);
}

export function useCommunityChatMessages(
  communityATag: string | undefined,
  moderation?: CommunityModeration,
) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['community-chat', communityATag ?? ''], [communityATag]);

  const query = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!communityATag) return [];

      const events = await nostr.query(
        [{ kinds: [COMMUNITY_CHAT_KIND], '#a': [communityATag], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) },
      );

      return events
        .filter((event) => isCommunityChatMessage(event, communityATag))
        .sort((a, b) => a.created_at - b.created_at);
    },
    enabled: !!communityATag,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!communityATag) return;

    const controller = new AbortController();
    const since = Math.floor(Date.now() / 1000);

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{ kinds: [COMMUNITY_CHAT_KIND], '#a': [communityATag], since }],
          { signal: controller.signal },
        )) {
          if (msg[0] !== 'EVENT') continue;

          const event = msg[2] as NostrEvent;
          if (!isCommunityChatMessage(event, communityATag)) continue;

          queryClient.setQueryData<NostrEvent[]>(queryKey, (old = []) => {
            if (old.some((existing) => existing.id === event.id)) return old;
            return [...old, event].sort((a, b) => a.created_at - b.created_at);
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Community chat subscription failed:', error);
        }
      }
    })();

    return () => controller.abort();
  }, [nostr, communityATag, queryClient, queryKey]);

  const moderatedMessages = useMemo(() => {
    const messages = query.data ?? [];
    return moderation ? applyCommunityModerationToEvents(messages, moderation) : messages;
  }, [query.data, moderation]);

  return {
    ...query,
    data: moderatedMessages,
    queryKey,
  };
}
