import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  CalendarClock,
  Tag,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  HandHeart,
  MapPin,
  Pencil,
  Pin,
  Share2,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { ArticleContent } from '@/components/ArticleContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  BeneficiaryDonateDialog,
  BeneficiaryDonatePanel,
} from '@/components/BeneficiaryDonateDialog';
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
import { PostActionBar } from '@/components/PostActionBar';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { Progress } from '@/components/ui/progress';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useArchiveCampaign } from '@/hooks/useArchiveCampaign';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useCampaignPinnedEvents } from '@/hooks/useCampaignPinnedEvents';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import {
  encodeCampaignNaddr,
  getCampaignCountryLabel,
  getCampaignPrimaryTagLabel,
  type ParsedCampaign,
} from '@/lib/campaign';
import { satsToUSDWhole } from '@/lib/bitcoin';
import { formatNumber } from '@/lib/formatNumber';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
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

function removePinnedReplyNodes(nodes: ReplyNode[], pinnedIds: Set<string>): ReplyNode[] {
  return nodes.flatMap((node): ReplyNode[] => {
    if (pinnedIds.has(node.event.id)) return [];
    return [{
      ...node,
      children: removePinnedReplyNodes(node.children, pinnedIds),
      hiddenChildren: node.hiddenChildren
        ? removePinnedReplyNodes(node.hiddenChildren, pinnedIds)
        : undefined,
    }];
  });
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
  const { data: stats, isLoading: statsLoading } = useCampaignDonations(campaign.aTag);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [donateOpen, setDonateOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const archiveMutation = useArchiveCampaign();

  const { data: engagementStats } = useEventStats(campaign.event.id, campaign.event);

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
  } = useCampaignPinnedEvents(campaign.aTag, campaign.pubkey);

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

  const pinnedIdSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const feedEventsById = useMemo(() => collectReplyEvents(replyTree), [replyTree]);

  const activityTree = useMemo((): ReplyNode[] => {
    const pinnedEventNodes = pinnedIds
      .map((id) => feedEventsById.get(id) ?? pinnedEvents.find((event) => event.id === id))
      .filter((event): event is NostrEvent => !!event)
      .map((event): ReplyNode => ({ event, children: [] }));

    return [
      ...pinnedEventNodes,
      ...removePinnedReplyNodes(replyTree, pinnedIdSet),
    ];
  }, [feedEventsById, pinnedEvents, pinnedIdSet, pinnedIds, replyTree]);

  const cover = sanitizeUrl(campaign.image);
  const creatorMetadata = author.data?.metadata;
  const creatorName =
    creatorMetadata?.display_name || creatorMetadata?.name || genUserName(campaign.pubkey);
  const creatorProfileUrl = useProfileUrl(campaign.pubkey, creatorMetadata);

  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const countryLabel = getCampaignCountryLabel(campaign);
  const tagLabel = getCampaignPrimaryTagLabel(campaign);
  const raisedSats = stats?.totalSats ?? 0;

  // The donate column has two visual variants: single-beneficiary
  // campaigns inline the recipient's BIP-21 QR + address + "Open in
  // wallet" (no in-app PSBT flow needed for a single recipient), and
  // multi-beneficiary campaigns show the "Donate" button that opens
  // DonateDialog plus a per-recipient list with their own donate
  // buttons. The rest of the column (raised stats, share, donor list)
  // is shared between both.
  const singleBeneficiary =
    campaign.recipients.length === 1 ? campaign.recipients[0] : null;

  const isCreator = user?.pubkey === campaign.pubkey;
  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const storyEvent = useMemo(
    () => ({
      ...campaign.event,
      tags: campaign.event.tags.filter(([name]) => !['image', 'summary', 'title', 't'].includes(name)),
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

  const handleToggleArchive = () => {
    archiveMutation.mutate(
      { campaign, archived: !campaign.archived },
      {
        onSuccess: (updated) => {
          toast({
            title: updated.archived ? 'Campaign archived' : 'Campaign reopened',
            description: updated.archived
              ? 'Hidden from the main fundraisers feed. Donors with the link can still view it.'
              : 'Visible in the main fundraisers feed again.',
          });
          setArchiveConfirmOpen(false);
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          toast({
            title: campaign.archived ? 'Could not reopen campaign' : 'Could not archive campaign',
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
      singleBeneficiary={singleBeneficiary}
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
      {/* Cover hero stretches edge-to-edge on every breakpoint. */}
      <CampaignHero
        campaign={campaign}
        cover={cover}
        creatorName={creatorName}
        creatorProfileUrl={creatorProfileUrl}
        deadline={deadline}
        countryLabel={countryLabel}
        tagLabel={tagLabel}
        isCreator={isCreator}
        naddr={naddr}
        archiveDisabled={archiveMutation.isPending}
        onBack={() => navigate(-1)}
        onArchive={() => setArchiveConfirmOpen(true)}
        onReopen={handleToggleArchive}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-b-xl rounded-t-none bg-card border border-t-0 border-border/60 shadow-sm px-4 sm:px-5 py-3">
          <PostActionBar
            event={campaign.event}
            replyLabel="Comment"
            hideZap
            onReply={() => setReplyOpen(true)}
            onMore={() => setMoreMenuOpen(true)}
          />
        </div>
      </div>

      {/* Two-column body. On mobile the right column collapses inline
          immediately below the hero so the donate CTA stays above the
          fold. On lg+ the right column sticks to the viewport edge of
          the main content while the article scrolls. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Mobile-only inline donate card */}
          <div className="lg:hidden mb-6">{donateColumn}</div>

          {/* Main article column */}
          <div className="flex-1 min-w-0 space-y-8">
            <CampaignStory
              storyEvent={storyEvent}
              hasContent={campaign.story.trim().length > 0}
              expanded={storyExpanded}
              onToggle={() => setStoryExpanded((v) => !v)}
            />

            {/* Activity: threaded replies + donation receipts interleaved. */}
            <div id="campaign-activity" className="scroll-mt-20">
              <div>
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
                ) : activityTree.length > 0 ? (
                  <div className="-mx-2 sm:-mx-4 rounded-2xl bg-card border border-border/60 overflow-hidden">
                    <ThreadedReplyList
                      roots={activityTree}
                      renderItemHeader={(event) => (
                        <CampaignActivityItemHeader
                          event={event}
                          isCampaignAuthor={event.pubkey === campaign.pubkey}
                          canManagePins={canManagePins}
                          isPinned={isPinned(event.id)}
                          pinPending={togglePin.isPending}
                          onTogglePin={() => {
                            const wasPinned = isPinned(event.id);
                            togglePin.mutate(event.id, {
                              onSuccess: () => {
                                toast({ title: wasPinned ? 'Unpinned from campaign' : 'Pinned to campaign' });
                              },
                              onError: () => {
                                toast({ title: 'Failed to update campaign pins', variant: 'destructive' });
                              },
                            });
                          }}
                        />
                      )}
                    />
                  </div>
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

      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              The campaign will be hidden from the main fundraisers feed and no
              new donations can be made. Anyone with the link can still view it,
              and past donations stay attached. You can reopen it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleToggleArchive();
              }}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function CampaignActivityItemHeader({
  event,
  isCampaignAuthor,
  canManagePins,
  isPinned,
  pinPending,
  onTogglePin,
}: {
  event: NostrEvent;
  isCampaignAuthor: boolean;
  canManagePins: boolean;
  isPinned: boolean;
  pinPending: boolean;
  onTogglePin: () => void;
}) {
  if (!isCampaignAuthor && !canManagePins && !isPinned) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-0 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {isPinned && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            <Pin className="size-3 rotate-45 fill-current" />
            Pinned
          </span>
        )}
        {isCampaignAuthor && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            <ShieldCheck className="size-3" />
            Campaigner
          </span>
        )}
      </div>
      {canManagePins && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          disabled={pinPending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60',
            isPinned && 'text-primary',
          )}
          aria-label={`${isPinned ? 'Unpin' : 'Pin'} campaign activity from ${event.id}`}
        >
          <Pin className={cn('size-3 rotate-45', isPinned && 'fill-current')} />
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────

interface CampaignHeroProps {
  campaign: ParsedCampaign;
  cover: string | undefined;
  creatorName: string;
  creatorProfileUrl: string;
  deadline: { label: string; isPast: boolean } | null;
  countryLabel: string | undefined;
  tagLabel: string | undefined;
  isCreator: boolean;
  naddr: string;
  archiveDisabled: boolean;
  onBack: () => void;
  onArchive: () => void;
  onReopen: () => void;
}

function CampaignHero({
  campaign,
  cover,
  creatorName,
  creatorProfileUrl,
  deadline,
  countryLabel,
  tagLabel,
  isCreator,
  naddr,
  archiveDisabled,
  onBack,
  onArchive,
  onReopen,
}: CampaignHeroProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
      <div className="relative aspect-[16/9] sm:aspect-[21/9] rounded-t-xl rounded-b-none overflow-hidden bg-gradient-to-br from-primary/40 via-primary/20 to-secondary">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <HandHeart className="size-16 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />

        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 px-4 pt-4">
          <button
            onClick={onBack}
            className="p-2.5 -ml-2 rounded-full text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="size-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
          </button>
          {isCreator && (
            <div className="flex items-center gap-1.5">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="rounded-full bg-transparent text-white/90 shadow-none hover:bg-white/15 hover:text-white focus-visible:ring-white/80"
              >
                <Link to={`/campaigns/new?edit=${encodeURIComponent(naddr)}`}>
                  <Pencil className="size-4 mr-2" />
                  Edit
                </Link>
              </Button>
              {campaign.archived ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onReopen}
                  disabled={archiveDisabled}
                  className="rounded-full bg-transparent text-white/90 shadow-none hover:bg-white/15 hover:text-white focus-visible:ring-white/80"
                >
                  <ArchiveRestore className="size-4 mr-2" />
                  Reopen
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onArchive}
                  disabled={archiveDisabled}
                  className="rounded-full bg-transparent text-white/90 shadow-none hover:bg-white/15 hover:text-white focus-visible:ring-white/80"
                >
                  <Archive className="size-4 mr-2" />
                  Archive
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-5 sm:p-6 [text-shadow:0_1px_4px_rgba(0,0,0,0.75),0_2px_10px_rgba(0,0,0,0.45)]">
          {campaign.archived && (
            <Badge
              variant="secondary"
              className="bg-background/85 text-foreground border-border/40 backdrop-blur [text-shadow:none]"
            >
              <Archive className="size-3.5 mr-1.5" />
              Archived
            </Badge>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-white">
              {campaign.title}
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
            {tagLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Tag className="size-3.5 sm:size-4" />
                {tagLabel}
              </span>
            )}
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 sm:size-4" />
                {countryLabel}
              </span>
            )}
            {deadline && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 sm:size-4" />
                {deadline.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 sm:size-4" />
              {campaign.recipients.length}{' '}
              {campaign.recipients.length === 1 ? 'recipient' : 'recipients'}
            </span>
          </div>
          {campaign.summary && (
            <p className="max-w-2xl text-base sm:text-lg text-white/90 line-clamp-3">
              {campaign.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Story
// ─────────────────────────────────────────────────────────────────────

function CampaignStory({
  storyEvent,
  hasContent,
  expanded,
  onToggle,
}: {
  storyEvent: NostrEvent;
  hasContent: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!hasContent) {
    return (
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-muted-foreground italic">
          The organizer hasn't written a story for this campaign yet.
        </p>
      </article>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative overflow-hidden',
          // Clip the story preview to ~6 lines on mobile / ~12 lines on
          // desktop when collapsed. The aside donate column is taller
          // than 6 lines, so giving the article more space when sticky
          // beside it keeps the page from feeling top-heavy.
          !expanded && 'max-h-[18rem] sm:max-h-[24rem]',
        )}
      >
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <ArticleContent event={storyEvent} />
        </article>
        {!expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="text-sm font-medium text-primary hover:underline motion-safe:transition-colors"
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Donate column
// ─────────────────────────────────────────────────────────────────────

interface DonateColumnProps {
  campaign: ParsedCampaign;
  /** The lone recipient when there's exactly one beneficiary; null otherwise. */
  singleBeneficiary: ParsedCampaign['recipients'][number] | null;
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
  singleBeneficiary,
  raisedSats,
  statsLoading,
  btcPrice,
  donations,
  deadline,
  onDonateClick,
  onShare,
  onSeeAll,
}: DonateColumnProps) {
  const ended = deadline?.isPast || campaign.archived;
  const endedLabel = campaign.archived
    ? 'Campaign archived'
    : deadline?.isPast
      ? 'Campaign ended'
      : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-5">
        {/* Raised stats + progress */}
        {statsLoading ? (
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
              {campaign.goalSats ? (
                <div className="text-xs text-muted-foreground">
                  of {formatSatsFull(campaign.goalSats, btcPrice)} goal
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
            {campaign.goalSats && (
              <Progress
                value={Math.min(
                  100,
                  Math.round((raisedSats / campaign.goalSats) * 100),
                )}
                className="h-2"
              />
            )}
          </div>
        )}

        {/* Primary actions — variant fork is here */}
        {singleBeneficiary ? (
          <SingleBeneficiaryActions
            pubkey={singleBeneficiary.pubkey}
            ended={ended}
            endedLabel={endedLabel}
            onShare={onShare}
          />
        ) : (
          <MultiBeneficiaryActions
            ended={ended}
            endedLabel={endedLabel}
            onDonateClick={onDonateClick}
            onShare={onShare}
          />
        )}

        {/* Beneficiaries — only shown for multi-beneficiary campaigns.
            The single-beneficiary variant already inlines the recipient
            (with a profile link and avatar) via the BIP-21 panel above. */}
        {!singleBeneficiary && (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Beneficiaries
            </div>
            <div className="divide-y divide-border/60">
              {campaign.recipients.map((r) => (
                <RecipientRow key={r.pubkey} pubkey={r.pubkey} weight={r.weight} />
              ))}
            </div>
          </div>
        )}

        {/* Latest donors preview */}
        {donations.length > 0 && (
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

/** Donate / Share pair for multi-beneficiary campaigns. */
function MultiBeneficiaryActions({
  ended,
  endedLabel,
  onDonateClick,
  onShare,
}: {
  ended: boolean;
  endedLabel: string | null;
  onDonateClick: () => void;
  onShare: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        onClick={onDonateClick}
        disabled={ended}
      >
        <HandHeart className="size-5 mr-2" />
        {endedLabel ?? 'Donate'}
      </Button>
      <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
        <Share2 className="size-4 mr-2" />
        Share
      </Button>
    </div>
  );
}

/** BIP-21 QR + address + open-in-wallet panel for single-beneficiary
 *  campaigns. The panel's "Open in wallet" button is the primary CTA,
 *  so we don't render a separate Donate button above it — just Share
 *  beneath. When the campaign has ended, the panel is suppressed and a
 *  disabled "Campaign ended/archived" button takes its place so the
 *  page still communicates state. */
function SingleBeneficiaryActions({
  pubkey,
  ended,
  endedLabel,
  onShare,
}: {
  pubkey: string;
  ended: boolean;
  endedLabel: string | null;
  onShare: () => void;
}) {
  if (ended) {
    return (
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
    );
  }

  return (
    <div className="space-y-3">
      <BeneficiaryDonatePanel pubkey={pubkey} />
      <Button variant="outline" size="lg" className="w-full" onClick={onShare}>
        <Share2 className="size-4 mr-2" />
        Share
      </Button>
    </div>
  );
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
// Beneficiary row (multi-beneficiary campaigns)
// ─────────────────────────────────────────────────────────────────────

function RecipientRow({ pubkey, weight }: { pubkey: string; weight: number }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);
  const nip05 = metadata?.nip05;
  const profileUrl = useProfileUrl(pubkey, metadata);
  const [donateOpen, setDonateOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 py-2.5 -mx-2 px-2 rounded-md motion-safe:transition-colors hover:bg-muted/40">
      <Link
        to={profileUrl}
        className="flex items-center gap-3 min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-9 shrink-0">
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{name}</div>
          {nip05 && (
            <div className="text-xs text-muted-foreground truncate">{nip05}</div>
          )}
        </div>
        {weight !== 1 && (
          <Badge variant="outline" className="shrink-0">
            weight {weight}
          </Badge>
        )}
      </Link>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => setDonateOpen(true)}
        aria-label={`Donate to ${name}`}
      >
        Donate
      </Button>
      <BeneficiaryDonateDialog
        pubkey={pubkey}
        open={donateOpen}
        onOpenChange={setDonateOpen}
      />
    </div>
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
