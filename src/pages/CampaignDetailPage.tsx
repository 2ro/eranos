import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  CalendarClock,
  ChevronLeft,
  HandHeart,
  MapPin,
  Pencil,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { ArticleContent } from '@/components/ArticleContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CampaignModerationMenu } from '@/components/CampaignModerationMenu';
import {
  CampaignWalletDonatePanel,
} from '@/components/CampaignWalletDonatePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { DonateDialog } from '@/components/DonateDialog';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { PostActionBar } from '@/components/PostActionBar';
import { PinnedCommentHeader } from '@/components/PinnedCommentHeader';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { Progress } from '@/components/ui/progress';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useEventStats } from '@/hooks/useTrending';
import { usePinnedEventComments } from '@/hooks/usePinnedEventComments';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import {
  encodeCampaignNaddr,
  getCampaignCountryLabel,
  type ParsedCampaign,
} from '@/lib/campaign';
import { satsToUSDWhole } from '@/lib/bitcoin';
import { formatUsdGoal } from '@/lib/formatCampaignAmount';
import { formatNumber } from '@/lib/formatNumber';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { timeAgo } from '@/lib/timeAgo';
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
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { data: campaign, isLoading, isError } = useCampaign({ pubkey, identifier, relays });

  if (isLoading) return <CampaignDetailSkeleton />;
  if (isError || !campaign) return <NotFound />;

  return <CampaignDetailContent campaign={campaign} />;
}

