import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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
import { getPaginationCursor } from '@/lib/feedUtils';

/** Internal result type — events plus per-community moderation/membership data. */
interface ActivityFeedResult {
  events: NostrEvent[];
  /** Moderation data keyed by community A tag. */
  moderationByATag: Map<string, CommunityModeration>;
  /** Flat authority maps keyed by community A tag (pre-moderation, for authority checks). */
  rankMapByATag: Map<string, Map<string, CommunityMember>>;
  /** Cursor for the next comments/goals page. */
  oldestActivityTimestamp: number;
  /** Whether at least one paginated activity filter returned a full page. */
  hasMoreActivity: boolean;
}

const EMPTY_MODERATION_BY_A_TAG: ReadonlyMap<string, CommunityModeration> = new Map();
const EMPTY_RANK_MAP_BY_A_TAG: ReadonlyMap<string, Map<string, CommunityMember>> = new Map();
const ACTIVITY_PAGE_SIZE = 100;

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
  const queryClient = useQueryClient();
  const { data: myCommunities, isLoading: communitiesLoading } = useMyCommunities();

  const aTags = myCommunities?.map((c) => c.community.aTag).filter(Boolean) ?? [];
  const aTagsKey = aTags.join(',');

  const query = useInfiniteQuery<ActivityFeedResult, Error>({
    queryKey: ['community-activity-feed', aTagsKey],
    queryFn: async ({ pageParam, signal }) => {
      if (aTags.length === 0 || !myCommunities) {
        return {
          events: [],
          moderationByATag: new Map(),
          rankMapByATag: new Map(),
          oldestActivityTimestamp: Math.floor(Date.now() / 1000),
          hasMoreActivity: false,
        };
      }

      const timeout = AbortSignal.timeout(8_000);
      const combinedSignal = AbortSignal.any([signal, timeout]);
      const until = pageParam as number | undefined;

      const awardFilters = myCommunities
        .filter((entry) => !!entry.community.memberBadgeATag)
        .map((entry) => ({
          kinds: [BADGE_AWARD_KIND],
          authors: [entry.community.founderPubkey, ...entry.community.moderatorPubkeys],
          '#a': [entry.community.memberBadgeATag!],
          limit: 500,
        }));

      // Fetch community definitions, comments, membership awards, and goals in parallel.
      const [definitionEvents, comments, awards, goals] = await Promise.all([
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
            limit: ACTIVITY_PAGE_SIZE,
            ...(until ? { until } : {}),
          }],
          { signal: combinedSignal },
        ),
        // Flat membership awards, scoped by each community's authorized awarders.
        awardFilters.length > 0
          ? nostr.query(
            awardFilters,
            { signal: combinedSignal },
          )
          : Promise.resolve([]),
        // NIP-75 zap goals linked to these communities (lowercase a tag)
        nostr.query(
          [{
            kinds: [ZAP_GOAL_KIND],
            '#a': aTags,
            limit: ACTIVITY_PAGE_SIZE,
            ...(until ? { until } : {}),
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
      const rankMapByATag = new Map<string, Map<string, CommunityMember>>();
      const reportAuthorSet = new Set<string>();

      for (const entry of myCommunities) {
        const community = entry.community;

        // Resolve flat membership for this community.
        const fullMembership = resolveMembership(community, awards);
        const rankMap = new Map<string, CommunityMember>();
        for (const m of fullMembership.members) {
          rankMap.set(m.pubkey, m);
          reportAuthorSet.add(m.pubkey);
        }
        rankMapByATag.set(community.aTag, rankMap);
      }

      const reports = reportAuthorSet.size > 0
        ? await nostr.query(
          [{ kinds: [REPORT_KIND], authors: [...reportAuthorSet], '#A': aTags, limit: 500 }],
          { signal: combinedSignal },
        )
        : [];

      const moderationByATag = new Map<string, CommunityModeration>();

      for (const entry of myCommunities) {
        const community = entry.community;
        const rankMap = rankMapByATag.get(community.aTag) ?? new Map<string, CommunityMember>();

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
        // NIP-22 comments use uppercase A; goals use lowercase a with a 34550: prefix
        const eventATag = event.tags.find(([n]) => n === 'A')?.[1]
          ?? event.tags.find(([n, v]) => n === 'a' && v?.startsWith('34550:'))?.[1];
        if (!eventATag) return true; // No community scope — not bannable here
        const moderation = moderationByATag.get(eventATag);
        if (!moderation) return true; // No moderation data for this community
        return isEventAllowedByModeration(event, moderation);
      };

      // ── Merge, deduplicate, and filter ──
      const knownCommunityATags = new Set(aTags);
      const seen = new Set<string>();
      const merged: NostrEvent[] = [];

      for (const event of [...definitionEvents, ...comments, ...goals]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (event.kind === COMMUNITY_DEFINITION_KIND) {
          const dTag = event.tags.find(([n]) => n === 'd')?.[1];
          if (!dTag || !knownCommunityATags.has(`${COMMUNITY_DEFINITION_KIND}:${event.pubkey}:${dTag}`)) continue;
        }
        if (!isAllowed(event)) continue;
        merged.push(event);
      }

      // Sort by created_at descending
      merged.sort((a, b) => b.created_at - a.created_at);

      const paginatedActivity = [...comments, ...goals];
      const oldestActivityTimestamp = getPaginationCursor(paginatedActivity);

      // Seed the ['event', id] cache so embedded previews (quotes, reply
      // context, etc.) resolve instantly instead of refetching.
      for (const event of merged) {
        if (!queryClient.getQueryData(['event', event.id])) {
          queryClient.setQueryData(['event', event.id], event);
        }
      }

      return {
        events: merged,
        moderationByATag,
        rankMapByATag,
        oldestActivityTimestamp,
        hasMoreActivity: comments.length === ACTIVITY_PAGE_SIZE || goals.length === ACTIVITY_PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMoreActivity) return undefined;
      return lastPage.oldestActivityTimestamp - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !communitiesLoading && aTags.length > 0,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  return useMemo(() => {
    const pages = query.data?.pages ?? [];
    const seen = new Set<string>();
    const events = pages
      .flatMap((page) => page.events)
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at);
    const latestPage = pages[pages.length - 1];

    return {
      data: query.data ? events : undefined,
      moderationByATag: (latestPage?.moderationByATag ?? EMPTY_MODERATION_BY_A_TAG) as Map<string, CommunityModeration>,
      rankMapByATag: (latestPage?.rankMapByATag ?? EMPTY_RANK_MAP_BY_A_TAG) as Map<string, Map<string, CommunityMember>>,
      isLoading: communitiesLoading || query.isLoading,
      isError: query.isError,
      error: query.error,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      fetchNextPage: query.fetchNextPage,
    };
  }, [query.data, communitiesLoading, query.isLoading, query.isError, query.error, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
}
