import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import {
  CalendarClock,
  ChevronLeft,
  MapPin,
  Share2,
} from 'lucide-react';

import { parseAction, useAction, type Action } from '@/hooks/useActions';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useComments } from '@/hooks/useComments';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/genUserName';
import { getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatPledgeAmount } from '@/lib/pledges';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentsSection } from '@/components/CommentsSection';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { DetailReplySkeleton, DetailStory } from '@/components/DetailStory';
import { PostActionBar } from '@/components/PostActionBar';
import { PinnedCommentHeader } from '@/components/PinnedCommentHeader';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ModerationMenu } from '@/components/moderation';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { usePinnedEventComments } from '@/hooks/usePinnedEventComments';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import NotFound from '@/pages/NotFound';

function formatDeadline(unixSeconds: number, t: TFunction): { label: string; isPast: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) {
    return { label: t('pledges.detail.deadlineEndedOn', { date: new Date(unixSeconds * 1000).toLocaleDateString() }), isPast: true };
  }
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: t('pledges.detail.deadlineEndsToday'), isPast: false };
  if (days < 60) return { label: t('pledges.detail.deadlineDaysLeft', { count: days }), isPast: false };
  return { label: t('pledges.detail.deadlineEndsOn', { date: new Date(unixSeconds * 1000).toLocaleDateString() }), isPast: false };
}

interface ActionDetailPageProps {
  pubkey: string;
  identifier: string;
}

export function ActionDetailPage({ pubkey, identifier }: ActionDetailPageProps) {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { data: action, isLoading, isError } = useAction(pubkey, identifier);

  useSeoMeta({
    title: action
      ? t('pledges.detail.seoTitle', { title: action.title, appName: config.appName })
      : t('pledges.detail.seoFallbackTitle', { appName: config.appName }),
    description: action?.description?.slice(0, 200),
  });

  if (isLoading) return <PledgeDetailSkeleton />;
  if (isError || !action) return <NotFound />;

  return <PledgeDetailContent action={action} />;
}