function CampaignDetailContent({ campaign }: { campaign: ParsedCampaign }) {
  const { user } = useCurrentUser();
  const { btcPrice } = useBitcoinWallet();
  const author = useAuthor(campaign.pubkey);
  const { data: stats, isLoading: statsLoading } = useCampaignDonations(campaign);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [donateOpen, setDonateOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

  const cover = sanitizeUrl(campaign.banner);
  const creatorMetadata = author.data?.metadata;
  const creatorName =
    creatorMetadata?.display_name || creatorMetadata?.name || genUserName(campaign.pubkey);
  const creatorProfileUrl = useProfileUrl(campaign.pubkey, creatorMetadata);

  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const countryLabel = getCampaignCountryLabel(campaign);
  const raisedSats = stats?.totalSats ?? 0;

  const isCreator = user?.pubkey === campaign.pubkey;
  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const storyEvent = useMemo(
    () => ({
      ...campaign.event,
      tags: campaign.event.tags.filter(([name]) => !['banner', 'imeta', 'summary', 'title', 'w'].includes(name)),
    }),
    [campaign.event],
  );

  useSeoMeta({
    title: `${campaign.title} | Agora Fundraisers`,
    description: campaign.summary || `Support ${campaign.title} on Agora.`,
    ogImage: cover,
  });

  const handleShare = async () => {
    const url = `${window.location.origin}/${naddr}`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ title: campaign.title, text: campaign.summary, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        toast({ title: 'Link copied to clipboard' });
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
            title: 'Campaign deleted',
            description:
              'A deletion request was published. Well-behaved relays will drop the campaign from feeds.',
          });
          setDeleteConfirmOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['campaign', campaign.pubkey, campaign.identifier] });
          void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          navigate('/');
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          toast({
            title: 'Could not delete campaign',
            description: msg,
            variant: 'destructive',
          });
        },
      },
    );
  };

  /** Smooth-scroll the comments+donations list (which already includes
   *  every donation receipt as a top-level node) into view. Used by the
   *  donate column's "See all" affordance. */
  const scrollToActivity = () => {
    const el = document.getElementById('campaign-activity');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      statsLoading={statsLoading}
      btcPrice={btcPrice}
      donations={donationReceipts}
      deadline={deadline}
      onDonateClick={() => setDonateOpen(true)}
      onShare={handleShare}
      onSeeAll={scrollToActivity}
    />
  );

  return (
    <main className="min-h-screen pb-16">
      {/* Full-bleed cover hero. Title, creator, meta, summary, and the
          back/admin buttons all live ON the image — the banner is the
          page's emotional entry point. */}
      <CampaignHero
        campaign={campaign}
        cover={cover}
        creatorName={creatorName}
        creatorProfileUrl={creatorProfileUrl}
        creatorPicture={sanitizeUrl(creatorMetadata?.picture)}
        deadline={deadline}
        countryLabel={countryLabel}
        isCreator={isCreator}
        naddr={naddr}
        deleteDisabled={deleteMutation.isPending}
        onBack={() => navigate(-1)}
        onDelete={() => setDeleteConfirmOpen(true)}
        onReply={() => setReplyOpen(true)}
        onMore={() => setMoreMenuOpen(true)}
      />

      {pinnedNodes.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
          <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
            <ThreadedReplyList
              roots={pinnedNodes}
              renderItemHeader={(event) => (
                <CampaignPinHeader
                  isCampaignAuthor={event.pubkey === campaign.pubkey}
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
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Mobile-only inline donate card */}
          <div className="lg:hidden mb-6">{donateColumn}</div>

          {/* Main article column */}
          <div className="flex-1 min-w-0 space-y-8">
            <CampaignStory
              storyEvent={storyEvent}
              hasContent={campaign.story.trim().length > 0}
            />

            {/* Engagement counters above the comments. The action bar
                itself lives in the hero overlay; these counters stay
                inline so users can tap a count to see who reposted /
                quoted / liked the campaign via InteractionsModal. */}
            <div id="campaign-activity" className="scroll-mt-20">
              {hasStats && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground pb-2 border-t border-border/60 pt-4">
                  {engagementStats?.reposts ? (
                    <button
                      onClick={() => openInteractions('reposts')}
                      className="hover:underline transition-colors"
                    >
                      <span className="font-bold text-foreground">
                        {formatNumber(engagementStats.reposts)}
                      </span>{' '}
                      Repost{engagementStats.reposts !== 1 ? 's' : ''}
                    </button>
                  ) : null}
                  {engagementStats?.quotes ? (
                    <button
                      onClick={() => openInteractions('quotes')}
                      className="hover:underline transition-colors"
                    >
                      <span className="font-bold text-foreground">
                        {formatNumber(engagementStats.quotes)}
                      </span>{' '}
                      Quote{engagementStats.quotes !== 1 ? 's' : ''}
                    </button>
                  ) : null}
                  {engagementStats?.reactions ? (
                    <button
                      onClick={() => openInteractions('reactions')}
                      className="hover:underline transition-colors"
                    >
                      <span className="font-bold text-foreground">
                        {formatNumber(engagementStats.reactions)}
                      </span>{' '}
                      Like{engagementStats.reactions !== 1 ? 's' : ''}
                    </button>
                  ) : null}
                </div>
              )}

              <div className="mt-6">
                <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Comments &amp; donations
                  </h2>
                  {engagementStats?.replies ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatNumber(engagementStats.replies)}{' '}
                      {engagementStats.replies === 1 ? 'comment' : 'comments'}
                    </span>
                  ) : null}
                </div>

                <DetailCommentComposer
                  event={campaign.event}
                  className="mb-3"
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] })}
                />

                {commentsLoading && statsLoading && replyTree.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <CampaignReplySkeleton key={i} />
                    ))}
                  </div>
                ) : replyTree.length > 0 ? (
                  <ThreadedReplyList
                    roots={replyTree}
                    renderItemHeader={(event) => (
                      <CampaignPinHeader
                        isCampaignAuthor={event.pubkey === campaign.pubkey}
                        canManagePins={canManagePins}
                        isPinned={isPinned(event.id)}
                        pinPending={togglePin.isPending}
                        onTogglePin={() => handleTogglePin(event)}
                      />
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyOpen(true)}
                    className="block w-full rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center hover:bg-card hover:border-primary/40 transition-colors"
                  >
                    <p className="text-base font-medium text-foreground">
                      No comments yet
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Be the first to leave a message of support.
                    </p>
                  </button>
                )}
              </div>
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
            <div className="lg:sticky lg:top-4">{donateColumn}</div>
          </aside>
        </div>
      </div>

      <DonateDialog
        campaign={campaign}
        open={donateOpen}
        onOpenChange={(open) => {
          setDonateOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ['campaign-donations', campaign.aTag] });
          }
        }}
        btcPrice={btcPrice}
      />

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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request. Well-behaved relays
              will drop the campaign from feeds and direct links. Past
              donation receipts stay on-chain regardless. This action cannot
              be undone — to keep accepting donations, edit the campaign
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCampaign();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
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
        toast({ title: wasPinned ? 'Unpinned from campaign' : 'Pinned to campaign' });
      },
      onError: () => {
        toast({ title: 'Failed to update campaign pins', variant: 'destructive' });
      },
    });
  }
}

