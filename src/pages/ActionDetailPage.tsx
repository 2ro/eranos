import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import {
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  DollarSign,
  Loader2,
  MapPin,
  Share2,
} from 'lucide-react';

import { useAction, type Action } from '@/hooks/useActions';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useComments } from '@/hooks/useComments';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useSubmissionZapTotals } from '@/hooks/useSubmissionZapTotals';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getDisplayName } from '@/lib/genUserName';
import { getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatPledgeAmount } from '@/lib/pledges';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import { ArticleContent } from '@/components/ArticleContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { PostActionBar } from '@/components/PostActionBar';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import NotFound from '@/pages/NotFound';

function formatDeadline(unixSeconds: number): { label: string; isPast: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) {
    return { label: `Ended ${new Date(unixSeconds * 1000).toLocaleDateString()}`, isPast: true };
  }
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: 'Ends today', isPast: false };
  if (days < 60) return { label: `${days} days left`, isPast: false };
  return { label: `Ends ${new Date(unixSeconds * 1000).toLocaleDateString()}`, isPast: false };
}

interface ActionDetailPageProps {
  pubkey: string;
  identifier: string;
}

export function ActionDetailPage({ pubkey, identifier }: ActionDetailPageProps) {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { data: action, isLoading, isError } = useAction(pubkey, identifier);

  useSeoMeta({
    title: action ? `${action.title} | Agora Pledge` : 'Pledge | Agora',
    description: action?.description?.slice(0, 200),
  });

  if (isLoading) return <PledgeDetailSkeleton />;
  if (isError || !action) return <NotFound />;

  return <PledgeDetailContent action={action} />;
}

function PledgeDetailContent({ action }: { action: Action }) {
  const { btcPrice } = useBitcoinWallet();
  const author = useAuthor(action.pubkey);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: commentsData, isLoading: commentsLoading } = useComments(action.event, 500);

  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const topLevel = useMemo(
    () => commentsData?.topLevelComments ?? [],
    [commentsData?.topLevelComments],
  );
  const submissionIds = useMemo(() => topLevel.map((c) => c.id), [topLevel]);
  const { data: zapTotals, isLoading: zapsLoading } = useSubmissionZapTotals(submissionIds);

  const fundedSats = useMemo(() => {
    const totals = zapTotals ?? new Map<string, number>();
    return topLevel.reduce((sum, submission) => sum + (totals.get(submission.id) ?? 0), 0);
  }, [topLevel, zapTotals]);

  const replyTree = useMemo((): ReplyNode[] => {
    const totals = zapTotals ?? new Map<string, number>();

    const buildNode = (ev: NostrEvent): ReplyNode => {
      const allChildren = commentsData?.getDirectReplies(ev.id) ?? [];
      if (allChildren.length <= 1) {
        return {
          event: ev,
          children: allChildren.map((c) => buildNode(c)),
        };
      }
      const [first, ...rest] = allChildren;
      return {
        event: ev,
        children: [buildNode(first)],
        hiddenChildren: rest.map((c) => buildNode(c)),
      };
    };

    return [...topLevel]
      .sort((a, b) => {
        const aSats = totals.get(a.id) ?? 0;
        const bSats = totals.get(b.id) ?? 0;
        if (bSats !== aSats) return bSats - aSats;
        return b.created_at - a.created_at;
      })
      .map((c) => buildNode(c));
  }, [commentsData, topLevel, zapTotals]);

  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const creatorName = getDisplayName(metadata, action.pubkey);
  const creatorProfileUrl = useProfileUrl(action.pubkey, metadata);
  const deadline = action.deadline ? formatDeadline(action.deadline) : null;
  const cover = sanitizeUrl(action.image);
  const progressValue = action.bounty > 0 ? Math.min(100, Math.round((fundedSats / action.bounty) * 100)) : 0;

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const storyEvent = useMemo(
    () => ({
      ...action.event,
      tags: action.event.tags.filter(([name]) => !['image', 'title', 't'].includes(name)),
    }),
    [action.event],
  );

  const handleShare = async () => {
    const url = `${window.location.origin}/${naddr}`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ title: action.title, text: action.description, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        toast({ title: 'Link copied to clipboard' });
      }
    } catch {
      // User likely cancelled the share sheet; nothing to do.
    }
  };

  return (
    <main className="min-h-screen pb-16">
      <PledgeHero
        action={action}
        cover={cover}
        creatorName={creatorName}
        creatorProfileUrl={creatorProfileUrl}
        deadline={deadline}
        onBack={() => navigate(-1)}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-b-xl rounded-t-none bg-card border border-t-0 border-border/60 shadow-sm px-4 sm:px-5 py-3">
          <PostActionBar
            event={action.event}
            replyLabel="Submit"
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="lg:hidden mb-6">
            <PledgeFundingCard
              action={action}
              btcPrice={btcPrice}
              fundedSats={fundedSats}
              progressValue={progressValue}
              submissionsCount={topLevel.length}
              isLoading={zapsLoading}
              onShare={handleShare}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-8">
            <PledgeStory storyEvent={storyEvent} hasContent={action.description.trim().length > 0} />

            <div id="pledge-activity" className="scroll-mt-20">
              <div>
                <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
                  <h2 className="text-lg font-semibold tracking-tight">Submissions</h2>
                  {topLevel.length > 0 ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {topLevel.length.toLocaleString()} {topLevel.length === 1 ? 'submission' : 'submissions'}
                    </span>
                  ) : null}
                </div>

                <DetailCommentComposer
                  event={action.event}
                  placeholder="Share proof, evidence, or completed work..."
                  className="mb-3"
                />

                {commentsLoading && replyTree.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <PledgeReplySkeleton key={i} />)}
                  </div>
                ) : replyTree.length > 0 ? (
                  <div className="-mx-2 sm:-mx-4 rounded-2xl bg-card border border-border/60 overflow-hidden">
                    <ThreadedReplyList roots={replyTree} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyOpen(true)}
                    className="block w-full rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center hover:bg-card hover:border-primary/40 transition-colors"
                  >
                    <p className="text-base font-medium text-foreground">No submissions yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Be the first to reply with proof, evidence, or completed work.
                    </p>
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start">
            <div className="lg:sticky lg:top-4">
              <PledgeFundingCard
                action={action}
                btcPrice={btcPrice}
                fundedSats={fundedSats}
                progressValue={progressValue}
                submissionsCount={topLevel.length}
                isLoading={zapsLoading}
                onShare={handleShare}
              />
            </div>
          </aside>
        </div>
      </div>

      <ReplyComposeModal event={action.event} open={replyOpen} onOpenChange={setReplyOpen} />
      <NoteMoreMenu event={action.event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </main>
  );
}

