import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCampaignAmount } from '@/lib/formatCampaignAmount';
import { useVenezuelaReliefCampaigns } from '@/hooks/useVenezuelaReliefCampaigns';

interface VenezuelaReliefGoalProps {
  /**
   * `overlay` — light text, for the dark hero photo backgrounds (banner +
   * page). `card` — foreground text, for the popup's light card surface.
   */
  variant?: 'overlay' | 'card';
  className?: string;
}

/**
 * Aggregate fundraising readout for the Venezuela relief showcase — the
 * combined raised total across every matching campaign, plus the
 * matching-campaign count. Shared by the home hero
 * ({@link VenezuelaReliefBanner}), the session popup
 * ({@link VenezuelaReliefPopup}), and the dedicated page
 * ({@link VenezuelaReliefPage}) so each surface is an info + donation
 * hybrid backed by the same numbers.
 *
 * No goal or progress bar: the appeal spans many independent campaigns
 * (each with its own goal, shown on its card), so an aggregate "goal" is
 * meaningless here — we surface the combined raised total only.
 *
 * Renders nothing once loaded if no matching campaigns resolve, or they've
 * raised nothing yet — the surrounding appeal copy and CTAs stand on their
 * own, so this never leaves an empty box.
 */
export function VenezuelaReliefGoal({ variant = 'overlay', className }: VenezuelaReliefGoalProps) {
  const { t } = useTranslation();
  const { isLoading, raisedSats, campaignCount, btcPrice } =
    useVenezuelaReliefCampaigns();

  const isOverlay = variant === 'overlay';

  if (isLoading) {
    return (
      <div className={cn('w-full max-w-md space-y-2', className)}>
        <Skeleton className={cn('h-7 w-44', isOverlay && 'bg-white/20')} />
        <Skeleton className={cn('h-3 w-28', isOverlay && 'bg-white/20')} />
      </div>
    );
  }

  // Nothing meaningful to show — let the appeal copy carry the surface.
  if (raisedSats <= 0) return null;

  const raisedLabel = formatCampaignAmount(raisedSats, btcPrice);

  return (
    <div
      className={cn(
        'w-full max-w-md space-y-1',
        isOverlay
          ? 'drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]'
          : 'rounded-lg border border-border bg-muted/40 p-3',
        className,
      )}
    >
      <span
        className={cn(
          'text-2xl sm:text-3xl font-bold tracking-tight',
          isOverlay ? 'text-white' : 'text-foreground',
        )}
      >
        {raisedLabel}
        <span
          className={cn(
            'ml-1.5 text-sm font-normal',
            isOverlay ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {t('campaignsDetail.raised')}
        </span>
      </span>

      {campaignCount > 0 && (
        <p className={cn('text-xs', isOverlay ? 'text-white/70' : 'text-muted-foreground')}>
          {t('campaigns.home.venezuelaRelief.campaignCount', { count: campaignCount })}
        </p>
      )}
    </div>
  );
}

export default VenezuelaReliefGoal;
