import { useTranslation } from 'react-i18next';

import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCampaignAmount, formatUsdGoal } from '@/lib/formatCampaignAmount';
import { useVenezuelaReliefCampaign } from '@/hooks/useVenezuelaReliefCampaign';

interface VenezuelaReliefGoalProps {
  /**
   * `overlay` — light text + translucent track, for the dark hero photo
   * backgrounds (banner + page). `card` — foreground text + muted track,
   * for the popup's light card surface.
   */
  variant?: 'overlay' | 'card';
  className?: string;
}

/**
 * Live fundraising readout for the baked-in Venezuela relief campaign —
 * the raised total, goal, donation count, and a progress bar. Shared by
 * the home hero ({@link VenezuelaReliefBanner}), the session popup
 * ({@link VenezuelaReliefPopup}), and the dedicated page
 * ({@link VenezuelaReliefPage}) so each surface is an info + donation
 * hybrid backed by the same numbers as the campaign detail page.
 *
 * Renders nothing once loaded if the campaign can't be resolved or has no
 * goal/raised data — the surrounding appeal copy and CTAs stand on their
 * own, so this never leaves an empty box.
 */
export function VenezuelaReliefGoal({ variant = 'overlay', className }: VenezuelaReliefGoalProps) {
  const { t } = useTranslation();
  const { isLoading, raisedSats, goalUsd, donationCount, percent, btcPrice } =
    useVenezuelaReliefCampaign();

  const isOverlay = variant === 'overlay';

  if (isLoading) {
    return (
      <div className={cn('w-full max-w-md space-y-2', className)}>
        <Skeleton className={cn('h-6 w-40', isOverlay && 'bg-white/20')} />
        <Skeleton className={cn('h-2 w-full', isOverlay && 'bg-white/20')} />
      </div>
    );
  }

  // Nothing meaningful to show — let the appeal copy carry the surface.
  if (raisedSats <= 0 && !goalUsd) return null;

  const raisedLabel = formatCampaignAmount(raisedSats, btcPrice);

  return (
    <div
      className={cn(
        'w-full max-w-md space-y-2',
        isOverlay
          ? 'drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]'
          : 'rounded-lg border border-border bg-muted/40 p-3',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'text-xl sm:text-2xl font-bold tracking-tight',
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
        {goalUsd ? (
          <span
            className={cn(
              'shrink-0 text-xs sm:text-sm',
              isOverlay ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            {t('campaigns.home.venezuelaRelief.goalOf', { amount: formatUsdGoal(goalUsd) })}
          </span>
        ) : null}
      </div>

      {percent !== undefined && (
        <Progress
          value={percent}
          className={cn('h-2', isOverlay ? 'bg-white/25' : 'bg-foreground/15')}
        />
      )}

      {donationCount > 0 && (
        <p className={cn('text-xs', isOverlay ? 'text-white/70' : 'text-muted-foreground')}>
          {t('campaignsDetail.donationCount', { count: donationCount })}
        </p>
      )}
    </div>
  );
}

export default VenezuelaReliefGoal;
