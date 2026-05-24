import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCommunityBookmarks, parseCommunityBookmarkATag } from '@/hooks/useCommunityBookmarks';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { COMMUNITY_DEFINITION_KIND, parseCommunityEvent, type ParsedCommunity } from '@/lib/communityUtils';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';

export interface UserOrganization {
  community: ParsedCommunity;
  event: NostrEvent;
  isFounder: boolean;
  isModerator: boolean;
  isFollowed: boolean;
}

function organizationRank(entry: UserOrganization): number {
  if (entry.isFounder) return 0;
  if (entry.isModerator) return 1;
  return 2;
}

/** Organizations the user founded, moderates, or follows via NIP-51 kind 10004. */
export function useUserOrganizations() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const manageable = useManageableOrganizations();
  const bookmarks = useCommunityBookmarks();

  const followedATagsKey = bookmarks.bookmarkedATags.join(',');

  const followedQuery = useQuery<NostrEvent[]>({
    queryKey: ['followed-organizations', user?.pubkey ?? '', followedATagsKey],
    queryFn: async ({ signal }) => {
      if (!user || bookmarks.bookmarkedATags.length === 0) return [];

      const coordsByAuthor = new Map<string, Set<string>>();
      for (const aTag of bookmarks.bookmarkedATags) {
        const parsed = parseCommunityBookmarkATag(aTag);
        if (!parsed) continue;
        const dTags = coordsByAuthor.get(parsed.pubkey) ?? new Set<string>();
        dTags.add(parsed.dTag);
        coordsByAuthor.set(parsed.pubkey, dTags);
      }

      if (coordsByAuthor.size === 0) return [];

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      return nostr.query(
        Array.from(coordsByAuthor.entries()).map(([author, dTags]) => ({
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [author],
          '#d': [...dTags],
          limit: dTags.size,
        })),
        { signal: combinedSignal },
      );
    },
    enabled: !!user && !bookmarks.isLoading && bookmarks.bookmarkedATags.length > 0,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const byATag = new Map<string, UserOrganization>();
    const followedSet = new Set(bookmarks.bookmarkedATags);

    for (const entry of manageable.data ?? []) {
      byATag.set(entry.community.aTag, {
        community: entry.community,
        event: entry.event,
        isFounder: entry.isFounder,
        isModerator: entry.isModerator,
        isFollowed: followedSet.has(entry.community.aTag),
      });
    }

    for (const event of dedupeAddressableLatest(followedQuery.data ?? [])) {
      const community = parseCommunityEvent(event);
      if (!community || !followedSet.has(community.aTag)) continue;
      const existing = byATag.get(community.aTag);
      if (existing) {
        byATag.set(community.aTag, { ...existing, isFollowed: true });
        continue;
      }
      byATag.set(community.aTag, {
        community,
        event,
        isFounder: false,
        isModerator: false,
        isFollowed: true,
      });
    }

    const data = Array.from(byATag.values()).sort((a, b) => {
      const rankDiff = organizationRank(a) - organizationRank(b);
      if (rankDiff !== 0) return rankDiff;
      return b.event.created_at - a.event.created_at;
    });

    return {
      data,
      isLoading: manageable.isLoading || bookmarks.isLoading || followedQuery.isLoading,
      isError: manageable.isError || followedQuery.isError,
      error: manageable.error ?? followedQuery.error,
    };
  }, [bookmarks.bookmarkedATags, bookmarks.isLoading, followedQuery.data, followedQuery.error, followedQuery.isError, followedQuery.isLoading, manageable.data, manageable.error, manageable.isError, manageable.isLoading]);
}
