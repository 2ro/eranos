import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, EyeOff, HandHeart, MapPin, ShieldCheck, Target } from 'lucide-react';

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
} from '@/lib/campaign';
import { formatCampaignAmount, formatUsdGoal, satsToUsd } from '@/lib/formatCampaignAmount';
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

/**
 * Short helper rendered both inline (cards) and in the detail page.
 *
 * Per NIP.md Kind 33863, the campaign **goal** is integer USD and the
 * **raised** total is the sum of verified sats. We render both in the
 * goal's unit (USD) for consistency, converting the sats total at view
 * time using the live BTC price. While the price is loading the raised
 * amount falls back to sats.
 */
function CampaignProgress({
  raisedSats,
  goalUsd,
  btcPrice,
  className,
}: {
  raisedSats: number;
  goalUsd?: number;
  btcPrice?: number;
  className?: string;
}) {
  const hasGoal = !!goalUsd && goalUsd > 0;
  const raisedUsd = satsToUsd(raisedSats, btcPrice);
  const pct = hasGoal && raisedUsd !== undefined
    ? Math.min(100, Math.round((raisedUsd / goalUsd!) * 100))
    : 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      {hasGoal && <Progress value={pct} className="h-2" />}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {formatCampaignAmount(raisedSats, btcPrice)}
          {!hasGoal && <span className="ml-1 font-normal text-muted-foreground">raised</span>}
        </span>
        {hasGoal && (
          <span className="text-muted-foreground">of {formatUsdGoal(goalUsd!)} goal</span>
        )}
      </div>
    </div>
  );
}

/**
 * Replaces {@link CampaignProgress} for silent-payment campaigns, where
 * on-chain totals are unobservable by design. Shows the goal as a target
 * (if set) but no progress bar or raised amount.
 */
function CampaignPrivateNotice({
  goalUsd,
  className,
}: {
  goalUsd?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5 text-sm', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        <span>Private campaign — totals are not public</span>
      </div>
      {goalUsd && goalUsd > 0 && (
        <div className="text-xs text-muted-foreground">Target: {formatUsdGoal(goalUsd)}</div>
      )}
    </div>
  );
}

interface CampaignCardProps {
  campaign: ParsedCampaign;
  /** Visual variant: `compact` for grid items, `featured` for hero placement. */
  variant?: 'compact' | 'featured';
  className?: string;
  /** Optional footer affordance rendered opposite the author line. */
  footerBadge?: ReactNode;
}

/**
 * Renders a single campaign as a clickable card. The whole card is a
 * `<Link>` to the campaign's naddr-based detail route.
 */
export function CampaignCard({ campaign, variant = 'compact', className, footerBadge }: CampaignCardProps) {
  const author = useAuthor(campaign.pubkey);
  const { data: stats } = useCampaignDonations(campaign);
  const { data: btcPrice } = useBtcPrice();
  const { data: moderation } = useCampaignModeration();

  const naddr = useMemo(() => encodeCampaignNaddr(campaign), [campaign]);
  const cover = sanitizeUrl(campaign.banner);
  const creatorName =
    author.data?.metadata?.display_name ||
    author.data?.metadata?.name ||
    genUserName(campaign.pubkey);
  const deadline = campaign.deadline ? formatDeadline(campaign.deadline) : null;
  const raisedSats = stats?.totalSats ?? 0;
  const countryLabel = getCampaignCountryLabel(campaign);
  // SP-only campaigns hide aggregate totals; dual-endpoint campaigns
  // show on-chain aggregates per spec.
  const isSilentPayment = !campaign.wallets.onchain;

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
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {isHidden && (
              <Badge
                variant="secondary"
                className="backdrop-blur bg-destructive/15 text-destructive border-destructive/30"
              >
                <EyeOff className="size-3.5 mr-1" />
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
                isFeaturedVariant ? 'text-2xl sm:text-3xl' : 'text-lg',
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

          {isSilentPayment ? (
            <CampaignPrivateNotice goalUsd={campaign.goalUsd} />
          ) : (
            <CampaignProgress raisedSats={raisedSats} goalUsd={campaign.goalUsd} btcPrice={btcPrice} />
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1">
            {!isSilentPayment && stats && stats.donorCount > 0 && (
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

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <div className="truncate">
              by <span className="font-medium text-foreground">{creatorName}</span>
            </div>
            {footerBadge && <div className="shrink-0">{footerBadge}</div>}
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
