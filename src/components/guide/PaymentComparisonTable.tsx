import { Bell, Bug, Eye, EyeOff, Gauge, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { renderInlineMarkup } from '@/lib/helpMarkup';
import { InlinePaymentBadge } from './InlinePaymentBadge';
import type { GuidePaymentComparisonBlock } from '@/lib/helpContent';

interface Row {
  label: string;
  Icon: LucideIcon;
  public: string;
  silent: string;
}

/**
 * Row IDs and icons. Strings live in `guides.shared.paymentComparison.*`
 * in the locale files, keyed by the `id` below. Keeping icons in code
 * lets translators ignore the visual layer entirely.
 */
const DONOR_ROW_IDS: { id: string; Icon: LucideIcon }[] = [
  { id: 'whatYouSee', Icon: Eye },
  { id: 'walletSupport', Icon: Wallet },
  { id: 'privacy', Icon: ShieldCheck },
  { id: 'settlement', Icon: Gauge },
];

const RECIPIENT_ROW_IDS: { id: string; Icon: LucideIcon }[] = [
  { id: 'whatDonorsSee', Icon: Sparkles },
  { id: 'receivingSpeed', Icon: Gauge },
  { id: 'pushNotifications', Icon: Bell },
  { id: 'donorList', Icon: Eye },
  { id: 'ecosystem', Icon: Bug },
  { id: 'bestFor', Icon: ShieldCheck },
  { id: 'watchOutFor', Icon: EyeOff },
];

/**
 * Side-by-side comparison of Public Payments vs. Silent Payments.
 *
 * - Desktop (`sm:` and up): three-column grid with row labels on the
 *   left, Public tinted in primary, Silent tinted in indigo.
 * - Mobile: collapses to two stacked tinted cards (one per option) with
 *   the same row labels inside each card. No sideways scrolling.
 *
 * Row content is driven by the `audience` flag so donors and recipients
 * get row copy tuned to what they care about. All strings are read from
 * i18n keyed by audience-specific row IDs in `helpContent.ts`'s
 * structural template.
 */
export function PaymentComparisonTable({
  block,
}: {
  block: GuidePaymentComparisonBlock;
}) {
  const { t } = useTranslation();
  const rowIds = block.audience === 'donor' ? DONOR_ROW_IDS : RECIPIENT_ROW_IDS;
  const audienceKey = block.audience === 'donor' ? 'donorRows' : 'recipientRows';

  const rows: Row[] = rowIds.map(({ id, Icon }) => ({
    label: t(`guides.shared.paymentComparison.${audienceKey}.${id}.label`),
    Icon,
    public: t(`guides.shared.paymentComparison.${audienceKey}.${id}.public`),
    silent: t(`guides.shared.paymentComparison.${audienceKey}.${id}.silent`),
  }));

  const headerText = t(
    block.audience === 'donor'
      ? 'guides.shared.paymentComparison.donorHeader'
      : 'guides.shared.paymentComparison.recipientHeader',
  );

  return (
    <section>
      {/* ── Desktop: aligned 3-column grid ──────────────────────────── */}
      <div className="hidden sm:block">
        <div className="rounded-xl border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1.1fr_1fr_1fr] bg-secondary/40 border-b">
            <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {headerText}
            </div>
            <div className="px-4 py-3 border-l">
              <InlinePaymentBadge mode="public" />
            </div>
            <div className="px-4 py-3 border-l">
              <InlinePaymentBadge mode="silent" />
            </div>
          </div>
          {/* Body rows */}
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                'grid grid-cols-[1.1fr_1fr_1fr]',
                i < rows.length - 1 && 'border-b',
              )}
            >
              <div className="px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <row.Icon className="size-4 text-muted-foreground shrink-0" />
                {row.label}
              </div>
              <div className="px-4 py-3 border-l text-sm text-foreground/85 leading-snug">
                {renderInlineMarkup(row.public)}
              </div>
              <div className="px-4 py-3 border-l text-sm text-foreground/85 leading-snug">
                {renderInlineMarkup(row.silent)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile: two stacked tinted cards ───────────────────────── */}
      <div className="grid gap-3 sm:hidden">
        <PaymentStack mode="public" rows={rows} />
        <PaymentStack mode="silent" rows={rows} />
      </div>

      {block.footnote && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {renderInlineMarkup(block.footnote)}
        </p>
      )}
    </section>
  );
}

function PaymentStack({
  mode,
  rows,
}: {
  mode: 'public' | 'silent';
  rows: Row[];
}) {
  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        mode === 'public'
          ? 'border-primary/30 bg-primary/[0.04]'
          : 'border-indigo-500/30 bg-indigo-500/[0.04]',
      )}
    >
      <div className="px-4 py-3 border-b border-inherit">
        <InlinePaymentBadge mode={mode} />
      </div>
      <dl className="divide-y divide-border/60">
        {rows.map((row) => (
          <div key={row.label} className="px-4 py-3">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <row.Icon className="size-3.5 shrink-0" />
              {row.label}
            </dt>
            <dd className="mt-1 text-sm text-foreground/85 leading-snug">
              {renderInlineMarkup(mode === 'public' ? row.public : row.silent)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
