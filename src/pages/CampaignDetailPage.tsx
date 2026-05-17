import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CampaignProgress } from '@/components/CampaignCard';
import { DonateDialog } from '@/components/DonateDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import {
  CAMPAIGN_CATEGORY_LABELS,
  encodeCampaignNaddr,
  type ParsedCampaign,
} from '@/lib/campaign';
import { satsToUSD } from '@/lib/bitcoin';
import { genUserName } from '@/lib/genUserName';
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
  if (btcPrice) return satsToUSD(sats, btcPrice);
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

  const cover = sanitizeUrl(campaign.image);
  const creatorMetadata = author.data?.metadata;
  const creatorName =
    creatorMetadata?.display_name || creatorMetadata?.name || genUserName(campaign.pubkey);
  const creatorAvatar = sanitizeUrl(creatorMetadata?.picture);
  const creatorUrl = useProfileUrl(campaign.pubkey, creatorMetadata);

  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const raisedSats = stats?.totalSats ?? 0;

  const isCreator = user?.pubkey === campaign.pubkey;
  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);

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

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        {/* Inline back arrow — the global TopNav handles primary navigation. */}
        <div className="flex items-center gap-2 mb-4 -ml-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-secondary motion-safe:transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeft className="size-5" />
          </button>
          <Button variant="ghost" size="sm" onClick={handleShare} className="ml-auto">
            <Share2 className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
          <div className="lg:col-span-2 space-y-6">
            {/* Cover */}
            <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
              {cover ? (
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <HandHeart className="size-16 text-primary/40" />
                </div>
              )}
              {campaign.category && (
                <Badge
                  variant="secondary"
                  className="absolute top-4 left-4 backdrop-blur bg-background/80 border-border/40"
                >
                  {CAMPAIGN_CATEGORY_LABELS[campaign.category]}
                </Badge>
              )}
            </div>

            {/* Title + summary */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">
                {campaign.title}
              </h1>
              {campaign.summary && (
                <p className="text-lg text-muted-foreground">{campaign.summary}</p>
              )}
            </div>

            {/* Creator + meta */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground border-y border-border py-4">
              <Link
                to={creatorUrl}
                className="inline-flex items-center gap-2 hover:text-foreground motion-safe:transition-colors"
              >
                <Avatar className="size-7">
                  {creatorAvatar && <AvatarImage src={creatorAvatar} alt="" />}
                  <AvatarFallback>{creatorName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span>
                  organized by <span className="font-medium text-foreground">{creatorName}</span>
                </span>
              </Link>
              {campaign.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {campaign.location}
                </span>
              )}
              {deadline && (
                <span
                  className={`inline-flex items-center gap-1.5${
                    deadline.isPast ? ' text-destructive' : ''
                  }`}
                >
                  <CalendarClock className="size-4" />
                  {deadline.label}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" />
                {campaign.recipients.length}{' '}
                {campaign.recipients.length === 1 ? 'recipient' : 'recipients'}
              </span>
            </div>

            {/* Story */}
            <article className="prose prose-neutral dark:prose-invert max-w-none">
              {campaign.story.trim().length > 0 ? (
                <ArticleContent event={campaign.event} />
              ) : (
                <p className="text-muted-foreground italic">
                  The organizer hasn't written a story for this campaign yet.
                </p>
              )}
            </article>

            {/* Recipients */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold">Beneficiaries</h2>
                  <p className="text-sm text-muted-foreground">
                    Your donation is split across {campaign.recipients.length}{' '}
                    {campaign.recipients.length === 1 ? 'person' : 'people'} in a single Bitcoin
                    transaction.
                  </p>
                </div>
                <div className="divide-y divide-border/60">
                  {campaign.recipients.map((r) => (
                    <RecipientRow key={r.pubkey} pubkey={r.pubkey} weight={r.weight} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Donation rail */}
          <aside className="lg:col-span-1 lg:sticky lg:top-[5rem] self-start space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                {statsLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <>
                    <div>
                      <div className="text-3xl font-bold tracking-tight">
                        {formatSatsFull(raisedSats, btcPrice)}
                      </div>
                      {campaign.goalSats && (
                        <div className="text-sm text-muted-foreground">
                          raised of {formatSatsFull(campaign.goalSats, btcPrice)} goal
                        </div>
                      )}
                    </div>
                    <CampaignProgress
                      raisedSats={raisedSats}
                      goalSats={campaign.goalSats}
                      btcPrice={btcPrice}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {stats?.donorCount ?? 0}{' '}
                        {stats?.donorCount === 1 ? 'donor' : 'donors'}
                      </span>
                      <span>
                        {stats?.txCount ?? 0}{' '}
                        {stats?.txCount === 1 ? 'donation' : 'donations'}
                      </span>
                    </div>
                  </>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setDonateOpen(true)}
                  disabled={deadline?.isPast}
                >
                  <HandHeart className="size-4 mr-2" />
                  {deadline?.isPast ? 'Campaign ended' : 'Donate'}
                </Button>

                <Button variant="outline" className="w-full" onClick={handleShare}>
                  <Share2 className="size-4 mr-2" />
                  Share campaign
                </Button>

                {isCreator && (
                  <Button variant="ghost" className="w-full" asChild>
                    <Link to={`/campaigns/edit/${naddr}`}>
                      <Pencil className="size-4 mr-2" />
                      Edit campaign
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground text-center px-2">
              Donations are sent on-chain to each beneficiary's Nostr-derived Bitcoin address in a
              single Bitcoin transaction.
            </div>
          </aside>
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
    </main>
  );
}

function RecipientRow({ pubkey, weight }: { pubkey: string; weight: number }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);

  return (
    <Link
      to={`/${pubkey}`}
      className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-md motion-safe:transition-colors"
    >
      <Avatar className="size-9 shrink-0">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-xs text-muted-foreground font-mono truncate">
          {pubkey.slice(0, 12)}…{pubkey.slice(-8)}
        </div>
      </div>
      {weight !== 1 && (
        <Badge variant="outline" className="shrink-0">
          weight {weight}
        </Badge>
      )}
    </Link>
  );
}

function CampaignDetailSkeleton() {
  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <Skeleton className="h-9 w-9 rounded-full mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="aspect-[16/9] w-full rounded-xl" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-32 w-full" />
          </div>
          <aside className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
