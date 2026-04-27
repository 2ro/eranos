import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Target, Users, Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ZapDialog } from '@/components/ZapDialog';
import { useGoalDisplay } from '@/hooks/useGoalDisplay';
import { useOpenPost } from '@/hooks/useOpenPost';
import { canZap } from '@/lib/canZap';
import { formatSats, parseGoalEvent, type ParsedGoal } from '@/lib/goalUtils';
import { cn } from '@/lib/utils';

// ── Public API ────────────────────────────────────────────────────────────────

interface GoalCardProps {
  event: NostrEvent;
  /** Pre-parsed goal. When omitted the component parses the event itself. */
  goal?: ParsedGoal;
  /**
   * `card` — standalone clickable card with border, stats row, and zap button
   *           (community fundraising tab).
   * `compact` — inline content block for NoteCard / PostDetailPage.
   */
  variant?: 'card' | 'compact';
}

/**
 * Renders a NIP-75 zap goal.
 *
 * - `variant="card"` (default): standalone card used in the community
 *    fundraising tab. Includes a clickable wrapper, stats row, and Contribute button.
 * - `variant="compact"`: inline renderer used inside NoteCard feeds and
 *    PostDetailPage.
 */
export function GoalCard({ event, goal: goalProp, variant = 'card' }: GoalCardProps) {
  const goal = useMemo(() => goalProp ?? parseGoalEvent(event), [goalProp, event]);
  if (!goal) return null;
  return <GoalCardInner event={event} goal={goal} variant={variant} />;
}

// ── Inner renderer (hooks are safe here) ──────────────────────────────────────

function GoalCardInner({
  event,
  goal,
  variant,
}: {
  event: NostrEvent;
  goal: ParsedGoal;
  variant: 'card' | 'compact';
}) {
  const isCard = variant === 'card';
  const d = useGoalDisplay(event, goal);
  const [imgError, setImgError] = useState(false);

  // Navigation (card variant only)
  const postPath = useMemo(
    () => `/${nip19.neventEncode({ id: event.id, author: event.pubkey })}`,
    [event.id, event.pubkey],
  );
  const { onClick: openPost, onAuxClick: auxOpenPost } = useOpenPost(postPath);

  // ── Shared sub-sections ───────────────────────────────────────────────────

  const imageSection = d.image && !imgError && (
    <div className={cn('overflow-hidden', isCard ? 'aspect-[21/9] w-full' : '-mx-4 aspect-[21/9]')}>
      <img
        src={d.image}
        alt={goal.title}
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );

  const headerSection = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Target className="size-4 text-primary shrink-0" />
        <h3 className={cn('font-semibold text-[15px] leading-tight', isCard && 'truncate')}>
          {goal.title}
        </h3>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {d.communityUrl && d.communityName && (
          <Link
            to={d.communityUrl}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Users className="size-3" />
            {d.communityName}
          </Link>
        )}
        {d.funded ? (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            Funded
          </Badge>
        ) : d.expired ? (
          <Badge variant="secondary">Ended</Badge>
        ) : !isCard && d.deadlineLabel ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {d.deadlineLabel}
          </span>
        ) : null}
      </div>
    </div>
  );

  const summarySection = goal.summary && (
    <p className={cn('text-sm text-muted-foreground leading-relaxed', !isCard && 'line-clamp-2')}>
      {goal.summary}
    </p>
  );

  const progressSection = (
    <div className={cn('space-y-2', !isCard && 'space-y-1.5')}>
      <Progress
        value={d.percentage}
        className={cn(isCard ? 'h-3' : 'h-2.5', d.funded && '[&>div]:bg-emerald-500')}
      />
      <div className={cn('flex items-center justify-between', isCard ? 'text-sm' : 'text-xs text-muted-foreground')}>
        <span className={cn('font-medium', !isCard && 'text-foreground')}>
          {d.progressLoading ? (
            <Skeleton className={cn('inline-block', isCard ? 'h-4 w-20' : 'h-3.5 w-16')} />
          ) : (
            <>{formatSats(d.currentSats)} sats</>
          )}
        </span>
        <span className={isCard ? 'text-muted-foreground' : undefined}>
          of {formatSats(goal.amountSats)} sats ({d.percentage}%)
        </span>
      </div>
    </div>
  );

  const recipientSection = (
    <div className={cn(
      'flex items-center rounded-lg bg-muted/50 px-3',
      isCard ? 'gap-3 py-2.5' : 'gap-2.5 py-2',
    )}>
      <Link to={d.profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Avatar shape={d.avatarShape} className={cn('ring-2 ring-background', isCard ? 'size-9' : 'size-8')}>
          <AvatarImage src={d.metadata?.picture} />
          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
            {d.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Receiving zaps</p>
        <Link
          to={d.profileUrl}
          className="text-sm font-medium truncate block hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {d.displayName}
        </Link>
        {d.lightningAddress && (
          <p className="text-xs text-muted-foreground truncate" title={d.lightningAddress}>
            <Zap className="size-3 inline-block mr-0.5 -mt-0.5" />
            {d.lightningAddress}
          </p>
        )}
      </div>
    </div>
  );

  // ── Card variant ──────────────────────────────────────────────────────────

  if (isCard) {
    return (
      <div
        className="rounded-xl border border-border overflow-hidden bg-card transition-all duration-300 hover:shadow-md hover:border-primary/20 cursor-pointer"
        onClick={openPost}
        onAuxClick={auxOpenPost}
      >
        {imageSection}

        <div className="p-4 space-y-4">
          {headerSection}
          {summarySection}
          {progressSection}

          {/* Stats row (card only) */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {d.zapCount > 0 && (
              <span className="flex items-center gap-1">
                <Zap className="size-3" />
                {d.zapCount} zap{d.zapCount !== 1 ? 's' : ''}
              </span>
            )}
            {d.contributors.length > 0 && (
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {d.contributors.length} contributor{d.contributors.length !== 1 ? 's' : ''}
              </span>
            )}
            {d.deadlineLabel && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {d.deadlineLabel}
              </span>
            )}
          </div>

          {recipientSection}

          {/* Zap button (card only) */}
          {!d.expired && canZap(d.metadata) && (
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

  // ── Compact variant ───────────────────────────────────────────────────────

  return (
    <div className="mt-3 space-y-3">
      {imageSection}
      {headerSection}
      {summarySection}
      {progressSection}
      {recipientSection}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

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
