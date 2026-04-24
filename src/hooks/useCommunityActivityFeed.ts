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
  resolveCommunityModeration,
  resolveMembership,
} from '@/lib/communityUtils';

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
 */
export function useCommunityActivityFeed() {
  const { nostr } = useNostr();
  const { data: myCommunities, isLoading: communitiesLoading } = useMyCommunities();

  const aTags = myCommunities?.map((c) => c.community.aTag).filter(Boolean) ?? [];
  const aTagsKey = aTags.join(',');

  return useQuery<NostrEvent[]>({
    queryKey: ['community-activity-feed', aTagsKey],
    queryFn: async ({ signal }) => {
      if (aTags.length === 0 || !myCommunities) return [];

      const timeout = AbortSignal.timeout(8_000);
      const combinedSignal = AbortSignal.any([signal, timeout]);

      // Collect all badge a-tag coordinates across all communities for membership resolution
      const allBadgeATags: string[] = [];
      for (const entry of myCommunities) {
        for (const rank of entry.community.ranks) {
          if (rank.badgeATag) allBadgeATags.push(rank.badgeATag);
        }
      }

      // Fetch community definitions, comments, reports, and badge awards in parallel
      const [definitionEvents, comments, reports, awards] = await Promise.all([
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
      ]);

      // ── Resolve moderation per community ──
      // Bans are community-scoped: a member banned in community A should only
      // be filtered from community A's posts, not from community B's.
      const moderationByATag = new Map<string, CommunityModeration>();

      if (reports.length > 0) {
        // Group reports by community A tag
        const reportsByATag = new Map<string, NostrEvent[]>();
        for (const report of reports) {
          const aTag = report.tags.find(([n]) => n === 'A')?.[1];
          if (!aTag) continue;
          const list = reportsByATag.get(aTag);
          if (list) {
            list.push(report);
          } else {
            reportsByATag.set(aTag, [report]);
          }
        }

        for (const entry of myCommunities) {
          const community = entry.community;
          const communityReports = reportsByATag.get(community.aTag);
          if (!communityReports || communityReports.length === 0) continue;

          // Resolve membership for this community to validate report authority
          const membership = resolveMembership(community, awards);
          const memberMap = new Map<string, CommunityMember>();
          for (const m of membership.members) {
            memberMap.set(m.pubkey, m);
          }

          moderationByATag.set(
            community.aTag,
            resolveCommunityModeration(communityReports, memberMap),
          );
        }
      }

      // ── Check if an event is banned in its community ──
      const isBanned = (event: NostrEvent): boolean => {
        // Extract the community A tag from the event
        const eventATag = event.tags.find(([n]) => n === 'A')?.[1];
        if (!eventATag) return false; // No community scope — not banneable

        const moderation = moderationByATag.get(eventATag);
        if (!moderation) return false; // No moderation data for this community

        return moderation.bannedEventIds.has(event.id)
          || moderation.bannedPubkeys.has(event.pubkey);
      };

      // ── Merge, deduplicate, and filter ──
      const seen = new Set<string>();
      const merged: NostrEvent[] = [];

      for (const event of [...definitionEvents, ...comments]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (isBanned(event)) continue;
        merged.push(event);
      }

      // Sort by created_at descending
      return merged.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !communitiesLoading && aTags.length > 0,
    staleTime: 2 * 60_000,
  });
}
