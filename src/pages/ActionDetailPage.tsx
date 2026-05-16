import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { format } from 'date-fns';
import { Link as RouterLink } from 'react-router-dom';
import { Camera, Palette, Info, Zap, Clock, Bitcoin, Loader2, MessageSquare, Trophy, ArrowLeft } from 'lucide-react';
import type { NostrMetadata } from '@nostrify/nostrify';

import { useAction, type Action } from '@/hooks/useActions';
import { useAuthor } from '@/hooks/useAuthor';
import { useComments } from '@/hooks/useComments';
import { useSubmissionZapTotals } from '@/hooks/useSubmissionZapTotals';
import { getDisplayName } from '@/lib/genUserName';
import { getGeoDisplayName, countryCodeToFlag } from '@/lib/countries';
import { cn } from '@/lib/utils';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ComposeBox } from '@/components/ComposeBox';
import { NoteCard } from '@/components/NoteCard';
import NotFound from '@/pages/NotFound';

const ACTION_ICONS = {
  photo: Camera,
  art: Palette,
  info: Info,
  action: Zap,
} as const;

interface ActionDetailPageProps {
  pubkey: string;
  identifier: string;
}

export function ActionDetailPage({ pubkey, identifier }: ActionDetailPageProps) {
  const { data: action, isLoading, isError } = useAction(pubkey, identifier);

  useSeoMeta({
    title: action ? `${action.title} | Agora Action` : 'Action | Agora',
    description: action?.description?.slice(0, 200),
  });

  if (isLoading) {
    return (
      <main>
        <DetailHeader />
        <div className="px-4 max-w-3xl mx-auto space-y-4">
          <Skeleton className="w-full h-56 rounded-2xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    );
  }

  if (isError || !action) {
    return <NotFound />;
  }

  return (
    <main>
      <DetailHeader />
      <article className="px-4 max-w-3xl mx-auto space-y-6 pb-24">
        <ActionHeader action={action} />
        <ActionBounty action={action} />
        <ActionDescription action={action} />
        <SubmissionsSection action={action} />
      </article>
    </main>
  );
}

function DetailHeader() {
  return (
    <div className="flex items-center gap-4 px-4 py-4 bg-background/85">
      <RouterLink
        to="/actions"
        className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden"
        aria-label="Back to actions"
      >
        <ArrowLeft className="size-5" />
      </RouterLink>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Zap className="size-5 text-primary" />
        <h1 className="text-lg font-semibold truncate">Action</h1>
      </div>
    </div>
  );
}

function ActionHeader({ action }: { action: Action }) {
  const author = useAuthor(action.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, action.pubkey);
  const Icon = ACTION_ICONS[action.type];
  const now = Date.now() / 1000;
  const isExpired = !!action.deadline && action.deadline <= now;

  return (
    <div className="space-y-4">
      {action.image && (
        <div className="relative w-full h-56 sm:h-64 overflow-hidden rounded-2xl border border-border">
          <img src={action.image} alt={action.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/20 border-2 border-primary/40 shadow-md flex-shrink-0">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black leading-tight">{action.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xl" title={getGeoDisplayName(action.countryCode)}>
              {countryCodeToFlag(action.countryCode)}
            </span>
            <span className="text-sm text-muted-foreground">{getGeoDisplayName(action.countryCode)}</span>
            {isExpired ? (
              <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-semibold flex items-center gap-1">
                <Clock className="h-3 w-3" /> Expired
              </span>
            ) : action.deadline ? (
              <span className="px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-accent text-xs font-semibold flex items-center gap-1">
                <Clock className="h-3 w-3" /> {format(action.deadline * 1000, 'MMM d, yyyy HH:mm')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Avatar className="h-8 w-8">
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span>
          Posted by <span className="font-medium text-foreground">{displayName}</span>
        </span>
      </div>
    </div>
  );
}

function ActionBounty({ action }: { action: Action }) {
  return (
    <Card className="border-2 border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5">
      <CardContent className="py-4 flex items-center gap-3">
        <Bitcoin className="h-7 w-7 text-primary flex-shrink-0" />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Bounty
          </div>
          <div className="font-black text-2xl">
            {action.bounty.toLocaleString()}
            <span className="text-sm font-medium text-muted-foreground ml-1">sats</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block max-w-[220px] text-right">
          Submissions are ranked by total zaps. Organizers pay out the bounty by zapping winning submissions.
        </p>
      </CardContent>
    </Card>
  );
}

function ActionDescription({ action }: { action: Action }) {
  if (!action.description.trim()) return null;
  return (
    <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
      {action.description}
    </div>
  );
}

function SubmissionsSection({ action }: { action: Action }) {
  const { data: commentsData, isLoading: commentsLoading } = useComments(action.event);

  const topLevel = useMemo(
    () => commentsData?.topLevelComments ?? [],
    [commentsData?.topLevelComments],
  );
  const submissionIds = useMemo(() => topLevel.map((c) => c.id), [topLevel]);
  const { data: zapTotals } = useSubmissionZapTotals(submissionIds);

  // Sort submissions by total sats zapped (descending), with submission
  // creation time as the tie-breaker (newest first).
  const ranked = useMemo(() => {
    const totals = zapTotals ?? new Map<string, number>();
    return [...topLevel].sort((a, b) => {
      const aSats = totals.get(a.id) ?? 0;
      const bSats = totals.get(b.id) ?? 0;
      if (bSats !== aSats) return bSats - aSats;
      return b.created_at - a.created_at;
    });
  }, [topLevel, zapTotals]);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Submissions
          {topLevel.length > 0 && (
            <span className="text-sm text-muted-foreground font-normal">({topLevel.length})</span>
          )}
        </h2>
      </header>

      <ComposeBox compact replyTo={action.event} placeholder="Submit your contribution…" />

      {commentsLoading ? (
        <SubmissionsSkeleton />
      ) : ranked.length === 0 ? (
        <SubmissionsEmptyState />
      ) : (
        <div className="space-y-3">
          {ranked.map((submission, index) => (
            <RankedSubmission
              key={submission.id}
              event={submission}
              rank={index + 1}
              sats={zapTotals?.get(submission.id) ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RankedSubmission({
  event, rank, sats,
}: { event: import('@nostrify/nostrify').NostrEvent; rank: number; sats: number }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-xs font-semibold">
        <span className={cn(
          'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px]',
          rank === 1 && 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
          rank === 2 && 'bg-zinc-400/20 text-zinc-700 dark:text-zinc-300',
          rank === 3 && 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
          rank > 3 && 'bg-muted text-muted-foreground',
        )}>
          #{rank}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Bitcoin className="size-3" />
          <span className="text-foreground font-bold">{sats.toLocaleString()}</span>
          sats zapped
        </span>
      </div>
      <NoteCard event={event} />
    </div>
  );
}

function SubmissionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 flex gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmissionsEmptyState() {
  return (
    <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
      <MessageSquare className="size-10 mx-auto mb-3 opacity-30" />
      <p className="text-base font-medium mb-1">No submissions yet</p>
      <p className="text-xs">Be the first to take action and earn part of the bounty.</p>
    </div>
  );
}

/** Loader-state subcomponent used when the addressable coordinate is still
 *  being decoded (e.g. by NIP19Page). */
export function ActionDetailLoading() {
  return (
    <main>
      <DetailHeader />
      <div className="px-4 max-w-3xl mx-auto space-y-4 py-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading action…</span>
        </div>
      </div>
    </main>
  );
}
