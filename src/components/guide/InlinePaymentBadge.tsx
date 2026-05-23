import { cn } from '@/lib/utils';
import type { PaymentMode } from '@/lib/helpContent';

interface InlinePaymentBadgeProps {
  mode: PaymentMode;
  className?: string;
}

/**
 * Small inline pill that visually distinguishes the two payment options
 * a campaign can accept (public Bitcoin or silent payments) wherever
 * they're mentioned in guide copy or table headers.
 *
 * Public uses the project's primary accent (orange). Silent uses an
 * indigo tint so the two read as visually different at a glance without
 * either looking like a warning state.
 */
export function InlinePaymentBadge({ mode, className }: InlinePaymentBadgeProps) {
  const label = mode === 'public' ? 'Public' : 'Silent';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-none',
        mode === 'public'
          ? 'bg-primary/15 text-primary border border-primary/30'
          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
        className,
      )}
    >
      {label} Payments
    </span>
  );
}
