import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { COMMUNITY_DEFINITION_KIND, parseCommunityEvent } from '@/lib/communityUtils';

/**
 * The shape expected by NoteMoreMenu's `communityContext` prop.
 */
interface CommunityContextForMenu {
  communityATag: string;
  canBan: boolean;
}

/**
 * Given a Nostr event, resolve its community moderation context (if any).
 *
 * Extracts the community `A` tag from the event, fetches the community
 * definition, resolves membership & moderation, and returns the
 * `communityContext` prop shape that `NoteMoreMenu` expects.
 *
 * Returns `undefined` when:
 * - The event has no community `A` tag
 * - The `A` tag doesn't point to a kind 34550 community
 * - The viewer is not a member of the community
 * - Data is still loading
 */
export function useCommunityModeration(event: NostrEvent): CommunityContextForMenu | undefined {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  // Extract the community A tag from the event (e.g. "34550:<pubkey>:<d-tag>")
  const communityATag = useMemo(() => {
    const aValue = event.tags.find(([n]) => n === 'A')?.[1];
    if (!aValue) return undefined;
    // Validate it points to a kind 34550 community
    if (!aValue.startsWith(`${COMMUNITY_DEFINITION_KIND}:`)) return undefined;
    return aValue;
  }, [event.tags]);

  // Parse the A tag to get author + d-tag for fetching the definition
  const addrParts = useMemo(() => {
    if (!communityATag) return undefined;
    const parts = communityATag.split(':');
    if (parts.length < 3) return undefined;
    return { pubkey: parts[1], dTag: parts.slice(2).join(':') };
  }, [communityATag]);

  // Fetch the community definition event
  const { data: communityEvent } = useQuery({
    queryKey: ['community-definition', communityATag],
    queryFn: async ({ signal }) => {
      if (!addrParts) return null;
      const events = await nostr.query(
        [{
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [addrParts.pubkey],
          '#d': [addrParts.dTag],
          limit: 1,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) },
      );
      return events[0] ?? null;
    },
    enabled: !!addrParts,
    staleTime: 5 * 60_000,
  });

  // Parse the community definition
  const community = useMemo(
    () => (communityEvent ? parseCommunityEvent(communityEvent) : null),
    [communityEvent],
  );

  // Resolve membership & moderation (reuses the same query key as CommunityDetailPage)
  const { moderation, memberMap } = useCommunityMembers(community);

  // Compute the communityContext prop for NoteMoreMenu
  return useMemo(() => {
    if (!communityATag || !user) return undefined;
    if (moderation.bannedPubkeys.has(user.pubkey)) return undefined;

    const viewerMember = memberMap.get(user.pubkey);
    if (!viewerMember) return undefined; // Non-member: no moderation powers

    const targetMember = memberMap.get(event.pubkey);
    const canBan = targetMember
      ? viewerMember.rank < targetMember.rank
      : true; // Can ban non-members

    return { communityATag, canBan };
  }, [communityATag, user, moderation, memberMap, event.pubkey]);
}
