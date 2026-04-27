import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import type { CommunityModerationContextValue } from '@/contexts/CommunityModerationContext';
import { COMMUNITY_DEFINITION_KIND, parseCommunityEvent } from '@/lib/communityUtils';

/**
 * Resolve the community moderation context for a single event.
 *
 * Extracts the community `A` tag from the event, fetches the community
 * definition, resolves membership & moderation, and returns a value shaped
 * for `CommunityModerationContext.Provider`. Callers install it as a
 * Provider so that nested components (`NoteCard`, `NoteMoreMenu`) pick up
 * the same moderation data via `useCommunityModerationContext()`.
 *
 * Returns `null` when:
 * - The event has no community `A` tag
 * - The `A` tag doesn't point to a kind 34550 community
 * - The community definition hasn't loaded yet
 */
export function useCommunityModerationForEvent(event: NostrEvent): CommunityModerationContextValue | null {
  const { nostr } = useNostr();

  // Extract the community A tag and its addressable parts in one pass.
  const parsed = useMemo(() => {
    const aValue = event.tags.find(([n]) => n === 'A')?.[1];
    if (!aValue) return null;
    if (!aValue.startsWith(`${COMMUNITY_DEFINITION_KIND}:`)) return null;
    const parts = aValue.split(':');
    if (parts.length < 3) return null;
    return { aTag: aValue, pubkey: parts[1], dTag: parts.slice(2).join(':') };
  }, [event.tags]);

  // Fetch the community definition event.
  const { data: communityEvent } = useQuery({
    queryKey: ['community-definition', parsed?.aTag ?? ''],
    queryFn: async ({ signal }) => {
      if (!parsed) return null;
      const events = await nostr.query(
        [{
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [parsed.pubkey],
          '#d': [parsed.dTag],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!parsed,
    staleTime: 5 * 60_000,
  });

  const community = useMemo(
    () => (communityEvent ? parseCommunityEvent(communityEvent) : null),
    [communityEvent],
  );

  // Reuses the same TanStack cache key as CommunityDetailPage, so opening a
  // post detail page after the feed has already loaded is free.
  const { moderation, rankMap } = useCommunityMembers(community);

  return useMemo(() => {
    if (!parsed) return null;
    return { communityATag: parsed.aTag, moderation, rankMap };
  }, [parsed, moderation, rankMap]);
}
