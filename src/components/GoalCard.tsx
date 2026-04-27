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
import { ZapDialog } from '@/components/ZapDialog';
import { useAddrEvent } from '@/hooks/useEvent';
import { useAuthor } from '@/hooks/useAuthor';
import { useGoalProgress } from '@/hooks/useGoalProgress';
import { useOpenPost } from '@/hooks/useOpenPost';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { canZap } from '@/lib/canZap';
import { formatSats, isGoalExpired, parseCommunityATag, type ParsedGoal } from '@/lib/goalUtils';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface GoalCardProps {
  event: NostrEvent;
  goal: ParsedGoal;
}

export function GoalCard({ event, goal }: GoalCardProps) {
  const expired = isGoalExpired(goal);
  const { currentSats, percentage, contributors, zapCount, isLoading: progressLoading } =
    useGoalProgress(event.id, goal.amountMsat, goal.closedAt);

  const funded = percentage >= 100;

  // Navigation to post detail
  const postPath = useMemo(
    () => `/${nip19.neventEncode({ id: event.id, author: event.pubkey })}`,
    [event.id, event.pubkey],
  );
  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(postPath);

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
    <div
      className="rounded-xl border border-border overflow-hidden bg-card transition-all duration-300 hover:shadow-md hover:border-primary/20 cursor-pointer"
      onClick={openPost}
      onAuxClick={auxOpenPost}
    >
      {/* Goal image */}
      {image && (
        <div className="aspect-[21/9] w-full overflow-hidden">
          <img
            src={image}
            alt={goal.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
          />
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Header: title + community link / status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="size-4 text-primary shrink-0" />
            <h3 className="font-semibold text-[15px] leading-tight truncate">{goal.title}</h3>
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
            ) : null}
          </div>
        </div>

        {/* Summary */}
        {goal.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">{goal.summary}</p>
        )}

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress
            value={percentage}
            className={cn('h-3', funded && '[&>div]:bg-emerald-500')}
          />
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {progressLoading ? (
                <Skeleton className="h-4 w-20 inline-block" />
              ) : (
                <>{formatSats(currentSats)} sats</>
              )}
            </span>
            <span className="text-muted-foreground">
              of {formatSats(goal.amountSats)} sats ({percentage}%)
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {zapCount > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              {zapCount} zap{zapCount !== 1 ? 's' : ''}
            </span>
          )}
          {contributors.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {contributors.length} contributor{contributors.length !== 1 ? 's' : ''}
            </span>
          )}
          {deadlineLabel && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {deadlineLabel}
            </span>
          )}
        </div>

        {/* Recipient info — who is receiving the zaps */}
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
          <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Avatar shape={avatarShape} className="size-9 ring-2 ring-background">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Receiving zaps</p>
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

        {/* Zap button */}
        {!expired && canZap(metadata) && (
          <div onClick={(e) => e.stopPropagation()}>
            <ZapDialog target={event}>
              <button
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <Zap className="size-4" />
                Contribute
              </button>
            </ZapDialog>
          </div>
        )}
      </div>
    </div>
  );
}

/** Skeleton placeholder for loading goal cards. */
export function GoalCardSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <Skeleton className="size-9 rounded-full" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}
