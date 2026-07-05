import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Target, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useGoalDisplay } from '@/hooks/useGoalDisplay';
import { formatSats, parseGoalEvent, type ParsedGoal } from '@/lib/goalUtils';

interface GoalCardProps {
  event: NostrEvent;
}

/**
 * Inline goal content renderer for NoteCard feeds and PostDetailPage.
 * Displays the goal target, recipient info, deadline, and community link.
 * The raised tally is intentionally omitted — the Grin tally arrives in a
 * later phase.
 *
 * DEAD CODE (Grin-only federation): kind 9041 NIP-75 goals are Lightning money
 * rails and are now dropped at feed ingest and at the NoteCard render guard by
 * grinOnlyPolicy.ts, so these render paths are unreachable in practice. Left in
 * place (not deleted) because removal ripples across PostDetailPage,
 * useGoalDisplay, kindLabels, extraKinds, NotificationsPage, and CommentContext;
 * see grinOnlyPolicy.ts.
 */
export function GoalCard({ event }: GoalCardProps) {
  const goal = useMemo(() => parseGoalEvent(event), [event]);
  if (!goal) return null;
  return <GoalCardInner goal={goal} />;
}

function GoalCardInner({ goal }: { goal: ParsedGoal }) {
  const d = useGoalDisplay(goal);
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
          {d.expired ? (
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

      {/* Goal target — raised tally arrives in a later phase */}
      <div className="space-y-1.5">
        <Progress value={0} className="h-2.5" />
        <div className="flex items-center justify-end text-xs text-muted-foreground">
          <span>Goal: {formatSats(goal.amountSats)} sats</span>
        </div>
      </div>

      {/* Recipient */}
      <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
        <Link to={d.profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-8 ring-2 ring-background">
            <AvatarImage src={d.metadata?.picture} />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              {d.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Recipient</p>
          <Link
            to={d.profileUrl}
            className="text-sm font-medium truncate block hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {d.displayName}
          </Link>
        </div>
      </div>
    </div>
  );
}
