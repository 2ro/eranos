import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Info, Target, Users, Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useGoalDisplay } from '@/hooks/useGoalDisplay';
import { formatSats, parseGoalEvent, type ParsedGoal } from '@/lib/goalUtils';
import { cn } from '@/lib/utils';

interface GoalCardProps {
  event: NostrEvent;
}

/**
 * Inline goal content renderer for NoteCard feeds and PostDetailPage.
 * Displays progress bar, recipient info, deadline, and community link.
 */
export function GoalCard({ event }: GoalCardProps) {
  const goal = useMemo(() => parseGoalEvent(event), [event]);
  if (!goal) return null;
  return <GoalCardInner event={event} goal={goal} />;
}

function GoalCardInner({ event, goal }: { event: NostrEvent; goal: ParsedGoal }) {
  const d = useGoalDisplay(event, goal);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="mt-3 space-y-3">
      {/* Goal image */}
      {d.image && !imgError && (
        <div className="-mx-4 aspect-[21/9] overflow-hidden">
          <img
            src={d.image}
            alt={goal.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
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
          ) : d.deadlineLabel ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {d.deadlineLabel}
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
          value={d.percentage}
          className={cn('h-2.5', d.funded && '[&>div]:bg-emerald-500')}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {d.progressLoading ? (
              <Skeleton className="h-3.5 w-16 inline-block" />
            ) : (
              <>{formatSats(d.currentSats)} sats</>
            )}
          </span>
          <span>of {formatSats(goal.amountSats)} sats ({d.percentage}%)</span>
        </div>
      </div>

      {goal.hasZapSplits ? (
        // TODO: Render and support NIP-57 zap splits for NIP-75 goals.
        <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            This goal uses split recipients. Split zap support is not available in this app yet.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
          <Link to={d.profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Avatar shape={d.avatarShape} className="size-8 ring-2 ring-background">
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
      )}
    </div>
  );
}
