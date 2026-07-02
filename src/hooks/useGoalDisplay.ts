import { useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { isGoalExpired, parseCommunityATag, type ParsedGoal } from '@/lib/goalUtils';
import { genUserName } from '@/lib/genUserName';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useNow } from '@/hooks/useNow';
import { useProfileUrl } from '@/hooks/useProfileUrl';

interface GoalDisplayData {
  expired: boolean;
  metadata: NostrMetadata | undefined;
  displayName: string;
  profileUrl: string;
  deadlineLabel: string | null;
  communityName: string | undefined;
  communityUrl: string | undefined;
  /** Already sanitized at parse time. */
  image: string | undefined;
}

/**
 * Consolidates all display-related hooks and derived state for a goal event.
 * Used by GoalCard inside NoteCard feeds and PostDetailPage.
 *
 * Note: the raised-amount tally is intentionally not computed here — the
 * Grin-based tally arrives in a later phase. The card shows the goal target
 * without a progress figure until then.
 */
export function useGoalDisplay(goal: ParsedGoal): GoalDisplayData {
  const now = useNow(60_000);
  const expired = isGoalExpired(goal);

  // Recipient info
  const author = useAuthor(goal.beneficiary);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(goal.beneficiary);
  const profileUrl = useProfileUrl(goal.beneficiary, metadata);

  // Deadline label — `now` dependency ensures it refreshes every minute
  const deadlineLabel = useMemo(() => {
    if (!goal.closedAt) return null;
    const diff = goal.closedAt - now;
    if (diff <= 0) return 'Ended';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((diff % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  }, [goal.closedAt, now]);

  // Community link
  const communityAddr = useMemo(
    () => (goal.communityATag ? parseCommunityATag(goal.communityATag) : undefined),
    [goal.communityATag],
  );
  const { data: communityEvent } = useAddrEvent(communityAddr);
  const communityName =
    communityEvent?.tags.find(([n]) => n === 'name')?.[1] ||
    communityEvent?.tags.find(([n]) => n === 'd')?.[1];
  const communityUrl = useMemo(() => {
    if (!communityAddr) return undefined;
    try {
      return `/${nip19.naddrEncode({
        kind: communityAddr.kind,
        pubkey: communityAddr.pubkey,
        identifier: communityAddr.identifier,
      })}`;
    } catch {
      return undefined;
    }
  }, [communityAddr]);

  return {
    expired,
    metadata,
    displayName,
    profileUrl,
    deadlineLabel,
    communityName,
    communityUrl,
    image: goal.image,
  };
}
