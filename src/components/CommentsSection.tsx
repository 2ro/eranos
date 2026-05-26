import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface CommentsSectionProps {
  /**
   * Section heading rendered above the muted panel. Omit when the section
   * already lives under a higher-level header (e.g. a tab label that
   * doubles as the section title) — the panel then renders without its
   * own heading row.
   */
  title?: string;
  /** Optional count chip rendered opposite the heading. Ignored when `title` is omitted. */
  countLabel?: ReactNode;
  /**
   * Panel contents. Composer + threaded list + empty state are owned
   * by the caller — this wrapper just provides the canonical visual
   * surface so the three detail pages (campaign / community / pledge)
   * stop drifting.
   *
   * The wrap uses `bg-muted/60` with `border-primary/20` accents and
   * retints child `<article>` borders so per-note dividers read as a
   * single consistent edge color. The composer inside uses `bg-card`
   * for its own focused-surface contrast against this backdrop.
   */
  children: ReactNode;
  className?: string;
}

/**
 * Canonical visual surface for the comments section on detail pages.
 * Extracted from the previous campaign-detail-only treatment so
 * Campaigns, Communities, and Pledges all present comments inside the
 * same muted, rounded, primary-tinted panel.
 */
export function CommentsSection({ title, countLabel, children, className }: CommentsSectionProps) {
  return (
    <div className={cn('mt-4', className)}>
      {title ? (
        <div className="mb-3 px-1 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {countLabel ? (
            <span className="text-sm text-muted-foreground tabular-nums">{countLabel}</span>
          ) : null}
        </div>
      ) : null}

      {/* Muted surface wraps the composer and comment list. The wrap
          carries the outer L/R/B border so the rounded corners curve
          naturally without any 1px gaps at the join. Per-article
          `border-b` divides items. The composer's own border closes
          the top. */}
      <div className="rounded-2xl bg-muted/60 overflow-hidden border-l border-r border-primary/20 [&_article]:border-b-primary/20 [&_article]:bg-background/40">
        {children}
      </div>
    </div>
  );
}
