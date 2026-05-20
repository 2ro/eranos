import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, HandHeart, MapPin, Target, Users, Archive } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CampaignModerationMenu } from '@/components/CampaignModerationMenu';
import { useAuthor } from '@/hooks/useAuthor';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import {
  type ParsedCampaign,
  encodeCampaignNaddr,
  getCampaignCountryLabel,
  getCampaignPrimaryTagLabel,
} from '@/lib/campaign';
import { formatCampaignAmount } from '@/lib/formatCampaignAmount';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

function formatDeadline(unixSeconds: number): { label: string; isPast: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return { label: 'Ended', isPast: true };
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: 'Ends today', isPast: false };
  if (days < 30) return { label: `${days} days left`, isPast: false };
  const months = Math.round(days / 30);
  return { label: `${months} mo left`, isPast: false };
}

/** Short helper rendered both inline (cards) and in the detail page. */
export function CampaignProgress({
  raisedSats,
  goalSats,
  btcPrice,
  className,
}: {
  raisedSats: number;
  goalSats?: number;
  btcPrice?: number;
  className?: string;
}) {
  const hasGoal = !!goalSats && goalSats > 0;
  const pct = hasGoal ? Math.min(100, Math.round((raisedSats / goalSats!) * 100)) : 0;
  return (
    <div className={cn('space-y-1.5', className)}>
      {hasGoal && <Progress value={pct} className="h-2" />}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {formatCampaignAmount(raisedSats, btcPrice)}
          {!hasGoal && <span className="ml-1 font-normal text-muted-foreground">raised</span>}
        </span>
        {hasGoal && (
          <span className="text-muted-foreground">of {formatCampaignAmount(goalSats!, btcPrice)} goal</span>
        )}
      </div>
    </div>
  );
}

interface CampaignCardProps {
  campaign: ParsedCampaign;
  /** Visual variant: `compact` for grid items, `featured` for hero placement. */
  variant?: 'compact' | 'featured';
  className?: string;
}

/**
 * Renders a single campaign as a clickable card. The whole card is a
 * `<Link>` to the campaign's naddr-based detail route.
 */
export function CampaignCard({ campaign, variant = 'compact', className }: CampaignCardProps) {
  const author = useAuthor(campaign.pubkey);
  const { data: stats } = useCampaignDonations(campaign.aTag);
  const { data: btcPrice } = useBtcPrice();
  const { data: moderation } = useCampaignModeration();

  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const cover = sanitizeUrl(campaign.image);
  const creatorName =
    author.data?.metadata?.display_name ||
    author.data?.metadata?.name ||
    genUserName(campaign.pubkey);
  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const raisedSats = stats?.totalSats ?? 0;
  const countryLabel = getCampaignCountryLabel(campaign);
  const tagLabel = getCampaignPrimaryTagLabel(campaign);

  const isFeaturedVariant = variant === 'featured';
  const isApproved = moderation.approvedCoords.has(campaign.aTag);
  const isHidden = moderation.hiddenCoords.has(campaign.aTag);
  const isFeatured = moderation.featuredCoords.has(campaign.aTag);

  return (
    <Link
      to={`/${naddr}`}
      className={cn(
        'group block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5',
        className,
      )}
    >
      <Card
        className={cn(
          'overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col',
          isFeaturedVariant && 'sm:flex-row sm:items-stretch',
        )}
      >
        {/* Cover image */}
        <div
          className={cn(
            'relative w-full bg-gradient-to-br from-primary/15 via-primary/5 to-secondary',
            isFeaturedVariant ? 'aspect-[16/10] sm:aspect-auto sm:w-1/2 sm:min-h-[280px]' : 'aspect-[16/9]',
          )}
        >
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <HandHeart className="size-12 text-primary/40" />
            </div>
          )}
          {tagLabel && (
            <Badge
              variant="secondary"
              className="absolute top-3 left-3 backdrop-blur bg-background/80 border-border/40"
            >
              {tagLabel}
            </Badge>
          )}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {campaign.archived && (
              <Badge
                variant="secondary"
                className="backdrop-blur bg-background/85 border-border/40"
              >
                <Archive className="size-3.5 mr-1" />
                Archived
              </Badge>
            )}
            {isHidden && (
              <Badge
                variant="secondary"
                className="backdrop-blur bg-destructive/15 text-destructive border-destructive/30"
              >
                Hidden
              </Badge>
            )}
            <CampaignModerationMenu
              coord={campaign.aTag}
              campaignTitle={campaign.title}
              isApproved={isApproved}
              isHidden={isHidden}
              isFeatured={isFeatured}
            />
          </div>
        </div>

        {/* Body */}
        <div className={cn('flex flex-col gap-3 p-5', isFeaturedVariant && 'sm:w-1/2 sm:p-6')}>
          <div className="space-y-2">
            <h3
              className={cn(
                'font-bold leading-tight tracking-tight',
                isFeaturedVariant ? 'text-2xl sm:text-3xl' : 'text-lg line-clamp-2',
              )}
            >
              {campaign.title}
            </h3>
            {campaign.summary && (
              <p
                className={cn(
                  'text-muted-foreground',
                  isFeaturedVariant ? 'text-base line-clamp-3' : 'text-sm line-clamp-2',
                )}
              >
                {campaign.summary}
              </p>
            )}
          </div>

          <div className="flex-1" />

          <CampaignProgress raisedSats={raisedSats} goalSats={campaign.goalSats} btcPrice={btcPrice} />

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {campaign.recipients.length}{' '}
              {campaign.recipients.length === 1 ? 'recipient' : 'recipients'}
            </span>
            {stats && stats.donorCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="size-3.5" />
                {stats.donorCount} {stats.donorCount === 1 ? 'donor' : 'donors'}
              </span>
            )}
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {countryLabel}
              </span>
            )}
            {deadline && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  deadline.isPast && 'text-destructive',
                )}
              >
                <CalendarClock className="size-3.5" />
                {deadline.label}
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground border-t border-border/60 pt-3 truncate">
            by <span className="font-medium text-foreground">{creatorName}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** Loading placeholder mirroring {@link CampaignCard} dimensions. */
export function CampaignCardSkeleton({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'featured';
  className?: string;
}) {
  const isFeatured = variant === 'featured';
  return (
    <Card
      className={cn(
        'overflow-hidden border-border/70 shadow-sm h-full flex flex-col',
        isFeatured && 'sm:flex-row sm:items-stretch',
        className,
      )}
    >
      <Skeleton
        className={cn(
          'w-full rounded-none',
          isFeatured ? 'aspect-[16/10] sm:aspect-auto sm:w-1/2 sm:min-h-[280px]' : 'aspect-[16/9]',
        )}
      />
      <div className={cn('flex-1 p-5 space-y-3', isFeatured && 'sm:w-1/2 sm:p-6')}>
        <Skeleton className={cn('w-3/4', isFeatured ? 'h-7' : 'h-5')} />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="flex-1" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </Card>
  );
}
