import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation, Trans } from 'react-i18next';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  ChevronLeft,
  HandHeart,
  Pencil,
  Share2,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';

import { AuthorByline } from '@/components/AuthorByline';
import { CampaignLedger } from '@/components/CampaignLedger';
import { CampaignVerificationBadge } from '@/components/CampaignVerificationBadge';
import { CommentsSection } from '@/components/CommentsSection';
import {
  CampaignWalletDonatePanel,
} from '@/components/CampaignWalletDonatePanel';
import { HDSendBitcoinDialog } from '@/components/HDSendBitcoinDialog';
import { Lightbox } from '@/components/ImageGallery';
import { NoBitcoinDialog } from '@/components/NoBitcoinDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModerationMenu } from '@/components/moderation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { DetailReplySkeleton, DetailStory } from '@/components/DetailStory';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { PostActionBar } from '@/components/PostActionBar';
import { PinnedCommentHeader } from '@/components/PinnedCommentHeader';
import { PendingBadge } from '@/components/PendingBadge';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { Progress } from '@/components/ui/progress';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useEventStats } from '@/hooks/useTrending';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { usePinnedEventComments } from '@/hooks/usePinnedEventComments';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import {
  encodeCampaignNaddr,
  getCampaignCountryLabel,
  parseCampaign,
  type ParsedCampaign,
} from '@/lib/campaign';
import { satsToUSDWhole } from '@/lib/bitcoin';
import { formatUsdGoal } from '@/lib/formatCampaignAmount';
import { formatNumber } from '@/lib/formatNumber';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import NotFound from './NotFound';

interface CampaignDetailPageProps {
  /** Campaign author hex pubkey from the decoded naddr. */
  pubkey: string;
  /** Campaign `d` tag identifier from the decoded naddr. */
  identifier: string;
  /** Optional relay hints from the naddr. */
  relays?: string[];
}

function formatSatsFull(sats: number, btcPrice: number | undefined): string {
  if (btcPrice) return satsToUSDWhole(sats, btcPrice);
  if (sats >= 100_000_000) return `${(sats / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} BTC`;
  return `${sats.toLocaleString()} sats`;
}

function collectReplyEvents(nodes: ReplyNode[], out = new Map<string, NostrEvent>()): Map<string, NostrEvent> {
  for (const node of nodes) {
    out.set(node.event.id, node.event);
    collectReplyEvents(node.children, out);
    if (node.hiddenChildren) collectReplyEvents(node.hiddenChildren, out);
  }
  return out;
}

export function CampaignDetailPage({ pubkey, identifier, relays }: CampaignDetailPageProps) {
  // Drop the default 600px column cap and the default right widget sidebar
  // — this page renders its own GoFundMe-style 2-column layout (article on
  // the left, sticky donate card on the right). We don't pass a custom
  // rightSidebar through MainLayout because the column needs to scroll
  // with the article on mobile (where the sidebar slot is invisible
  // anyway). Keeping everything in one Outlet lets us inline the donate
  // column below the hero on small screens.

  const { data: campaign, isLoading, isError } = useCampaign({ pubkey, identifier, relays });

  if (isLoading) return <CampaignDetailSkeleton />;
  if (isError || !campaign) return <NotFound />;

  return <CampaignDetailContent campaign={campaign} />;
}