function PledgeDetailContent({ action }: { action: Action }) {
  const { t } = useTranslation();
  const author = useAuthor(action.pubkey);
  const navigate = useNavigate();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const { data: commentsData, isLoading: commentsLoading } = useComments(action.event, 500);
  const rootATag = `36639:${action.pubkey}:${action.id}`;
  const {
    pinnedEvents,
    isPinned,
    canManagePins,
    togglePin,
  } = usePinnedEventComments(rootATag, action.pubkey);

  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { translatedEvent, translateAction } = useEventTranslation(action.event);
  const displayAction = useMemo(() => parseAction(translatedEvent) ?? action, [translatedEvent, action]);

  const topLevel = useMemo(
    () => commentsData?.topLevelComments ?? [],
    [commentsData?.topLevelComments],
  );

  const replyTree = useMemo((): ReplyNode[] => {
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
      .sort((a, b) => b.created_at - a.created_at)
      .map((c) => buildNode(c));
  }, [commentsData, topLevel]);

  const pinnedNodes = useMemo(
    () => pinnedEvents.map((event): ReplyNode => ({ event, children: [] })),
    [pinnedEvents],
  );

  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const creatorName = getDisplayName(metadata, action.pubkey);
  const creatorProfileUrl = useProfileUrl(action.pubkey, metadata);
  const creatorPicture = sanitizeUrl(metadata?.picture);
  const deadline = action.deadline ? formatDeadline(action.deadline, t) : null;
  const cover = sanitizeUrl(action.image);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const storyEvent = useMemo(
    () => ({
      ...displayAction.event,
      tags: displayAction.event.tags.filter(([name]) => !['image', 'title', 't'].includes(name)),
    }),
    [displayAction.event],
  );

  const handleShare = async () => {
    const url = `${shareOrigin}/${naddr}`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ title: displayAction.title, text: displayAction.description, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        toast({ title: t('pledges.detail.linkCopied') });
      }
    } catch {
      // User likely cancelled the share sheet; nothing to do.
    }
  };

  return (
    <main className="min-h-screen pb-16">
      <PledgeHero
        action={displayAction}
        cover={cover}
        creatorName={creatorName}
        creatorProfileUrl={creatorProfileUrl}
        creatorPicture={creatorPicture}
        deadline={deadline}
        onBack={() => navigate(-1)}
        onReply={() => setReplyOpen(true)}
        onMore={() => setMoreMenuOpen(true)}
        translateAction={translateAction}
      />

      {pinnedNodes.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
          <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
            <ThreadedReplyList
              roots={pinnedNodes}
              renderItemHeader={(event) => (
                <PledgePinHeader
                  isPinned={isPinned(event.id)}
                  canManagePins={canManagePins}
                  pinPending={togglePin.isPending}
                  onTogglePin={() => handleTogglePin(event)}
                />
              )}
            />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="lg:hidden mb-6">
            <PledgeFundingCard
              action={displayAction}
              submissionsCount={topLevel.length}
              onShare={handleShare}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-8">
            <PledgeStory storyEvent={storyEvent} hasContent={displayAction.description.trim().length > 0} />

            <div id="pledge-activity" className="scroll-mt-20">
              <CommentsSection
                title={t('pledges.detail.submissions')}
                countLabel={topLevel.length > 0 ? t('pledges.detail.submissionCount', { count: topLevel.length }) : undefined}
              >
                <DetailCommentComposer
                  event={action.event}
                  placeholder={t('pledges.detail.submissionPlaceholder')}
                />

                {commentsLoading && replyTree.length === 0 ? (
                  <div>
                    {Array.from({ length: 3 }).map((_, i) => <DetailReplySkeleton key={i} />)}
                  </div>
                ) : replyTree.length > 0 ? (
                  <ThreadedReplyList
                    roots={replyTree}
                    renderItemHeader={(event) => (
                      <PledgePinHeader
                        isPinned={isPinned(event.id)}
                        canManagePins={canManagePins}
                        pinPending={togglePin.isPending}
                        onTogglePin={() => handleTogglePin(event)}
                      />
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyOpen(true)}
                    className="block w-full px-6 py-10 text-center hover:bg-foreground/5 transition-colors"
                  >
                    <p className="text-base font-medium text-foreground">{t('pledges.detail.noSubmissionsTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('pledges.detail.noSubmissionsHint')}
                    </p>
                  </button>
                )}
              </CommentsSection>
            </div>
          </div>

          <aside className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start">
            <div className="lg:sticky lg:top-4">
              <PledgeFundingCard
                action={displayAction}
                submissionsCount={topLevel.length}
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

  function handleTogglePin(event: NostrEvent) {
    const wasPinned = isPinned(event.id);
    togglePin.mutate(event.id, {
      onSuccess: () => {
        toast({ title: wasPinned ? t('pledges.detail.unpinnedToast') : t('pledges.detail.pinnedToast') });
      },
      onError: () => {
        toast({ title: t('pledges.detail.pinFailed'), variant: 'destructive' });
      },
    });
  }
}

function PledgePinHeader({
  isPinned,
  canManagePins,
  pinPending,
  onTogglePin,
}: {
  isPinned: boolean;
  canManagePins: boolean;
  pinPending: boolean;
  onTogglePin: () => void;
}) {
  return (
    <PinnedCommentHeader
      isPinned={isPinned}
      canManagePins={canManagePins}
      pinPending={pinPending}
      onTogglePin={onTogglePin}
    />
  );
}

interface PledgeHeroProps {
  action: Action;
  cover: string | undefined;
  creatorName: string;
  creatorProfileUrl: string;
  creatorPicture: string | undefined;
  deadline: { label: string; isPast: boolean } | null;
  onBack: () => void;
  onReply: () => void;
  onMore: () => void;
  translateAction: ReactNode;
}

function PledgeHero({
  action,
  cover,
  creatorName,
  creatorProfileUrl,
  creatorPicture,
  deadline,
  onBack,
  onReply,
  onMore,
  translateAction,
}: PledgeHeroProps) {
  const { t } = useTranslation();
  const countryLabel = action.countryCode ? getGeoDisplayName(action.countryCode) : undefined;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const coverImage = cover && !imageLoadFailed ? cover : DEFAULT_COVER_IMAGE;
  const initials = creatorName.slice(0, 2).toUpperCase();

  return (
    <header className="relative isolate w-full overflow-hidden bg-gradient-to-br from-primary/35 via-primary/15 to-secondary min-h-[92svh] sm:min-h-0 sm:aspect-[21/9] lg:aspect-[3/1]">
      <img
        src={coverImage}
        alt=""
        className="absolute inset-0 size-full object-cover"
        onError={() => setImageLoadFailed(true)}
      />

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-[20%] bg-gradient-to-t from-black/95 via-black/80 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent"
      />

      <div className="absolute inset-x-0 top-0 z-10 px-5 sm:px-6 lg:px-0 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-10 pl-2 pr-3.5 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
            aria-label={t('common.goBack')}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
            <span className="text-sm font-medium hidden sm:inline">{t('pledges.detail.back')}</span>
          </button>
          {/* Moderator-only kebab. Returns null for non-moderators so
              non-mod viewers don't subscribe to the moderation query.
              Matches the dark hero styling — translucent black pill so
              it reads against the photo at the same weight as the back
              button on the left. */}
          <ModerationMenu
            coord={`36639:${action.pubkey}:${action.id}`}
            entityTitle={action.title}
            surface="pledge"
            axes={['hide', 'featured']}
            className="size-10 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 hover:text-white focus-visible:ring-2 focus-visible:ring-white/80"
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 px-5 sm:px-6 lg:px-0 pb-[max(env(safe-area-inset-bottom),1.75rem)] pt-16 sm:pt-20">
        <div className="max-w-6xl mx-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white max-w-4xl">
            {action.title}
          </h1>

          <Link
            to={creatorProfileUrl}
            onClick={(e) => e.stopPropagation()}
            className="mt-5 inline-flex items-center gap-2.5 text-sm sm:text-base text-white/90 hover:text-white motion-safe:transition-colors group [text-shadow:none]"
          >
            <Avatar className="size-8 sm:size-9 ring-2 ring-white/30">
              {creatorPicture && <AvatarImage src={creatorPicture} alt="" />}
              <AvatarFallback className="text-xs bg-white/15 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
              <Trans
                i18nKey="pledges.detail.byAuthor"
                values={{ name: creatorName }}
                components={{ 0: <span className="font-semibold underline-offset-4 group-hover:underline" /> }}
              />
            </span>
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm font-medium text-white/85">
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {countryLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              {deadline ? deadline.label : t('pledges.detail.openEnded')}
            </span>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 [&_button]:!text-white/90 [&_button:hover]:!text-white [&_button:hover]:!bg-white/15 [&_button]:transition-colors [text-shadow:none]">
            <PostActionBar
              event={action.event}
              replyLabel={t('pledges.detail.submitLabel')}
              showShareInSidebar
              onReply={onReply}
              onMore={onMore}
              translateAction={translateAction}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function PledgeFundingCard({
  action,
  submissionsCount,
  onShare,
}: {
  action: Action;
  submissionsCount: number;
  onShare: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden border-0 shadow-none bg-transparent lg:border lg:shadow-sm lg:bg-card">
      <CardContent className="p-0 lg:p-5 space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('pledges.card.pledged')}
          </p>
          <div className="text-2xl font-bold tracking-tight">
            {formatPledgeAmount(action.bounty)}
          </div>
          {submissionsCount > 0 && (
            <div className="text-xs text-muted-foreground">
              {t('pledges.detail.submissionCount', { count: submissionsCount })}
            </div>
          )}
        </div>

        <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
          <Share2 className="size-4 mr-2" />
          {t('pledges.detail.share')}
        </Button>
      </CardContent>
    </Card>
  );
}

function PledgeStory({ storyEvent, hasContent }: { storyEvent: NostrEvent; hasContent: boolean }) {
  const { t } = useTranslation();
  return (
    <DetailStory
      event={storyEvent}
      hasContent={hasContent}
      heading={t('pledges.detail.storyHeading')}
      headingId="pledge-story-heading"
      emptyText={t('pledges.detail.storyEmpty')}
    />
  );
}

function PledgeDetailSkeleton() {
  return (
    <main className="min-h-screen pb-16">
      <Skeleton className="w-full min-h-[78svh] sm:min-h-0 sm:aspect-[21/9] lg:aspect-[24/9] rounded-none" />
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="flex-1 min-w-0 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="hidden lg:block lg:w-[360px] lg:shrink-0 space-y-3">
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
