import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Target, Users, Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { formatSats, isGoalExpired, parseGoalEvent, parseCommunityATag } from '@/lib/goalUtils';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Compact goal renderer for NoteCard feed views.
 * Shows goal title, progress bar, recipient profile + lightning address, and deadline.
 */
export function GoalContent({ event }: { event: NostrEvent }) {
  const goal = useMemo(() => parseGoalEvent(event), [event]);
  if (!goal) return null;

  return <GoalContentInner event={event} goal={goal} />;
}

function GoalContentInner({
  event,
  goal,
}: {
  event: NostrEvent;
  goal: NonNullable<ReturnType<typeof parseGoalEvent>>;
}) {
  const expired = isGoalExpired(goal);
  const { currentSats, percentage, isLoading: progressLoading } =
    useGoalProgress(event.id, goal.amountMsat, goal.closedAt);
  const funded = percentage >= 100;

  // Recipient info
  const author = useAuthor(goal.beneficiary);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(goal.beneficiary);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(goal.beneficiary, metadata);
  const lightningAddress = metadata?.lud16 || metadata?.lud06 || undefined;

  // Deadline display
  const deadlineLabel = useMemo(() => {
    if (!goal.closedAt) return null;
    const now = Math.floor(Date.now() / 1000);
    const diff = goal.closedAt - now;
    if (diff <= 0) return 'Ended';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((diff % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  }, [goal.closedAt]);

  const image = goal.image ? sanitizeUrl(goal.image) : undefined;

  // Community link
  const communityAddr = useMemo(() => goal.communityATag ? parseCommunityATag(goal.communityATag) : undefined, [goal.communityATag]);
  const { data: communityEvent } = useAddrEvent(communityAddr);
  const communityName = communityEvent?.tags.find(([n]) => n === 'name')?.[1]
    || communityEvent?.tags.find(([n]) => n === 'd')?.[1];
  const communityUrl = useMemo(() => {
    if (!communityAddr) return undefined;
    try {
      return `/${nip19.naddrEncode({ kind: communityAddr.kind, pubkey: communityAddr.pubkey, identifier: communityAddr.identifier })}`;
    } catch {
      return undefined;
    }
  }, [communityAddr]);

  return (
    <div className="mt-3 space-y-3">
      {/* Goal image */}
      {image && (
        <div className="-mx-4 aspect-[21/9] overflow-hidden">
          <img
            src={image}
            alt={goal.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* Title + community link / status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="size-4 text-primary shrink-0" />
          <h3 className="font-semibold text-[15px] leading-tight">{goal.title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {communityUrl && communityName && (
            <Link
              to={communityUrl}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Users className="size-3" />
              {communityName}
            </Link>
          )}
          {funded ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              Funded
            </Badge>
          ) : expired ? (
            <Badge variant="secondary">Ended</Badge>
          ) : deadlineLabel ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {deadlineLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Summary */}
      {goal.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{goal.summary}</p>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <Progress
          value={percentage}
          className={cn('h-2.5', funded && '[&>div]:bg-emerald-500')}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {progressLoading ? (
              <Skeleton className="h-3.5 w-16 inline-block" />
            ) : (
              <>{formatSats(currentSats)} sats</>
            )}
          </span>
          <span>of {formatSats(goal.amountSats)} sats ({percentage}%)</span>
        </div>
      </div>

      {/* Recipient — who is receiving the zaps */}
      <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
        <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar shape={avatarShape} className="size-8 ring-2 ring-background">
            <AvatarImage src={metadata?.picture} />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">Receiving zaps</p>
          </div>
          <Link
            to={profileUrl}
            className="text-sm font-medium truncate block hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayName}
          </Link>
          {lightningAddress && (
            <p className="text-xs text-muted-foreground truncate" title={lightningAddress}>
              <Zap className="size-3 inline-block mr-0.5 -mt-0.5" />
              {lightningAddress}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
