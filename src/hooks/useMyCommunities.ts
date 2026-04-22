import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import {
  COMMUNITY_DEFINITION_KIND,
  BADGE_AWARD_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';

export interface MyCommunityEntry {
  /** The parsed community data. */
  community: ParsedCommunity;
  /** The raw kind 34550 event. */
  event: NostrEvent;
  /** Whether the current user is the founder. */
  isFounded: boolean;
}

/**
 * Fetch communities the logged-in user has founded or been recruited into.
 *
 * Discovery follows the NIP:
 * 1. Founded: `{ kinds: [34550], authors: [<user-pubkey>] }`
 * 2. Member-of: query kind 8 awards targeting the user, extract badge `a` tags,
 *    then find the community definitions referencing those badges.
 */
export function useMyCommunities() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<MyCommunityEntry[]>({
    queryKey: ['my-communities', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];

      const timeout = AbortSignal.timeout(10_000);
      const combinedSignal = AbortSignal.any([signal, timeout]);

      // Step 1: Communities founded by the user
      const foundedEvents = await nostr.query(
        [{ kinds: [COMMUNITY_DEFINITION_KIND], authors: [user.pubkey], limit: 50 }],
        { signal: combinedSignal },
      );

      // Step 2: Badge awards targeting the user
      const awards = await nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], '#p': [user.pubkey], limit: 200 }],
        { signal: combinedSignal },
      );

      // Extract badge a-tag coordinates from awards
      const badgeATags = new Set<string>();
      for (const award of awards) {
        for (const tag of award.tags) {
          if (tag[0] === 'a' && tag[1]?.startsWith('30009:')) {
            badgeATags.add(tag[1]);
          }
        }
      }

      // Step 3: Find community definitions that reference these badges
      let memberCommunityEvents: NostrEvent[] = [];
      if (badgeATags.size > 0) {
        memberCommunityEvents = await nostr.query(
          [{ kinds: [COMMUNITY_DEFINITION_KIND], '#a': [...badgeATags], limit: 100 }],
          { signal: combinedSignal },
        );
      }

      // Merge and deduplicate (founded takes priority)
      const seen = new Map<string, MyCommunityEntry>();

      for (const event of foundedEvents) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        seen.set(community.aTag, { community, event, isFounded: true });
      }

      for (const event of memberCommunityEvents) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        if (!seen.has(community.aTag)) {
          seen.set(community.aTag, { community, event, isFounded: false });
        }
      }

      // Sort: founded first, then by created_at descending
      return Array.from(seen.values()).sort((a, b) => {
        if (a.isFounded !== b.isFounded) return a.isFounded ? -1 : 1;
        return b.event.created_at - a.event.created_at;
      });
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });
}
