import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { encodeCampaignNaddr, type ParsedCampaign } from '@/lib/campaign';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useCampaignDonations } from '@/hooks/useCampaignDonations';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { formatCampaignAmount } from '@/lib/formatCampaignAmount';

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
  const { data: stats } = useCampaignDonations(campaign?.aTag);
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

  return (
    <div
      className={cn(
        // Compact text block over the photo. Light text + subtle drop
        // shadow for legibility, no card chrome — modeled after the
        // Treasures hero overlay: tight, dense, low-key.
        'space-y-1.5 text-foreground [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]',
        className,
      )}
    >
      <p className="text-base font-semibold leading-snug line-clamp-1">
        {campaign.title}
      </p>

      {campaign.summary && (
        <p className="text-xs text-foreground/80 line-clamp-2 max-w-xs">
          {campaign.summary}
        </p>
      )}

      {/* Progress / goal. Hand-rolled instead of using <CampaignProgress>
          so we can tune the bar for legibility on top of a photo: dark
          translucent track, glowing primary fill. The percent label sits
          inside the bar's empty area so the number reads even without a
          goal. */}
      {(() => {
        const raised = stats?.totalSats ?? 0;
        const goal = campaign.goalSats;
        const pct = goal && goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
        return (
          <div className="space-y-1.5 pt-1 max-w-xs">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.7)] motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between gap-2 text-[11px] [text-shadow:none]">
              <span className="font-semibold text-foreground">
                {formatCampaignAmount(raised, btcPrice)}
              </span>
              {goal ? (
                <span className="text-foreground/70">
                  of {formatCampaignAmount(goal, btcPrice)} goal
                </span>
              ) : (
                <span className="text-foreground/70">raised</span>
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/75 pt-0.5">
        <span className="inline-flex items-center gap-1.5">
          <Avatar className="size-4 ring-1 ring-white/40">
            {authorPicture && <AvatarImage src={authorPicture} alt="" />}
            <AvatarFallback className="text-[8px]">
              {authorName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{authorName}</span>
        </span>
        {campaign.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            <span className="truncate max-w-[16ch]">{campaign.location}</span>
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