function CampaignPinHeader({
  isCampaignAuthor,
  canManagePins,
  isPinned,
  pinPending,
  onTogglePin,
}: {
  isCampaignAuthor: boolean;
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
    >
      {isCampaignAuthor && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <ShieldCheck className="size-3" />
          Campaigner
        </span>
      )}
    </PinnedCommentHeader>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero — full-bleed cover with title, creator, meta, summary, and the
// back / admin controls all overlaid on the image. The banner is the
// page's emotional entry point: the photo carries the campaign's story
// at a glance, and the overlay text makes the pitch readable without
// taking the reader off the image.
// ─────────────────────────────────────────────────────────────────────

interface CampaignHeroProps {
  campaign: ParsedCampaign;
  cover: string | undefined;
  creatorName: string;
  creatorProfileUrl: string;
  creatorPicture: string | undefined;
  deadline: { label: string; isPast: boolean } | null;
  countryLabel: string | undefined;
  isCreator: boolean;
  naddr: string;
  deleteDisabled: boolean;
  onBack: () => void;
  onDelete: () => void;
  onReply: () => void;
  onMore: () => void;
}

function CampaignHero({
  campaign,
  cover,
  creatorName,
  creatorProfileUrl,
  creatorPicture,
  deadline,
  countryLabel,
  isCreator,
  naddr,
  deleteDisabled,
  onBack,
  onDelete,
  onReply,
  onMore,
}: CampaignHeroProps) {
  const initials = creatorName.slice(0, 2).toUpperCase();

  // Per-campaign moderation rollup. Cheap cache read — every other surface
  // that renders moderation state shares the same query under the hood.
  // `CampaignModerationMenu` self-gates on Team Soapbox membership and
  // returns `null` for non-moderators, so non-mod viewers see nothing in
  // the slot.
  const { data: moderation } = useCampaignModeration();
  const isApproved = moderation.approvedCoords.has(campaign.aTag);
  const isHidden = moderation.hiddenCoords.has(campaign.aTag);
  const isFeatured = moderation.featuredCoords.has(campaign.aTag);

  return (
    // True full-bleed: no max-width wrapper, no horizontal padding, no
    // rounded corners — the image touches every edge on every
    // breakpoint. Height is generous on mobile so the banner fills the
    // viewport for an immersive first impression instead of being a
    // strip; on larger screens we cap it so the page content below
    // stays visible.
    <header className="relative isolate w-full overflow-hidden bg-gradient-to-br from-primary/40 via-primary/20 to-secondary min-h-[92svh] sm:min-h-0 sm:aspect-[21/9] lg:aspect-[3/1]">
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <HandHeart className="size-20 text-primary/40" />
        </div>
      )}

      {/* Tall, deep bottom gradient covering ~80% of the hero so the
          overlay text sits on a near-opaque base no matter how busy
          the photo is. Image stays vibrant only in the very top of
          the banner. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-[20%] bg-gradient-to-t from-black/95 via-black/80 to-transparent"
      />
      {/* Subtle top scrim purely to keep the back/admin buttons
          legible against bright skies, beaches, etc. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent"
      />

      {/* Top controls — back left, admin right. Contained to the
          same max-w-6xl column as the overlay text below so the back
          button aligns with the title's left edge. Chip-style
          backdrops so they read on any image without an opaque pill. */}
      <div className="absolute inset-x-0 top-0 z-10 px-5 sm:px-6 lg:px-0 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-10 pl-2 pr-3.5 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="size-5" />
            <span className="text-sm font-medium hidden sm:inline">Back</span>
          </button>

          {/* Right-side controls. Two independent groups stack here:
              creator actions (Edit/Delete) and a moderator kebab. The
              moderation menu self-gates on Team Soapbox membership and
              returns null for non-moderators, so non-mod creators just
              see Edit/Delete and non-creators see only the kebab. */}
          <div className="flex items-center gap-1.5">
            {isCreator && (
              <>
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-black/45 focus-visible:ring-white/80"
                >
                  <Link to={`/campaigns/new?edit=${encodeURIComponent(naddr)}`}>
                    <Pencil className="size-4 sm:mr-2" />
                    <span className="hidden sm:inline">Edit</span>
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onDelete}
                  disabled={deleteDisabled}
                  className="h-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-destructive/70 focus-visible:ring-white/80"
                >
                  <Trash2 className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </>
            )}
            <CampaignModerationMenu
              coord={campaign.aTag}
              campaignTitle={campaign.title}
              isApproved={isApproved}
              isHidden={isHidden}
              isFeatured={isFeatured}
              className="h-10 w-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-black/45 focus-visible:ring-white/80"
            />
          </div>
        </div>
      </div>

      {/* Overlay content — sits at the bottom of the image, contained
          to the 6xl column on desktop so it lines up with the body
          content below. Generous bottom padding (incl. safe-area)
          keeps the title comfortably above the home-indicator on
          notched phones. Drop-shadow on text gives extra contrast on
          busy photos without darkening the gradient further. */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-5 sm:px-6 lg:px-0 pb-[max(env(safe-area-inset-bottom),1.75rem)] pt-16 sm:pt-20">
        <div className="max-w-6xl mx-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
          {campaign.wallet.mode === 'sp' && (
            <Badge
              variant="secondary"
              className="mb-4 bg-background/85 text-foreground border-border/40 backdrop-blur [text-shadow:none]"
            >
              <ShieldCheck className="size-3.5 mr-1.5" />
              Private campaign
            </Badge>
          )}

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white max-w-4xl">
            {campaign.title}
          </h1>

          {campaign.summary && (
            <p className="mt-4 text-base sm:text-lg lg:text-xl leading-relaxed text-white/90 max-w-2xl line-clamp-4 sm:line-clamp-none">
              {campaign.summary}
            </p>
          )}

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
              by{' '}
              <span className="font-semibold underline-offset-4 group-hover:underline">
                {creatorName}
              </span>
            </span>
          </Link>

          {(countryLabel || deadline) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm font-medium text-white/85">
              {countryLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {countryLabel}
                </span>
              )}
              {deadline && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" />
                  {deadline.label}
                </span>
              )}
            </div>
          )}

          {/* Action bar (comment / repost / react / share / more) sits
              flush with the hero text — donations + comments + sharing
              are all reachable from the banner without a separate bar
              floating below. Styled as glass chips so the buttons read
              on the dark gradient. */}
          <div className="mt-4 pt-3 border-t border-white/15 [&_button]:!text-white/90 [&_button:hover]:!text-white [&_button:hover]:!bg-white/15 [&_button]:transition-colors [text-shadow:none]">
            <PostActionBar
              event={campaign.event}
              replyLabel="Comment"
              hideZap
              onReply={onReply}
              onMore={onMore}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Story