function CampaignDetailContent({ campaign }: { campaign: ParsedCampaign }) {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const author = useAuthor(campaign.pubkey);
  const { data: btcPrice } = useBtcPrice();
  // Detail page is a single instance, so live polling here is safe (unlike
  // the card grids, which must not poll — see useCampaignDonations).
  const { data: stats, isLoading: statsLoading } = useCampaignDonations(campaign, {
    refetchInterval: 30_000,
  });
  const navigate = useNavigate();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const queryClient = useQueryClient();

  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false);
  const { translatedEvent, translateAction } = useEventTranslation(campaign.event);
  const displayCampaign = useMemo(() => parseCampaign(translatedEvent) ?? campaign, [translatedEvent, campaign]);

  const deleteMutation = useDeleteEvent();

  const { data: engagementStats } = useEventStats(campaign.event.id, campaign.event);

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  // Whether the engagement counters row above the comments list should
  // render — at least one of repost / quote / reaction has a non-zero
  // count. Zaps are intentionally excluded for campaigns (donations are
  // on-chain kind 8333 receipts; a zap count would suggest the wrong CTA).
  const hasStats =
    !!engagementStats?.replies ||
    !!engagementStats?.reposts ||
    !!engagementStats?.quotes ||
    !!engagementStats?.reactions;

  const { data: commentsData, isLoading: commentsLoading } = useComments(
    campaign.event,
    500,
  );
  const {
    pinnedIds,
    pinnedEvents,
    isPinned,
    canManagePins,
    togglePin,
  } = usePinnedEventComments(campaign.aTag, campaign.pubkey);

  // Aggregate kind 8333 donation receipts by `(txid, donor)` so each
  // donation surfaces as a single event in the donor list and the inline
  // reply tree. Legacy donations (one receipt per beneficiary sharing the
  // same txid + donor) collapse into one card showing the donation total.
  const donationReceipts = useMemo((): NostrEvent[] => {
    if (!stats?.receipts || stats.receipts.length === 0) return [];

    type Aggregate = { canonical: NostrEvent; totalSats: number };
    const byDonation = new Map<string, Aggregate>();

    for (const receipt of stats.receipts) {
      const txid = receipt.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
      const amountTag = receipt.tags.find(([n]) => n === 'amount')?.[1];
      const amount = amountTag ? Number(amountTag) : NaN;
      if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

      const key = `${txid}:${receipt.pubkey}`;
      const prev = byDonation.get(key);
      const totalSats = (prev?.totalSats ?? 0) + amount;
      const canonical = prev && prev.canonical.created_at >= receipt.created_at
        ? prev.canonical
        : receipt;
      byDonation.set(key, { canonical, totalSats });
    }

    return Array.from(byDonation.values()).map(({ canonical, totalSats }) => ({
      ...canonical,
      tags: [
        ...canonical.tags.filter(([n]) => n !== 'amount'),
        ['amount', String(totalSats)],
      ],
    }));
  }, [stats?.receipts]);

  const replyTree = useMemo((): ReplyNode[] => {
    const topLevelComments = commentsData?.topLevelComments ?? [];

    const buildCommentNode = (ev: NostrEvent): ReplyNode => {
      const allChildren = commentsData?.getDirectReplies(ev.id) ?? [];
      if (allChildren.length <= 1) {
        return {
          event: ev,
          children: allChildren.map((c) => buildCommentNode(c)),
        };
      }
      const [first, ...rest] = allChildren;
      return {
        event: ev,
        children: [buildCommentNode(first)],
        hiddenChildren: rest.map((c) => buildCommentNode(c)),
      };
    };

    const commentNodes = topLevelComments.map((c) => buildCommentNode(c));
    const donationNodes: ReplyNode[] = donationReceipts.map((ev) => ({ event: ev, children: [] }));

    return [...commentNodes, ...donationNodes].sort(
      (a, b) => b.event.created_at - a.event.created_at,
    );
  }, [commentsData, donationReceipts]);

  const feedEventsById = useMemo(() => collectReplyEvents(replyTree), [replyTree]);

  const pinnedNodes = useMemo((): ReplyNode[] => {
    return pinnedIds
      .map((id) => feedEventsById.get(id) ?? pinnedEvents.find((event) => event.id === id))
      .filter((event): event is NostrEvent => !!event)
      .map((event): ReplyNode => ({ event, children: [] }));
  }, [feedEventsById, pinnedEvents, pinnedIds]);

  const authorMetadata = author.data?.metadata;
  const cover = sanitizeUrl(campaign.banner) ?? sanitizeUrl(authorMetadata?.banner) ?? sanitizeUrl(authorMetadata?.picture);

  const countryLabel = getCampaignCountryLabel(campaign);
  const raisedSats = stats?.totalSats ?? 0;
  const pendingSats = stats?.pendingSats ?? 0;

  const isCreator = user?.pubkey === campaign.pubkey;
  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const storyEvent = useMemo(
    () => ({
      ...displayCampaign.event,
      tags: displayCampaign.event.tags.filter(([name]) => !['banner', 'imeta', 'summary', 'title', 'w'].includes(name)),
    }),
    [displayCampaign.event],
  );

  useSeoMeta({
    title: t('campaignsDetail.seoTitle', { title: displayCampaign.title, appName: config.appName }),
    description: displayCampaign.summary || t('campaignsDetail.seoDescriptionFallback', { title: displayCampaign.title, appName: config.appName }),
    ogImage: cover,
  });

  const handleShare = async () => {
    const url = `${shareOrigin}/${naddr}`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ title: displayCampaign.title, text: displayCampaign.summary, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        toast({ title: t('campaignsDetail.linkCopied') });
      }
    } catch {
      // User likely cancelled the share sheet; nothing to do.
    }
  };

  const handleDeleteCampaign = () => {
    deleteMutation.mutate(
      {
        eventId: campaign.event.id,
        eventKind: campaign.event.kind,
        eventPubkey: campaign.pubkey,
        eventDTag: campaign.identifier,
      },
      {
        onSuccess: () => {
          toast({
            title: t('campaignsDetail.deletedToast'),
            description: t('campaignsDetail.deletedToastDesc'),
          });
          setDeleteConfirmOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['campaign', campaign.pubkey, campaign.identifier] });
          void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          void queryClient.invalidateQueries({ queryKey: ['campaigns-all'] });
          // Campaigns may be attached to an organization via an `A` tag;
          // refresh the org's activity shelf so the deleted campaign drops
          // off without a page refresh.
          const orgATag = campaign.event.tags.find(([n]) => n === 'A')?.[1];
          if (orgATag) {
            void queryClient.invalidateQueries({ queryKey: ['organization-activity', orgATag] });
          }
          // Country-tagged campaigns surface in the country feed.
          if (campaign.countryCode) {
            void queryClient.invalidateQueries({ queryKey: ['agora-feed-paginated', campaign.countryCode] });
            void queryClient.invalidateQueries({ queryKey: ['agora-feed-new-posts', campaign.countryCode] });
          }
          navigate('/');
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          toast({
            title: t('campaignsDetail.deleteErrorTitle'),
            description: msg,
            variant: 'destructive',
          });
        },
      },
    );
  };

  // ── Donate column ──
  // Rendered twice in the JSX tree below: once inline under the hero on
  // mobile (`lg:hidden`), once as the sticky right column on desktop
  // (`hidden lg:block`). Building it as a const here keeps both call
  // sites in sync — single source of truth for the donate UX.
  const donateColumn = (
    <DonateColumn
      campaign={campaign}
      raisedSats={raisedSats}
      pendingSats={pendingSats}
      statsLoading={statsLoading}
      btcPrice={btcPrice}
      donations={donationReceipts}
      onShare={handleShare}
    />
  );

  return (
    <main className="min-h-screen pb-16">
      {/* Full-bleed cover image. Title, summary, byline, meta, and the
          action bar live in `CampaignHeading` below the banner — the
          image stays unobstructed so banners with baked-in text are
          fully visible. */}
      <CampaignHero
        cover={cover}
        isCreator={isCreator}
        naddr={naddr}
        coord={campaign.aTag}
        entityTitle={campaign.title}
        deleteDisabled={deleteMutation.isPending}
        onBack={() => navigate(-1)}
        onDelete={() => setDeleteConfirmOpen(true)}
        onCoverClick={cover ? () => setCoverLightboxOpen(true) : undefined}
      />

      <CampaignHeading
        campaign={displayCampaign}
        creatorPubkey={campaign.pubkey}
        countryLabel={countryLabel}
        onReply={() => setReplyOpen(true)}
        onMore={() => setMoreMenuOpen(true)}
        translateAction={translateAction}
      />

      {/* Body region. Background stays flat — the warmth lives on the
          sidebar and comments surfaces, not in the page itself. The
          hero's `from-black/95` cap is the only transition into the
          body. */}
      <div className="relative">

        {pinnedNodes.length > 0 && (
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-6">
            <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
              <ThreadedReplyList
                roots={pinnedNodes}
                hideCommentContext
                leafCardClassName="py-4"
                renderAuthorBadge={(event) =>
                  event.pubkey === campaign.pubkey ? <CampaignerBadge /> : null
                }
                renderItemHeader={(event) => (
                  <CampaignPinHeader
                    canManagePins={canManagePins}
                    isPinned={isPinned(event.id)}
                    pinPending={togglePin.isPending}
                    onTogglePin={() => handleTogglePin(event)}
                  />
                )}
              />
            </div>
          </div>
        )}

        {/* Two-column body. On mobile the right column collapses inline
            immediately below the hero so the donate CTA stays above the
            fold. On lg+ the right column sticks to the viewport edge of
            the main content while the article scrolls. */}
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Mobile-only inline donate card */}
          <div id="campaign-donate" className="lg:hidden mb-6 scroll-mt-[4.5rem]">{donateColumn}</div>

          {/* Main article column */}
          <div className="flex-1 min-w-0 space-y-8">
            {displayCampaign.story.trim().length > 0 && (
              <CampaignStory storyEvent={storyEvent} />
            )}

            {/* Engagement counters above the comments. The action bar
                itself lives in the hero overlay; these counters stay
                inline so users can tap a count to see who reposted /
                quoted / liked the campaign via InteractionsModal. */}
            <div id="campaign-activity" className="scroll-mt-20">
              {hasStats && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground px-1">
                  {engagementStats?.reposts ? (
                    <button
                      onClick={() => openInteractions('reposts')}
                      className="hover:underline transition-colors"
                    >
                      <Trans
                        i18nKey="campaignsDetail.repost"
                        count={engagementStats.reposts}
                        values={{ formattedCount: formatNumber(engagementStats.reposts) }}
                        components={{ 0: <span className="font-bold text-foreground" /> }}
                      />
                    </button>
                  ) : null}
                  {engagementStats?.quotes ? (
                    <button
                      onClick={() => openInteractions('quotes')}
                      className="hover:underline transition-colors"
                    >
                      <Trans
                        i18nKey="campaignsDetail.quote"
                        count={engagementStats.quotes}
                        values={{ formattedCount: formatNumber(engagementStats.quotes) }}
                        components={{ 0: <span className="font-bold text-foreground" /> }}
                      />
                    </button>
                  ) : null}
                  {engagementStats?.reactions ? (
                    <button
                      onClick={() => openInteractions('reactions')}
                      className="hover:underline transition-colors"
                    >
                      <Trans
                        i18nKey="campaignsDetail.like"
                        count={engagementStats.reactions}
                        values={{ formattedCount: formatNumber(engagementStats.reactions) }}
                        components={{ 0: <span className="font-bold text-foreground" /> }}
                      />
                    </button>
                  ) : null}
                </div>
              )}

              <CampaignActivityTabs
                campaign={campaign}
                commentsTab={
                  <CommentsSection className="mt-0">
                    <DetailCommentComposer
                      event={campaign.event}
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] })}
                    />

                    {commentsLoading && statsLoading && replyTree.length === 0 ? (
                      <div>
                        {Array.from({ length: 3 }).map((_, i) => (
                          <DetailReplySkeleton key={i} />
                        ))}
                      </div>
                    ) : replyTree.length > 0 ? (
                      <div>
                        <ThreadedReplyList
                          roots={replyTree}
                          hideCommentContext
                          leafCardClassName="py-4"
                          renderAuthorBadge={(event) =>
                            event.pubkey === campaign.pubkey ? <CampaignerBadge /> : null
                          }
                          renderItemHeader={(event) => (
                            <CampaignPinHeader
                              canManagePins={canManagePins}
                              isPinned={isPinned(event.id)}
                              pinPending={togglePin.isPending}
                              onTogglePin={() => handleTogglePin(event)}
                            />
                          )}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReplyOpen(true)}
                        className="block w-full px-6 py-10 text-center hover:bg-foreground/5 transition-colors"
                      >
                        <p className="text-base font-medium text-foreground">
                          {t('campaignsDetail.noCommentsTitle')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('campaignsDetail.noCommentsHint')}
                        </p>
                      </button>
                    )}
                  </CommentsSection>
                }
              />
            </div>
          </div>

          {/* Desktop-only donate column. The sticky inner wrapper tracks the
              viewport while there's room to slide. When the donate card is
              taller than the viewport (e.g. a campaign with many
              beneficiaries) the bottom is reachable via the normal page
              scroll: as the user scrolls down the article, the sticky
              wrapper rides along until the flex row ends, exposing the
              bottom of the column. This is preferable to capping the
              column's height with `max-h` + `overflow-y-auto`, which traps
              content behind a second scrollbar and visually clips the
              bottom of the card. */}
          <aside className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start">
            <div id="campaign-donate-desktop" className="lg:sticky lg:top-4 scroll-mt-20">{donateColumn}</div>
          </aside>
        </div>
      </div>
      </div>

      <ReplyComposeModal
        event={campaign.event}
        open={replyOpen}
        onOpenChange={setReplyOpen}
      />
      <NoteMoreMenu
        event={campaign.event}
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
      />
      <InteractionsModal
        eventId={campaign.event.id}
        open={interactionsOpen}
        onOpenChange={setInteractionsOpen}
        initialTab={interactionsTab}
      />

      {cover && coverLightboxOpen && (
        <Lightbox
          images={[cover]}
          currentIndex={0}
          onClose={() => setCoverLightboxOpen(false)}
          onNext={() => {}}
          onPrev={() => {}}
        />
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('campaignsDetail.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaignsDetail.deleteDialogBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCampaign();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t('campaignsDetail.deleting') : t('campaignsDetail.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );

  function handleTogglePin(event: NostrEvent) {
    const wasPinned = isPinned(event.id);
    togglePin.mutate(event.id, {
      onSuccess: () => {
        toast({ title: wasPinned ? t('campaignsDetail.unpinnedToast') : t('campaignsDetail.pinnedToast') });
      },
      onError: () => {
        toast({ title: t('campaignsDetail.pinFailed'), variant: 'destructive' });
      },
    });
  }
}

function CampaignPinHeader({
  canManagePins,
  isPinned,
  pinPending,
  onTogglePin,
}: {
  canManagePins: boolean;
  isPinned: boolean;
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

/**
 * Tabbed wrapper around the campaign's social + on-chain activity. The
 * "Comments & donations" tab is always present; "Ledger" only renders when
 * the campaign declares a public on-chain endpoint (`bc1q…` / `bc1p…`).
 *
 * Silent-payment-only campaigns intentionally have no ledger — the receive
 * address is unlinkable by design — so the component degrades to a single
 * un-tabbed surface in that case to avoid showing a lone disabled tab.
 *
 * Visual treatment: the tab strip reads as a *section header*, not a
 * control widget. The active tab label is the same size and weight as the
 * `<h2>` headings used elsewhere on the page; the inactive tabs sit beside
 * it as muted siblings. A 1px baseline border runs the full width of the
 * panel, and the active tab "lifts" off that baseline with a thicker
 * primary-tinted under-rule that visually flows into the content surface
 * below. The list overrides the default shadcn pill style entirely.
 */
function CampaignActivityTabs({
  campaign,
  commentsTab,
}: {
  campaign: ParsedCampaign;
  commentsTab: ReactNode;
}) {
  const { t } = useTranslation();
  const onchainAddress = campaign.wallets.onchain?.value;

  // No on-chain endpoint → no Ledger tab. Render the comments surface
  // directly so we don't show a single lonely tab control. The caller
  // already omits the inline title, so add a heading here that mirrors
  // the section headers used elsewhere on the page.
  if (!onchainAddress) {
    return (
      <div className="mt-4">
        <h2 className="mb-3 px-1 text-lg font-semibold tracking-tight">
          {t('campaignsDetail.tabComments')}
        </h2>
        {commentsTab}
      </div>
    );
  }

  return (
    <Tabs defaultValue="comments" className="mt-4">
      {/* Underline-style tab strip that reads as a section header.
          Overrides every default class on shadcn's TabsList (which is a
          muted pill control) — `h-auto`, no `bg-*`, no padding, no
          rounding. The baseline `border-b border-primary/20` runs the
          full width of the panel below, and each trigger draws a
          thicker primary under-rule when active so the active tab
          "owns" the panel surface below it. `gap-8` gives each label
          room to breathe so they read as separate section headers
          rather than a packed control. */}
      <TabsList className="h-auto w-full justify-start gap-8 rounded-none border-b border-primary/20 bg-transparent p-0">
        <CampaignActivityTabTrigger value="comments">
          {t('campaignsDetail.tabComments')}
        </CampaignActivityTabTrigger>
        <CampaignActivityTabTrigger value="ledger">
          {t('campaignsDetail.tabLedger')}
        </CampaignActivityTabTrigger>
      </TabsList>

      {/* TabsContent's own `mt-4` puts a comfortable 16px gap between the
          tab strip's baseline and the rounded panel below — without it,
          the panel's rounded top corners visually overlap the under-rule. */}
      <TabsContent value="comments" className="mt-4">
        {commentsTab}
      </TabsContent>

      <TabsContent value="ledger" className="mt-4">
        <CampaignLedger address={onchainAddress} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Section-header-styled tab trigger. Overrides shadcn's default pill /
 * shadow active state (`data-[state=active]:bg-background data-[state=active]:shadow-sm`)
 * with an underline + colour shift, so the strip reads as a header instead
 * of a control. Sizing matches the page's other `<h2>` headings (`text-lg
 * font-semibold tracking-tight`) so the active tab label feels like the
 * canonical section title.
 */
function CampaignActivityTabTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="
        relative h-auto rounded-none border-0 bg-transparent px-1 py-2
        text-lg font-semibold tracking-tight text-muted-foreground
        shadow-none transition-colors
        hover:text-foreground/90
        focus-visible:ring-0 focus-visible:ring-offset-0
        data-[state=active]:bg-transparent data-[state=active]:text-foreground
        data-[state=active]:shadow-none
        after:absolute after:-bottom-px after:left-0 after:right-0 after:h-0.5
        after:rounded-full after:bg-transparent
        data-[state=active]:after:bg-primary
        motion-safe:after:transition-colors
      "
    >
      {children}
    </TabsTrigger>
  );
}

/**
 * Pill badge marking a comment authored by the campaign's creator.
 * Rendered inside `NoteCard`'s author row via `renderAuthorBadge`, so
 * the marker appears next to the campaigner's display name on every
 * comment they post — not just pinned ones.
 */
function CampaignerBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">
      <ShieldCheck className="size-3" />
      {t('campaignsDetail.campaigner')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero — full-bleed cover with title, creator, meta, and the
// back / admin controls all overlaid on the image. The banner is the
// page's emotional entry point: the photo carries the campaign's story
// at a glance, and the overlay text makes the pitch readable without
// taking the reader off the image.
// ─────────────────────────────────────────────────────────────────────

interface CampaignHeroProps {
  cover: string | undefined;
  isCreator: boolean;
  naddr: string;
  /** Addressable coordinate (`kind:pubkey:d`) used by the moderation menu. */
  coord: string;
  /** Campaign title used by the moderation menu for toast feedback. */
  entityTitle: string;
  deleteDisabled: boolean;
  onBack: () => void;
  onDelete: () => void;
  /** Click the cover image to open it in the fullscreen Lightbox. Pass
      `undefined` to disable (e.g. when there is no cover image). */
  onCoverClick: (() => void) | undefined;
}

function CampaignHero({
  cover,
  isCreator,
  naddr,
  coord,
  entityTitle,
  deleteDisabled,
  onBack,
  onDelete,
  onCoverClick,
}: CampaignHeroProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Black band ABOVE the banner. On mobile it hosts the back /
          admin toolbar so the chips sit on a plain dark surface
          instead of overlaying the banner image (and any baked-in
          text). On `sm:` upward the toolbar moves inside the header
          (chip overlay), but this band stays as a thin strip of
          black above the banner so the banner reads as a framed
          window into the image rather than a floating block on the
          page background. */}
      <div className="bg-black text-white">
        <div className="sm:hidden flex items-center justify-between gap-3 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-10 -ml-2 pl-2 pr-3.5 rounded-full text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
            aria-label={t('common.goBack')}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </button>

          <div className="flex items-center gap-1.5">
            <ModerationMenu
              coord={coord}
              entityTitle={entityTitle}
              surface="campaign"
              axes={['hide']}
              className="size-10 rounded-full text-white hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            />
            {isCreator && (
              <>
                <Button asChild size="sm" variant="ghost" className="h-10 rounded-full text-white hover:bg-white/10 hover:text-white">
                  <Link to={`/campaigns/new?edit=${encodeURIComponent(naddr)}`} aria-label={t('campaignsDetail.edit')}>
                    <Pencil className="size-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDelete}
                  disabled={deleteDisabled}
                  aria-label={t('campaignsDetail.delete')}
                  className="h-10 rounded-full text-white hover:bg-destructive/30 hover:text-white"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full-bleed banner that respects the source image. The section
          stretches edge to edge of the viewport and takes its height
          from the contained image (capped at 70vh so an extreme
          portrait banner can't eat the whole screen). The blurred,
          scaled backdrop fills that full width so the banner never
          reads as a floating box. The sharp `object-contain`
          foreground image is capped to the same `max-w-6xl` reading
          column and centered, so the actual banner pixels are never
          cropped — anything outside the image's natural frame is the
          soft blurred bleed. */}
      <header className="relative isolate w-full overflow-hidden bg-black shadow-lg shadow-black/25">
        {cover ? (
          <>
            {/* Blurred bleed: a scaled-up, soft copy of the same image
                fills the full-bleed gutters around the contained
                foreground. `scale-110` hides the soft edges left by
                `blur-2xl`. `brightness-75` keeps the bleed shadowy so
                the centered sharp image visually dominates.
                `aria-hidden` because the foreground image already
                conveys the content. */}
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover scale-110 blur-2xl brightness-75"
            />
            {/* Side vignette — soft horizontal shadow that darkens the
                left and right gutters specifically, so the bleed
                recedes and the contained image reads as the subject. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/55"
            />
            {/* Sharp foreground capped to the reading column and to
                70vh so it dictates the banner's height. `mx-auto`
                centers it horizontally; `object-contain` guarantees
                the source image is shown in its entirety, never
                cropped. Wrapped in a button so clicking the banner
                opens it fullscreen via the shared Lightbox.
                `cursor-zoom-in` signals the affordance. */}
            <button
              type="button"
              onClick={onCoverClick}
              aria-label={t('campaignsDetail.openCover')}
              className="relative block w-full max-w-6xl max-h-[70vh] mx-auto cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <img
                src={cover}
                alt=""
                className="block w-full max-h-[70vh] mx-auto object-contain"
              />
            </button>
          </>
        ) : (
          <div className="flex items-center justify-center aspect-[16/9] bg-gradient-to-br from-primary/30 via-primary/10 to-secondary">
            <HandHeart className="size-20 text-primary" />
          </div>
        )}

        {/* Desktop top controls (sm+) — back left, admin right.
            Absolutely positioned over the banner inside the same
            max-w-6xl column as the heading block below so the back
            button aligns with the title's left edge. Chip-style
            backdrops so they read on top of an arbitrary blurred
            bleed without an opaque pill. On mobile we use the plain
            toolbar above the banner instead so chips can't cover
            baked-in image text. */}
        <div className="hidden sm:block absolute inset-x-0 top-0 z-10 px-5 sm:px-6 lg:px-0 pt-[max(env(safe-area-inset-top),1rem)]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 h-10 pl-2 pr-3.5 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
              aria-label={t('common.goBack')}
            >
              <ChevronLeft className="size-5 rtl:rotate-180" />
              <span className="text-sm font-medium">{t('campaignsDetail.back')}</span>
            </button>

            {isCreator && (
              <div className="flex items-center gap-1.5">
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-black/45 focus-visible:ring-white/80"
                >
                  <Link to={`/campaigns/new?edit=${encodeURIComponent(naddr)}`}>
                    <Pencil className="size-4 mr-2" />
                    <span>{t('campaignsDetail.edit')}</span>
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onDelete}
                  disabled={deleteDisabled}
                  className="h-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-destructive/70 focus-visible:ring-white/80"
                >
                  <Trash2 className="size-4 mr-2" />
                  <span>{t('campaignsDetail.delete')}</span>
                </Button>
              </div>
            )}
            <ModerationMenu
              coord={coord}
              entityTitle={entityTitle}
              surface="campaign"
              axes={['hide']}
              className="size-10 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            />
          </div>
        </div>
      </header>
    </>
  );
}

interface CampaignHeadingProps {
  campaign: ParsedCampaign;
  creatorPubkey: string;
  countryLabel: string | undefined;
  onReply: () => void;
  onMore: () => void;
  translateAction: ReactNode;
}

function CampaignHeading({
  campaign,
  creatorPubkey,
  countryLabel,
  onReply,
  onMore,
  translateAction,
}: CampaignHeadingProps) {
  const { t } = useTranslation();

  return (
    // Title / summary / byline / meta / action bar sit in normal page
    // flow on `bg-background`, so they can grow to whatever length the
    // campaign needs without overflowing or being clipped. Same
    // max-w-6xl column the rest of the page uses, so the left edge of
    // the title aligns with the body content.
    <section className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 pt-6 sm:pt-8">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight max-w-4xl">
        {campaign.title}
      </h1>

      {campaign.summary && (
        <p className="mt-3 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl">
          {campaign.summary}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <AuthorByline pubkey={creatorPubkey} />
        <CampaignVerificationBadge
          coord={campaign.aTag}
          title={campaign.title}
          variant="inline"
        />
      </div>

      {(countryLabel) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
          {countryLabel && (
            <span className="inline-flex items-center gap-1.5">
              {countryLabel}
            </span>
          )}
        </div>
      )}

      {/* Action bar (comment / repost / react / share / more) sits
          directly under the heading on the page surface — default
          PostActionBar styling against `bg-background`. */}
      <div className="mt-4 pt-3 border-t border-border/60">
        <PostActionBar
          event={campaign.event}
          replyLabel={t('campaignsDetail.commentLabel')}
          hideZap
          showShareInSidebar
          onReply={onReply}
          onMore={onMore}
          translateAction={translateAction}
        />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Story
// ─────────────────────────────────────────────────────────────────────

function CampaignStory({
  storyEvent,
}: {
  storyEvent: NostrEvent;
}) {
  const { t } = useTranslation();
  return (
    <DetailStory
      event={storyEvent}
      hasContent
      heading={t('campaignsDetail.storyHeading')}
      headingId="campaign-story-heading"
      emptyText=""
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Donate column
// ─────────────────────────────────────────────────────────────────────

interface DonateColumnProps {
  campaign: ParsedCampaign;
  raisedSats: number;
  /**
   * Unconfirmed mempool delta in sats. Positive = inbound pending, negative
   * = beneficiary spending. Displayed as a pending badge under the raised
   * total when non-zero.
   */
  pendingSats: number;
  statsLoading: boolean;
  btcPrice: number | undefined;
  /** Aggregated kind 8333 donation events, newest first. */
  donations: NostrEvent[];
  onShare: () => void;
}

function DonateColumn({
  campaign,
  raisedSats,
  pendingSats,
  statsLoading,
  btcPrice,
  donations,
  onShare,
}: DonateColumnProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const hdAccess = useHdWalletAccess();
  const [sendOpen, setSendOpen] = useState(false);
  const [noBitcoinOpen, setNoBitcoinOpen] = useState(false);
  const isSilentPayment = !campaign.wallets.onchain;

  // The in-app "Pay with Agora" button opens HDSendBitcoinDialog
  // pre-filled with the campaign's on-chain address. The donor enters a
  // USD amount and signs with their nsec-derived HD wallet — same flow
  // they'd use from /wallet to send Bitcoin to anywhere else.
  //
  // Hide the button when:
  //   - the donor is the campaign owner (paying yourself is a foot-gun).
  //   - the campaign is silent-payment-only (no on-chain address to
  //     prefill; SP donations require a BIP-352-aware wallet that derives
  //     a fresh one-time output, which the in-app Taproot signer doesn't
  //     do).
  //   - the HD wallet isn't available for this login (extension/bunker
  //     logins don't expose the secret key, so we can't derive child
  //     keys — see useHdWalletAccess).
  const canPayInApp =
    !!user &&
    !isSilentPayment &&
    user.pubkey !== campaign.pubkey &&
    hdAccess.status === 'available';

  return (
    // On mobile we drop the surface chrome (no rounded background) so
    // the donate content flows inline with the page instead of being a
    // floating box stacked between the hero and the story. On lg+ the
    // sticky right sidebar uses `bg-card` with a brand-orange border
    // on all four sides — same color family as the composer's
    // top-and-sides border in the comments region, so both columns of
    // the body read as siblings sharing one focal treatment.
    <Card className="overflow-hidden border-0 shadow-none bg-transparent lg:bg-[hsl(24_100%_99%)] dark:lg:bg-[hsl(24_30%_12%)] lg:border lg:border-primary/40">
      <CardContent className="p-0 lg:p-5 space-y-5">
        {/* Raised stats + progress. Silent-payment campaigns hide all
            aggregate numbers by design (per NIP.md Kind 33863) — only
            the goal target (if any) is shown. */}
        {isSilentPayment ? (
          campaign.goalUsd && campaign.goalUsd > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('campaignsDetail.target', { amount: formatUsdGoal(campaign.goalUsd) })}
            </div>
          ) : null
        ) : statsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                {formatSatsFull(raisedSats, btcPrice)}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  {t('campaignsDetail.raised')}
                </span>
              </div>
              {campaign.goalUsd ? (
                <div className="text-xs text-muted-foreground">
                  {t('campaignsDetail.ofGoal', { amount: formatUsdGoal(campaign.goalUsd) })}
                  {donations.length > 0 && (
                    <>
                      {' · '}
                      {t('campaignsDetail.donationCount', { count: donations.length })}
                    </>
                  )}
                </div>
              ) : donations.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('campaignsDetail.donationCount', { count: donations.length })}
                </div>
              ) : null}
              {pendingSats !== 0 && (
                <PendingBadge
                  amountLabel={formatSatsFull(Math.abs(pendingSats), btcPrice)}
                  className="flex"
                />
              )}
            </div>
            {campaign.goalUsd && raisedUsd(raisedSats, btcPrice) !== undefined && (
              <Progress
                value={Math.min(
                  100,
                  Math.round((raisedUsd(raisedSats, btcPrice)! / campaign.goalUsd) * 100),
                )}
                // `bg-foreground/15` overrides the primitive's default
                // `bg-secondary` track for legibility against the card
                // surface — matches the treatment in CampaignCard.
                className="h-2 bg-foreground/15"
              />
            )}
          </div>
        )}

        {/* Primary actions */}
        {
          // Donors can either pay from their in-app Agora wallet (HD
          // send dialog prefilled with the campaign address) or scan the
          // QR from any external wallet. Both routes terminate at the
          // same `w`-tag address on-chain. The in-app pay button is
          // injected into the donate panel so it sits directly above
          // "Open external wallet" — only one primary CTA stacked.
          <div className="space-y-3">
            <CampaignWalletDonatePanel
              wallets={campaign.wallets}
              primaryAction={
                canPayInApp ? (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => setSendOpen(true)}
                  >
                    <Wallet className="size-5 mr-2" />
                    {t('campaignsDetail.payWithAgoraWallet')}
                  </Button>
                ) : null
              }
            />
            <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
              <Share2 className="size-4 mr-2" />
              {t('campaignsDetail.share')}
            </Button>
          </div>
        }

        {/* For donors who don't already hold Bitcoin: a low-emphasis text
            link (no button chrome) that opens an instructional dialog
            pointing at a mainstream on-ramp. Kept visually quiet so it
            never competes with the primary on-chain CTA above. */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setNoBitcoinOpen(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm transition-colors"
          >
            {t('noBitcoin.trigger')}
          </button>
        </div>
      </CardContent>
      {canPayInApp && campaign.wallets.onchain && (
        <HDSendBitcoinDialog
          isOpen={sendOpen}
          onClose={() => setSendOpen(false)}
          walletScope="public"
          btcPrice={btcPrice}
          /* When the campaign exposes both an on-chain address and a
             silent-payment code, prefill with a combined `bitcoin:`
             BIP-21 URI so the picker's dropdown surfaces both rows and
             the donor explicitly picks privacy vs. compatibility.
             Otherwise prefill with the single address; the picker
             accepts bare `bc1…` / `sp1…` inputs directly. */
          initialRecipient={
            campaign.wallets.sp?.value
              ? `bitcoin:${campaign.wallets.onchain.value}?sp=${campaign.wallets.sp.value}`
              : campaign.wallets.onchain.value
          }
        />
      )}
      <NoBitcoinDialog open={noBitcoinOpen} onOpenChange={setNoBitcoinOpen} />
    </Card>
  );
}

/** Convert sats to USD via the live BTC price; undefined when price unknown. */
function raisedUsd(sats: number, btcPrice: number | undefined): number | undefined {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return undefined;
  return (sats / 100_000_000) * btcPrice;
}

// ─────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────

function CampaignDetailSkeleton() {
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
