import { useEffect, useMemo, useState } from 'react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { getAvatarShape } from '@/lib/avatarShape';
import { isGoalExpired, parseCommunityATag, type ParsedGoal } from '@/lib/goalUtils';
import { genUserName } from '@/lib/genUserName';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { useProfileUrl } from '@/hooks/useProfileUrl';

/** Re-renders every `intervalMs` so time-dependent values stay fresh. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface GoalDisplayData {
  // Status
  expired: boolean;
  funded: boolean;

  // Progress
  currentSats: number;
  percentage: number;
  contributors: string[];
  zapCount: number;
  progressLoading: boolean;

  // Recipient
  metadata: NostrMetadata | undefined;
  displayName: string;
  avatarShape: string | undefined;
  profileUrl: string;
  lightningAddress: string | undefined;

  // Deadline
  deadlineLabel: string | null;

  // Community link
  communityName: string | undefined;
  communityUrl: string | undefined;

  // Image (already sanitized at parse time)
  image: string | undefined;
}

/**
 * Consolidates all display-related hooks and derived state for a goal event.
 * Used by both the standalone GoalCard and the compact NoteCard/detail renderers.
 */
export function useGoalDisplay(event: NostrEvent, goal: ParsedGoal): GoalDisplayData {
  const now = useNow(60_000);
  const expired = isGoalExpired(goal);
  const { currentSats, percentage, contributors, zapCount, isLoading: progressLoading } =
    useGoalProgress(event.id, goal.amountMsat, goal.closedAt);
  const funded = percentage >= 100;

  // Recipient info
  const author = useAuthor(goal.beneficiary);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(goal.beneficiary);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(goal.beneficiary, metadata);
  const lightningAddress = metadata?.lud16 || metadata?.lud06 || undefined;

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
    funded,
    currentSats,
    percentage,
    contributors,
    zapCount,
    progressLoading,
    metadata,
    displayName,
    avatarShape,
    profileUrl,
    lightningAddress,
    deadlineLabel,
    communityName,
    communityUrl,
    image: goal.image,
  };
}