// ─────────────────────────────────────────────────────────────────────

function CampaignStory({
  storyEvent,
  hasContent,
}: {
  storyEvent: NostrEvent;
  hasContent: boolean;
  // expanded/onToggle retained on the call site for backwards-compat
  // but no longer used — the story shows in full. A fundraiser pitch
  // is the entire point of the page; hiding most of it behind a
  // fade-out gradient buries the message.
  expanded?: boolean;
  onToggle?: () => void;
}) {
  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-10 text-center">
        <p className="text-muted-foreground italic">
          The organizer hasn't written a story for this campaign yet.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="campaign-story-heading" className="space-y-3">
      <h2
        id="campaign-story-heading"
        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      >
        The story
      </h2>
      <article className="prose prose-neutral dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:text-foreground/90 prose-headings:tracking-tight prose-img:rounded-xl">
        <ArticleContent event={storyEvent} />
      </article>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Donate column
// ─────────────────────────────────────────────────────────────────────

interface DonateColumnProps {
  campaign: ParsedCampaign;
  raisedSats: number;
  statsLoading: boolean;
  btcPrice: number | undefined;
  /** Aggregated kind 8333 donation events, newest first. */
  donations: NostrEvent[];
  deadline: { label: string; isPast: boolean } | null;
  onDonateClick: () => void;
  onShare: () => void;
  /** Scroll the inline activity list into view (donations + comments). */
  onSeeAll: () => void;
}

function DonateColumn({
  campaign,
  raisedSats,
  statsLoading,
  btcPrice,
  donations,
  deadline,
  onDonateClick,
  onShare,
  onSeeAll,
}: DonateColumnProps) {
  const ended = !!deadline?.isPast;
  const endedLabel = ended ? 'Campaign ended' : null;
  const isSilentPayment = campaign.wallet.mode === 'sp';

  return (
    // On mobile we drop the Card chrome (no border, no shadow, no
    // rounded background) so the donate content flows inline with the
    // page instead of being a floating box stacked between the hero
    // and the story. On lg+ the sticky right sidebar reinstates the
    // card framing so the column reads as a proper aside.
    <Card className="overflow-hidden border-0 shadow-none bg-transparent lg:border lg:shadow-sm lg:bg-card">
      <CardContent className="p-0 lg:p-5 space-y-5">
        {/* Raised stats + progress. Silent-payment campaigns hide all
            aggregate numbers by design (per NIP.md Kind 33863). */}
        {isSilentPayment ? (
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Private campaign — totals not public
            </div>
            {campaign.goalUsd && campaign.goalUsd > 0 && (
              <div className="text-xs text-muted-foreground">
                Target: {formatUsdGoal(campaign.goalUsd)}
              </div>
            )}
          </div>
        ) : statsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                {formatSatsFull(raisedSats, btcPrice)}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  raised
                </span>
              </div>
              {campaign.goalUsd ? (
                <div className="text-xs text-muted-foreground">
                  of {formatUsdGoal(campaign.goalUsd)} goal
                  {donations.length > 0 && (
                    <>
                      {' · '}
                      {formatNumber(donations.length)}{' '}
                      {donations.length === 1 ? 'donation' : 'donations'}
                    </>
                  )}
                </div>
              ) : donations.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {formatNumber(donations.length)}{' '}
                  {donations.length === 1 ? 'donation' : 'donations'}
                </div>
              ) : null}
            </div>
            {campaign.goalUsd && raisedUsd(raisedSats, btcPrice) !== undefined && (
              <Progress
                value={Math.min(
                  100,
                  Math.round((raisedUsd(raisedSats, btcPrice)! / campaign.goalUsd) * 100),
                )}
                className="h-2"
              />
            )}
          </div>
        )}

        {/* Primary actions */}
        {ended ? (
          <div className="space-y-2">
            <Button size="lg" className="w-full" disabled>
              <HandHeart className="size-5 mr-2" />
              {endedLabel ?? 'Donate'}
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
              <Share2 className="size-4 mr-2" />
              Share
            </Button>
          </div>
        ) : isSilentPayment ? (
          // SP mode: external wallet only. The in-app PSBT signer doesn't
          // support BIP-352, so we point the donor at the QR/code panel.
          <div className="space-y-3">
            <CampaignWalletDonatePanel wallet={campaign.wallet} />
            <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
              <Share2 className="size-4 mr-2" />
              Share
            </Button>
          </div>
        ) : (
          // On-chain mode: in-app PSBT donate button + external wallet panel.
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full text-white"
              onClick={onDonateClick}
            >
              <HandHeart className="size-5 mr-2" />
              Donate
            </Button>
            <CampaignWalletDonatePanel wallet={campaign.wallet} />
            <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
              <Share2 className="size-4 mr-2" />
              Share
            </Button>
          </div>
        )}

        {/* Latest donors preview (on-chain only; SP campaigns hide all
            donor signals by design). */}
        {!isSilentPayment && donations.length > 0 && (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent donations
            </div>
            <DonorPreviewList donations={donations} btcPrice={btcPrice} />
            <button
              type="button"
              onClick={onSeeAll}
              className="w-full text-sm font-medium text-primary hover:underline motion-safe:transition-colors text-center pt-1"
            >
              See all {donations.length}{' '}
              {donations.length === 1 ? 'donation' : 'donations'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Convert sats to USD via the live BTC price; undefined when price unknown. */
function raisedUsd(sats: number, btcPrice: number | undefined): number | undefined {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return undefined;
  return (sats / 100_000_000) * btcPrice;
}

/** Compact donor list: monogram, amount, relative time. Shows up to the
 *  first 5 entries; the parent surfaces the rest via "See all". */
function DonorPreviewList({
  donations,
  btcPrice,
}: {
  donations: NostrEvent[];
  btcPrice: number | undefined;
}) {
  const preview = donations.slice(0, 5);
  return (
    <ul className="space-y-2">
      {preview.map((ev) => {
        const amountTag = ev.tags.find(([n]) => n === 'amount')?.[1];
        const sats = amountTag ? Number(amountTag) : 0;
        return (
          <li key={ev.id} className="flex items-center gap-3 text-sm">
            <div className="size-8 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <HandHeart className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">
                {formatSatsFull(sats, btcPrice)}
              </div>
              <div className="text-xs text-muted-foreground">
                {timeAgo(ev.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────

function CampaignReplySkeleton() {
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
