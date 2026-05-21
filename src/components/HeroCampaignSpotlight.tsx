import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { encodeCampaignNaddr, getCampaignCountryLabel, type ParsedCampaign } from '@/lib/campaign';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { formatCampaignAmount, formatUsdGoal, satsToUsd } from '@/lib/formatCampaignAmount';

interface HeroCampaignSpotlightProps {
  /** Campaign to feature. `null` renders the empty placeholder. */
  campaign: ParsedCampaign | null;
  /** Show a skeleton while the parent is still loading featured campaigns. */
  isLoading?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * Banner-overlay spotlight for the active campaign — title, summary,
 * author, location, and a "View campaign" CTA — rendered directly on the
 * hero photo (no card chrome). The hero photo IS the background, so this
 * component is purely a text overlay.
 *
 * Parent (`CampaignsPage`) drives the `campaign` prop, cycling on a timer
 * or pinning to whichever marker the user clicked on the globe.
 */
export function HeroCampaignSpotlight({
  campaign,
  isLoading = false,
  className,
}: HeroCampaignSpotlightProps) {
  // useAuthor must be called unconditionally to keep hook order stable —
  // when there's no campaign yet we pass an empty pubkey and ignore the
  // (no-op) result below. Same for donations + BTC price.
  const author = useAuthor(campaign?.pubkey ?? '');
  const { data: stats } = useCampaignDonations(campaign ?? undefined);
  const { data: btcPrice } = useBtcPrice();

  if (isLoading && !campaign) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <Skeleton className="h-5 w-52 bg-white/20" />
        <Skeleton className="h-3 w-64 bg-white/20" />
        <Skeleton className="h-3 w-40 bg-white/20" />
      </div>
    );
  }

  if (!campaign) return null;

  const naddr = encodeCampaignNaddr(campaign);
  const meta = author.data?.metadata;
  const authorName = meta?.display_name || meta?.name || genUserName(campaign.pubkey);
  const authorPicture = sanitizeUrl(meta?.picture);
  const countryLabel = getCampaignCountryLabel(campaign);
  const isSilentPayment = campaign.wallet.mode === 'sp';

  return (
    <div
      className={cn(
        // Compact text block over the photo — always white regardless of
        // theme since the hero is always a dark-scrimed photo.
        'space-y-1.5 text-white hero-text-shadow-soft',
        className,
      )}
    >
      <p className="text-base font-semibold leading-snug line-clamp-1">
        {campaign.title}
      </p>

      {campaign.summary && (
        <p className="text-xs text-white/80 line-clamp-2 max-w-xs">
          {campaign.summary}
        </p>
      )}

      {/* Progress / goal. Hand-rolled instead of using <CampaignProgress>
          so we can tune the bar for legibility on top of a photo: dark
          translucent track, glowing primary fill. When the campaign has no
          goal tag, the bar is omitted entirely and we only show the raised
          total. Silent-payment campaigns hide totals by design (per
          NIP.md Kind 33863). */}
      {isSilentPayment ? (
        <div className="space-y-1.5 pt-1 max-w-xs">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-white/85 [text-shadow:none]">
            <ShieldCheck className="size-3" />
            <span>Private campaign — totals not public</span>
          </div>
          {campaign.goalUsd && campaign.goalUsd > 0 && (
            <div className="text-[11px] text-white/70 [text-shadow:none]">
              Target: {formatUsdGoal(campaign.goalUsd)}
            </div>
          )}
        </div>
      ) : (() => {
        const raised = stats?.totalSats ?? 0;
        const goal = campaign.goalUsd;
        const hasGoal = !!goal && goal > 0;
        const raisedUsd = satsToUsd(raised, btcPrice);
        const pct = hasGoal && raisedUsd !== undefined
          ? Math.min(100, Math.round((raisedUsd / goal!) * 100))
          : 0;
        return (
          <div className="space-y-1.5 pt-1 max-w-xs">
            {hasGoal && (
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.7)] motion-safe:transition-[width] motion-safe:duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2 text-[11px] [text-shadow:none]">
              <span className="font-semibold text-white">
                {formatCampaignAmount(raised, btcPrice)}
                {!hasGoal && <span className="ml-1 font-normal text-white/70">raised</span>}
              </span>
              {hasGoal && (
                <span className="text-white/70">
                  of {formatUsdGoal(goal!)} goal
                </span>
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/75 pt-0.5">
        <span className="inline-flex items-center gap-1.5">
          <Avatar className="size-4 ring-1 ring-white/40">
            {authorPicture && <AvatarImage src={authorPicture} alt="" />}
            <AvatarFallback className="text-[8px]">
              {authorName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{authorName}</span>
        </span>
        {countryLabel && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            <span className="truncate max-w-[16ch]">{countryLabel}</span>
          </span>
        )}
        <Link
          to={`/${naddr}`}
          className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:underline"
        >
          View
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