interface PledgeHeroProps {
  action: Action;
  cover: string | undefined;
  creatorName: string;
  creatorProfileUrl: string;
  deadline: { label: string; isPast: boolean } | null;
  onBack: () => void;
}

function PledgeHero({ action, cover, creatorName, creatorProfileUrl, deadline, onBack }: PledgeHeroProps) {
  const countryLabel = action.countryCode ? getGeoDisplayName(action.countryCode) : undefined;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const coverImage = cover && !imageLoadFailed ? cover : DEFAULT_COVER_IMAGE;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
      <div className="relative aspect-[16/9] sm:aspect-[21/9] rounded-t-xl rounded-b-none overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
        <img
          src={coverImage}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setImageLoadFailed(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />

        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 px-4 pt-4">
          <button
            onClick={onBack}
            className="p-2.5 -ml-2 rounded-full text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="size-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-5 sm:p-6 [text-shadow:0_1px_4px_rgba(0,0,0,0.75),0_2px_10px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-white">
              {action.title}
            </h1>
            <Link
              to={creatorProfileUrl}
              onClick={(e) => e.stopPropagation()}
              className="text-xs sm:text-sm text-white/85 hover:text-white motion-safe:transition-colors"
            >
              by <span className="font-medium">{creatorName}</span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm font-medium text-white/85">
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 sm:size-4" />
                {countryLabel}
              </span>
            )}
            {deadline ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 sm:size-4" />
                {deadline.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 sm:size-4" />
                Open-ended
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PledgeFundingCard({
  action,
  btcPrice,
  fundedSats,
  progressValue,
  submissionsCount,
  isLoading,
  onShare,
}: {
  action: Action;
  btcPrice: number | undefined;
  fundedSats: number;
  progressValue: number;
  submissionsCount: number;
  isLoading: boolean;
  onShare: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-5">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                {formatPledgeAmount(fundedSats, btcPrice)}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">funded</span>
              </div>
              <div className="text-xs text-muted-foreground">
                of {formatPledgeAmount(action.bounty, btcPrice)} pledged
                {submissionsCount > 0 && (
                  <>
                    {' · '}
                    {submissionsCount.toLocaleString()} {submissionsCount === 1 ? 'submission' : 'submissions'}
                  </>
                )}
              </div>
            </div>
            <Progress value={progressValue} className="h-2" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This pledge is trust-based. Funding progress sums zaps and donation receipts on top-level submissions.
            </p>
          </div>
        )}

        <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
          <Share2 className="size-4 mr-2" />
          Share
        </Button>
      </CardContent>
    </Card>
  );
}

function PledgeStory({ storyEvent, hasContent }: { storyEvent: NostrEvent; hasContent: boolean }) {
  if (!hasContent) {
    return (
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-muted-foreground italic">
          The pledger hasn't written details for this pledge yet.
        </p>
      </article>
    );
  }

  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <ArticleContent event={storyEvent} />
    </article>
  );
}

function PledgeReplySkeleton() {
  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

function PledgeDetailSkeleton() {
  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <Skeleton className="aspect-[16/9] sm:aspect-[21/9] w-full rounded-xl" />
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="flex-1 min-w-0 space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-5/6" />
          </div>
          <div className="hidden lg:block lg:w-[360px] lg:shrink-0 space-y-3">
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Loader-state subcomponent used when the addressable coordinate is still
 * being decoded (e.g. by NIP19Page). */
export function ActionDetailLoading() {
  return (
    <main>
      <div className="flex items-center gap-4 px-4 py-4 bg-background/85">
        <Link
          to="/pledges"
          className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden"
          aria-label="Back to pledges"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <DollarSign className="size-5 text-primary" />
          <h1 className="text-lg font-semibold truncate">Pledge</h1>
        </div>
      </div>
      <div className="px-4 max-w-3xl mx-auto space-y-4 py-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading pledge…</span>
        </div>
      </div>
    </main>
  );
}
