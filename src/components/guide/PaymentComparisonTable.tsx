import { Bell, Bug, Eye, EyeOff, Gauge, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

const DONOR_ROWS: Row[] = [
  {
    label: 'What you see',
    Icon: Eye,
    public: 'A regular Bitcoin address you can pay from anywhere.',
    silent:
      'The same QR. Your wallet picks the silent-payment endpoint if it supports BIP-352.',
  },
  {
    label: 'Wallet support',
    Icon: Wallet,
    public:
      'Every Bitcoin wallet. Cash App, Coinbase, Strike, hardware, anything.',
    silent:
      'Few wallets today. Most fall back to a regular Bitcoin transaction.',
  },
  {
    label: 'Privacy of the donation',
    Icon: ShieldCheck,
    public:
      'Public on-chain. Your sending address is permanently linked to the campaign.',
    silent:
      "Receiving side is unlinkable on-chain. Your sending wallet's trail is still public.",
  },
  {
    label: 'Settlement',
    Icon: Gauge,
    public: 'Normal Bitcoin confirmations.',
    silent:
      'Same on-chain confirmations, but the activist has to scan their wallet to find it.',
  },
];

const ACTIVIST_ROWS: Row[] = [
  {
    label: 'What donors see',
    Icon: Sparkles,
    public:
      'A regular Bitcoin address. Works with every wallet on earth.',
    silent:
      "A BIP-352 endpoint. Donors' wallets need silent-payments support; otherwise the donation falls back to a regular Bitcoin transaction.",
  },
  {
    label: 'Receiving speed',
    Icon: Gauge,
    public: 'Push-style. Donations show up immediately on the campaign page.',
    silent:
      'Manual scanning. Your wallet has to walk the blockchain looking for them. Minutes to hours, depending on the wallet.',
  },
  {
    label: 'Push notifications',
    Icon: Bell,
    public: 'Yes. You see new donations the moment they arrive.',
    silent: 'No. Open the wallet and trigger a scan to discover them.',
  },
  {
    label: 'Donor list / campaign totals',
    Icon: Eye,
    public:
      'Public forever. Amounts and sending addresses are visible to anyone.',
    silent:
      "Private. The campaign page can't show silent-payments donation counts or totals.",
  },
  {
    label: 'Ecosystem maturity',
    Icon: Bug,
    public: 'Mature. Settled tooling.',
    silent:
      'Bleeding-edge. Wallets are still buggy; expect missed payments that show up on a later scan.',
  },
  {
    label: 'Best for',
    Icon: ShieldCheck,
    public:
      'Above-ground fundraisers where social proof and visibility help.',
    silent:
      'Campaigns where donor or activist privacy matters more than the visible total.',
  },
  {
    label: 'Watch out for',
    Icon: EyeOff,
    public: 'Permanent public record of every donor.',
    silent:
      "Bumpy UX today. Some donations won't show until the activist scans.",
  },
];

/**
 * Side-by-side comparison of Public Payments vs. Silent Payments.
 *
 * - Desktop (`sm:` and up): three-column grid with row labels on the
 *   left, Public tinted in primary, Silent tinted in indigo.
 * - Mobile: collapses to two stacked tinted cards (one per option) with
 *   the same row labels inside each card. No sideways scrolling.
 *
 * Row content is driven by the `audience` flag so donors and activists
 * get row copy tuned to what they care about.
 */
export function PaymentComparisonTable({
  block,
}: {
  block: GuidePaymentComparisonBlock;
}) {
  const rows = block.audience === 'donor' ? DONOR_ROWS : ACTIVIST_ROWS;

  return (
    <section>
      {/* ── Desktop: aligned 3-column grid ──────────────────────────── */}
      <div className="hidden sm:block">
        <div className="rounded-xl border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1.1fr_1fr_1fr] bg-secondary/40 border-b">
            <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {block.audience === 'donor' ? 'When you donate' : 'When you create'}
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
