import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from './useCurrentUser';
import { COMMUNITIES_LIST_KIND, parseCommunityBookmarkATag } from './useCommunityBookmarks';
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
  /** Whether the current user is a validated member. */
  isMember: boolean;
  /** Whether the current user has bookmarked the community via kind 10004. */
  isBookmarked: boolean;
}

/**
 * Fetch communities the logged-in user has founded, been recruited into,
 * or bookmarked via their NIP-51 Communities list (kind 10004).
 *
 * Discovery:
 *
 * 1. Founded -- `{ kinds: [34550], authors: [user.pubkey] }`
 * 2. Member-of -- kind 8 awards targeting the user, extract badge `a` tags,
 *    then find the community definitions referencing those badges.
 * 3. Bookmarked -- read kind 10004 authored by user, extract `a` tags
 *    pointing at kind 34550 events, and fetch those community definitions.
 *
 * Priority when the same community appears in multiple sources:
 * founded > member > bookmarked.
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

      // ── Step 1: Communities founded by the user ───────────────────────────
      const foundedEvents = await nostr.query(
        [{ kinds: [COMMUNITY_DEFINITION_KIND], authors: [user.pubkey], limit: 50 }],
        { signal: combinedSignal },
      );

      // ── Step 2: Badge awards targeting the user + Bookmarks list ──────────
      //
      // Batched into a single relay round-trip. The kind 10004 list is a
      // replaceable event, so pulling it here keeps the read path tight and
      // reuses the same connection.
      const [awards, bookmarkListEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [BADGE_AWARD_KIND], '#p': [user.pubkey], limit: 200 }],
          { signal: combinedSignal },
        ),
        nostr.query(
          [{ kinds: [COMMUNITIES_LIST_KIND], authors: [user.pubkey], limit: 1 }],
          { signal: combinedSignal },
        ),
      ]);

      // Extract badge a-tag coordinates from awards
      const badgeATags = new Set<string>();
      const awardsByBadgeATag = new Map<string, NostrEvent[]>();
      for (const award of awards) {
        for (const tag of award.tags) {
          if (tag[0] === 'a' && tag[1]?.startsWith('30009:')) {
            badgeATags.add(tag[1]);
            const list = awardsByBadgeATag.get(tag[1]) ?? [];
            list.push(award);
            awardsByBadgeATag.set(tag[1], list);
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

      // ── Step 4: Resolve bookmarked community coordinates ──────────────────
      //
      // NIP-51 kind 10004 stores community definitions as `a` tags like
      // `34550:<pubkey>:<d-tag>`. For each bookmarked coordinate we query
      // with both `authors` and `#d` so relays return a single authentic
      // event per bookmark (per AGENTS.md security guidance on addressable
      // events).
      //
      // Multiple coordinates with the same author are grouped to minimise
      // the number of relay queries while keeping the author filter intact.

      const bookmarkListEvent = bookmarkListEvents[0];
      const bookmarkedCoords: string[] = (bookmarkListEvent?.tags ?? [])
        .filter(([n, v]) =>
          n === 'a'
          && typeof v === 'string'
          && !!parseCommunityBookmarkATag(v),
        )
        .map(([, v]) => v);

      // Group bookmarked coords by author pubkey: author -> Set<d-tag>
      const coordsByAuthor = new Map<string, Set<string>>();
      for (const coord of bookmarkedCoords) {
        const parsed = parseCommunityBookmarkATag(coord);
        if (!parsed) continue;
        const existing = coordsByAuthor.get(parsed.pubkey);
        if (existing) {
          existing.add(parsed.dTag);
        } else {
          coordsByAuthor.set(parsed.pubkey, new Set([parsed.dTag]));
        }
      }

      let bookmarkedCommunityEvents: NostrEvent[] = [];
      if (coordsByAuthor.size > 0) {
        bookmarkedCommunityEvents = await nostr.query(
          Array.from(coordsByAuthor.entries()).map(([authorPubkey, dTags]) => ({
            kinds: [COMMUNITY_DEFINITION_KIND],
            authors: [authorPubkey],
            '#d': [...dTags],
            limit: dTags.size,
          })),
          { signal: combinedSignal },
        );
      }

      const bookmarkedATagSet = new Set(bookmarkedCoords);

      // ── Merge & deduplicate ──────────────────────────────────────────────
      // Priority: founded > member > bookmarked. `isBookmarked` is resolved
      // from the bookmark list irrespective of which bucket produced the
      // entry, so founders/members who have also bookmarked see both flags.
      const seen = new Map<string, MyCommunityEntry>();

      for (const event of foundedEvents) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        seen.set(community.aTag, {
          community,
          event,
          isFounded: true,
          isMember: false,
          isBookmarked: bookmarkedATagSet.has(community.aTag),
        });
      }

      for (const event of memberCommunityEvents) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        if (!community.memberBadgeATag || !badgeATags.has(community.memberBadgeATag)) continue;
        const authorizedAwarders = new Set([community.founderPubkey, ...community.moderatorPubkeys]);
        const hasValidAward = (awardsByBadgeATag.get(community.memberBadgeATag) ?? [])
          .some((award) => authorizedAwarders.has(award.pubkey));
        if (!hasValidAward) continue;
        if (seen.has(community.aTag)) continue;
        seen.set(community.aTag, {
          community,
          event,
          isFounded: false,
          isMember: true,
          isBookmarked: bookmarkedATagSet.has(community.aTag),
        });
      }

      for (const event of bookmarkedCommunityEvents) {
        const community = parseCommunityEvent(event);
        if (!community) continue;
        if (!bookmarkedATagSet.has(community.aTag)) continue;
        if (seen.has(community.aTag)) continue;
        seen.set(community.aTag, {
          community,
          event,
          isFounded: false,
          isMember: false,
          isBookmarked: true,
        });
      }

      // Sort: founded first, then member, then bookmarked-only;
      // tie-break by created_at descending.
      const sortRank = (entry: MyCommunityEntry): number => {
        if (entry.isFounded) return 0;
        if (entry.isMember) return 1;
        return 2;
      };

      return Array.from(seen.values()).sort((a, b) => {
        const rankDiff = sortRank(a) - sortRank(b);
        if (rankDiff !== 0) return rankDiff;
        return b.event.created_at - a.event.created_at;
      });
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });
}
