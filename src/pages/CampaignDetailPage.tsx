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
  Bitcoin,
  ChevronLeft,
  HandHeart,
  MapPin,
  Pencil,
  Share2,
  Users,
} from 'lucide-react';

import { ArticleContent } from '@/components/ArticleContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BeneficiaryDonateDialog } from '@/components/BeneficiaryDonateDialog';
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
import { CampaignProgress } from '@/components/CampaignCard';
import { DonateDialog } from '@/components/DonateDialog';
import { PostActionBar } from '@/components/PostActionBar';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import {
  InteractionsModal,
  type InteractionTab,
} from '@/components/InteractionsModal';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useArchiveCampaign } from '@/hooks/useArchiveCampaign';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
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

export function CampaignDetailPage({ pubkey, identifier, relays }: CampaignDetailPageProps) {
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
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const archiveMutation = useArchiveCampaign();

  const openInteractions = (tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  };

  // Engagement stats (replies / reposts / reactions / zaps) for the campaign
  // event itself — drives the counters above the action bar.
  const { data: engagementStats } = useEventStats(campaign.event.id, campaign.event);

  // Fetch NIP-22 comments for this addressable campaign. useComments resolves
  // the `#A` filter automatically when given an addressable NostrEvent.
  const { data: commentsData, isLoading: commentsLoading } = useComments(
    campaign.event,
    500,
  );

  // Build a recursive reply tree from the flat comment list, then interleave
  // kind 8333 on-chain donation receipts as top-level nodes sorted by
  // created_at. ThreadedReplyList renders each via NoteCard, which has a
  // dedicated zap-receipt layout that already handles kind 8333.
  //
  // New donations produce one kind 8333 event for the whole tx; legacy
  // donations produced one event per beneficiary sharing the same txid and
  // donor. To render either as a single donation card, we group by
  // `(txid, donor)` and sum each group's `amount` tags into the canonical
  // (newest) event. New-schema donations are a singleton group whose sum
  // already equals the event's own `amount`; legacy donations collapse
  // their N events into one card showing the donation total.
  const donationReceipts = useMemo((): NostrEvent[] => {
    if (!stats?.receipts || stats.receipts.length === 0) return [];

    type Aggregate = {
      canonical: NostrEvent;
      totalSats: number;
    };
    const byDonation = new Map<string, Aggregate>();

    for (const receipt of stats.receipts) {
      const txid = receipt.tags.find(([n]) => n === 'i')?.[1]?.replace(/^bitcoin:tx:/, '');
      const amountTag = receipt.tags.find(([n]) => n === 'amount')?.[1];
      const amount = amountTag ? Number(amountTag) : NaN;
      if (!txid || !Number.isFinite(amount) || amount <= 0) continue;

      const key = `${txid}:${receipt.pubkey}`;
      const prev = byDonation.get(key);
      const totalSats = (prev?.totalSats ?? 0) + amount;
      // Use the newest receipt as the canonical event so created_at reflects
      // the latest activity for the donation.
      const canonical = prev && prev.canonical.created_at >= receipt.created_at
        ? prev.canonical
        : receipt;
      byDonation.set(key, { canonical, totalSats });
    }

    // Materialise display events with the summed amount tag.
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
    // Donations have no replies of their own in this view.
    const donationNodes: ReplyNode[] = donationReceipts.map((ev) => ({ event: ev, children: [] }));

    return [...commentNodes, ...donationNodes].sort(
      (a, b) => b.event.created_at - a.event.created_at,
    );
  }, [commentsData, donationReceipts]);

  // Engagement counters above the action bar. Zaps are intentionally excluded
  // for campaigns — Lightning zaps are not how campaigns are funded (on-chain
  // donations via kind 8333 are), so showing a zap count here would suggest
  // the wrong CTA.
  const hasStats =
    !!engagementStats?.replies ||
    !!engagementStats?.reposts ||
    !!engagementStats?.quotes ||
    !!engagementStats?.reactions;
  const cover = sanitizeUrl(campaign.image);
  const creatorMetadata = author.data?.metadata;
  const creatorName =
    creatorMetadata?.display_name || creatorMetadata?.name || genUserName(campaign.pubkey);

  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const countryLabel = getCampaignCountryLabel(campaign);
  const tagLabel = getCampaignPrimaryTagLabel(campaign);
  const raisedSats = stats?.totalSats ?? 0;

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

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        {/* Hero */}
        <div className="space-y-4">
            {/* Cover */}
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-primary/40 via-primary/20 to-secondary">
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
                  onClick={() => navigate(-1)}
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
                        onClick={handleToggleArchive}
                        disabled={archiveMutation.isPending}
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
                        onClick={() => setArchiveConfirmOpen(true)}
                        disabled={archiveMutation.isPending}
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
                    to={`/${campaign.pubkey}`}
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

            {/* Support */}
            <Card className="border-0 bg-transparent shadow-none">
              <CardContent className="p-0 space-y-4">
                <div>
                  <h2 className="text-lg font-bold">Support Campaign</h2>
                  <p className="text-sm text-muted-foreground">
                    Donations are sent with Bitcoin and split across the beneficiaries.
                  </p>
                </div>

                {statsLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <div className="text-3xl font-bold tracking-tight">
                        {formatSatsFull(raisedSats, btcPrice)}
                      </div>
                      {campaign.goalSats ? (
                        <div className="text-sm text-muted-foreground">
                          raised of {formatSatsFull(campaign.goalSats, btcPrice)} goal
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">raised</div>
                      )}
                    </div>
                    {campaign.goalSats && (
                      <CampaignProgress
                        raisedSats={raisedSats}
                        goalSats={campaign.goalSats}
                        btcPrice={btcPrice}
                      />
                    )}
                  </>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <Button
                    size="lg"
                    className="w-full col-span-3"
                    onClick={() => setDonateOpen(true)}
                    disabled={deadline?.isPast || campaign.archived}
                  >
                    <HandHeart className="size-5 mr-2" />
                    {campaign.archived
                      ? 'Campaign archived'
                      : deadline?.isPast
                        ? 'Campaign ended'
                        : 'Donate'}
                  </Button>

                  <Button variant="outline" size="lg" className="w-full" onClick={handleShare}>
                    <Share2 className="size-4 mr-2" />
                    Share
                  </Button>
                </div>

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

                <div className="space-y-2 border-t border-border/60 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Story
                  </div>
                  {campaign.story.trim().length > 0 ? (
                    <div className="space-y-2">
                      <div
                        className={cn(
                          'relative overflow-hidden',
                          !storyExpanded && 'max-h-[4.5rem]',
                        )}
                      >
                        <article className="prose prose-neutral dark:prose-invert max-w-none">
                          <ArticleContent event={storyEvent} />
                        </article>
                        {!storyExpanded && (
                          // Fade overlay hints at clipped content. Pointer-events
                          // disabled so the Read more button below is clickable.
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setStoryExpanded((v) => !v)}
                        className="text-sm font-medium text-primary hover:underline motion-safe:transition-colors"
                      >
                        {storyExpanded ? 'Show less' : 'Read more'}
                      </button>
                    </div>
                  ) : (
                    <article className="prose prose-neutral dark:prose-invert max-w-none">
                      <p className="text-muted-foreground italic">
                        The organizer hasn't written a story for this campaign yet.
                      </p>
                    </article>
                  )}
                </div>

                {/* Engagement: stats row, action bar, threaded replies.
                    No top border here — PostActionBar carries its own. */}
                <div className="space-y-2 pt-4">
                  {hasStats && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
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

                  <PostActionBar
                    event={campaign.event}
                    replyLabel="Comment"
                    hideZap
                    onReply={() => setReplyOpen(true)}
                    onMore={() => setMoreMenuOpen(true)}
                  />

                  {/* Threaded comments + on-chain donation receipts */}
                  <div className="pt-2">
                    {commentsLoading && statsLoading && replyTree.length === 0 ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <CampaignReplySkeleton key={i} />
                        ))}
                      </div>
                    ) : replyTree.length > 0 ? (
                      <div className="-mx-2 sm:-mx-4">
                        <ThreadedReplyList roots={replyTree} />
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No comments yet. Be the first to comment!
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
        </div>
      </div>

      <DonateDialog
        campaign={campaign}
        open={donateOpen}
        onOpenChange={(open) => {
          setDonateOpen(open);
          if (!open) {
            // Refresh stats after the dialog closes so a successful donation
            // shows up promptly even if relay propagation lagged.
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

function RecipientRow({ pubkey, weight }: { pubkey: string; weight: number }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);
  const nip05 = metadata?.nip05;
  const [donateOpen, setDonateOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 py-2.5 -mx-2 px-2 rounded-md motion-safe:transition-colors hover:bg-muted/40">
      <Link
        to={`/${pubkey}`}
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
        <Bitcoin className="size-4 mr-1.5" />
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="space-y-4">
          <Skeleton className="aspect-[16/9] w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-4 gap-2">
              <Skeleton className="h-11 w-full col-span-3" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
