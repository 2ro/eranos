import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { renderInlineMarkup } from '@/lib/helpMarkup';
import type { GuideCalloutBlock } from '@/lib/helpContent';

const VARIANT_STYLES: Record<
  GuideCalloutBlock['variant'],
  { container: string; icon: string; title: string; Icon: LucideIcon }
> = {
  info: {
    container: 'border-sky-500/40 bg-sky-500/5',
    icon: 'text-sky-600 dark:text-sky-400',
    title: 'text-sky-700 dark:text-sky-300',
    Icon: Info,
  },
  warning: {
    container: 'border-amber-500/40 bg-amber-500/5',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-700 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  danger: {
    container: 'border-red-500/40 bg-red-500/5',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-700 dark:text-red-300',
    Icon: ShieldAlert,
  },
  success: {
    container: 'border-emerald-500/40 bg-emerald-500/5',
    icon: 'text-emerald-600 dark:text-emerald-400',
    title: 'text-emerald-700 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
};

/**
 * Tinted callout card with an icon, short title, and one-paragraph body.
 * The four variants map to common semantic intents (info, warning,
 * danger, success) and share the same layout so the page reads as a
 * consistent rhythm of blocks rather than a parade of different shapes.
 */
export function CalloutCard({ block }: { block: GuideCalloutBlock }) {
  const styles = VARIANT_STYLES[block.variant];
  const { Icon } = styles;

  return (
    <div
      className={cn(
        'rounded-xl border p-5 sm:p-6 flex gap-4',
        styles.container,
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full bg-background/70',
          styles.icon,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold leading-snug mb-1', styles.title)}>
          {renderInlineMarkup(block.title)}
        </p>
        <p className="text-sm text-foreground/85 leading-relaxed">
          {renderInlineMarkup(block.body)}
        </p>
      </div>
    </div>
  );
}
