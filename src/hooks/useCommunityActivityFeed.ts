import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useMyCommunities } from './useMyCommunities';
import {
  type CommunityMember,
  type CommunityModeration,
  BADGE_AWARD_KIND,
  COMMUNITY_DEFINITION_KIND,
  REPORT_KIND,
  isEventAllowedByModeration,
  resolveCommunityModeration,
  resolveMembership,
} from '@/lib/communityUtils';
import { ZAP_GOAL_KIND } from '@/lib/goalUtils';

/** Internal result type — events plus per-community moderation/membership data. */
interface ActivityFeedResult {
  events: NostrEvent[];
  /** Moderation data keyed by community A tag. */
  moderationByATag: Map<string, CommunityModeration>;
  /** Chain-validated rank maps keyed by community A tag (pre-moderation, for authority checks). */
  rankMapByATag: Map<string, Map<string, CommunityMember>>;
}

const EMPTY_MODERATION_BY_A_TAG: ReadonlyMap<string, CommunityModeration> = new Map();
const EMPTY_RANK_MAP_BY_A_TAG: ReadonlyMap<string, Map<string, CommunityMember>> = new Map();

/**
 * Fetches a chronological activity feed for communities the current user
 * belongs to (founded or joined).
 *
 * The feed merges:
 * 1. Kind 34550 community definition events for the user's communities
 * 2. Kind 1111 NIP-22 comments scoped to those communities (via #A tag)
 *
 * Community moderation (kind 1984 bans) is applied per-community: events
 * from banned members and individually banned posts are filtered out.
 * Bans are scoped — a member banned in community A is only filtered from
 * community A's posts, not from community B.
 *
 * Sorted by created_at descending.
 *
 * Also returns per-community `moderationByATag` and `rankMapByATag` so
 * callers can provide `CommunityModerationContext` to `NoteMoreMenu`.
 */
export function useCommunityActivityFeed() {
  const { nostr } = useNostr();
  const { data: myCommunities, isLoading: communitiesLoading } = useMyCommunities();

  const aTags = myCommunities?.map((c) => c.community.aTag).filter(Boolean) ?? [];
  const aTagsKey = aTags.join(',');

  const query = useQuery<ActivityFeedResult>({
    queryKey: ['community-activity-feed', aTagsKey],
    queryFn: async ({ signal }) => {
      if (aTags.length === 0 || !myCommunities) {
        return { events: [], moderationByATag: new Map(), rankMapByATag: new Map() };
      }

      const timeout = AbortSignal.timeout(8_000);
      const combinedSignal = AbortSignal.any([signal, timeout]);

      // Collect all badge a-tag coordinates across all communities for membership resolution
      const allBadgeATags: string[] = [];
      for (const entry of myCommunities) {
        for (const rank of entry.community.ranks) {
          if (rank.badgeATag) allBadgeATags.push(rank.badgeATag);
        }
      }

      // Fetch community definitions, comments, reports, badge awards, and goals in parallel
      const [definitionEvents, comments, reports, awards, goals] = await Promise.all([
        // The community definitions themselves
        nostr.query(
          [{
            kinds: [COMMUNITY_DEFINITION_KIND],
            authors: myCommunities.map((c) => c.event.pubkey),
            '#d': myCommunities.map((c) => c.community.dTag),
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
        // Kind 1984 reports scoped to these communities
        nostr.query(
          [{
            kinds: [REPORT_KIND],
            '#A': aTags,
            limit: 500,
          }],
          { signal: combinedSignal },
        ),
        // Badge awards for membership resolution
        allBadgeATags.length > 0
          ? nostr.query(
            [{ kinds: [BADGE_AWARD_KIND], '#a': allBadgeATags, limit: 500 }],
            { signal: combinedSignal },
          )
          : Promise.resolve([]),
        // NIP-75 zap goals linked to these communities (lowercase a tag)
        nostr.query(
          [{
            kinds: [ZAP_GOAL_KIND],
            '#a': aTags,
            limit: 50,
          }],
          { signal: combinedSignal },
        ),
      ]);

      // ── Resolve membership and moderation per community ──
      // Membership is resolved for all communities so callers can provide
      // CommunityModerationContext (for NoteMoreMenu ban actions).
      // Bans are community-scoped: a member banned in community A should
      // only be filtered from community A's posts, not from community B.
      //
      // We do **not** seed the `['community-members', aTag]` cache from
      // this hook. The activity feed uses shared relay limits across all
      // subscribed communities (awards and reports both capped at 500
      // total), so per-community results can be incomplete. Overwriting
      // the members cache with incomplete data would silently corrupt
      // membership, authority, and moderation state on detail pages.
      // `useCommunityMembers` is the authoritative per-community fetch.
      const moderationByATag = new Map<string, CommunityModeration>();
      const rankMapByATag = new Map<string, Map<string, CommunityMember>>();

      for (const entry of myCommunities) {
        const community = entry.community;

        // Resolve membership for this community.
        const fullMembership = resolveMembership(community, awards);
        const rankMap = new Map<string, CommunityMember>();
        for (const m of fullMembership.members) {
          rankMap.set(m.pubkey, m);
        }
        rankMapByATag.set(community.aTag, rankMap);

        // Resolve moderation. The resolver filters `reports` by matching
        // `A` tag internally, so we can pass the full cross-community
        // array without pre-grouping.
        const moderation = resolveCommunityModeration(community.aTag, reports, rankMap);
        if (moderation.allReports.length > 0) {
          moderationByATag.set(community.aTag, moderation);
        }
      }

      // ── Check whether an event survives moderation in its community ──
      const isAllowed = (event: NostrEvent): boolean => {
        const eventATag = event.tags.find(([n]) => n === 'A')?.[1];
        if (!eventATag) return true; // No community scope — not bannable here
        const moderation = moderationByATag.get(eventATag);
        if (!moderation) return true; // No moderation data for this community
        return isEventAllowedByModeration(event, moderation);
      };

      // ── Merge, deduplicate, and filter ──
      const seen = new Set<string>();
      const merged: NostrEvent[] = [];

      for (const event of [...definitionEvents, ...comments, ...goals]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (!isAllowed(event)) continue;
        merged.push(event);
      }

      // Sort by created_at descending
      merged.sort((a, b) => b.created_at - a.created_at);

      return { events: merged, moderationByATag, rankMapByATag };
    },
    enabled: !communitiesLoading && aTags.length > 0,
    staleTime: 2 * 60_000,
  });

  return useMemo(() => ({
    data: query.data?.events,
    moderationByATag: (query.data?.moderationByATag ?? EMPTY_MODERATION_BY_A_TAG) as Map<string, CommunityModeration>,
    rankMapByATag: (query.data?.rankMapByATag ?? EMPTY_RANK_MAP_BY_A_TAG) as Map<string, Map<string, CommunityMember>>,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }), [query.data, query.isLoading, query.isError, query.error]);
}
