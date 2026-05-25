import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PendingBadgeProps {
  /**
   * Optional formatted amount (e.g. "$1.23"). When present the badge reads
   * "{amount} pending"; when omitted it reads just "pending".
   */
  amountLabel?: string;
  /** Additional classes appended to the base styling. */
  className?: string;
}

/**
 * Small orange inline indicator used wherever a Bitcoin amount is awaiting
 * mempool confirmation — currently on the wallet headline and on campaign
 * donation surfaces. Centralised so the visual treatment (orange + spinning
 * RefreshCw) stays consistent across pages.
 */
export function PendingBadge({ amountLabel, className }: PendingBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400',
        className,
      )}
    >
      <RefreshCw className="size-3 animate-spin" />
      {amountLabel
        ? t('wallet.amountPending', { amount: amountLabel })
        : t('wallet.pending')}
    </span>
  );
}
