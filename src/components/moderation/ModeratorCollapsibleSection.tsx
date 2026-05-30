import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ModeratorCollapsibleSectionProps {
  /** Section icon, rendered inline with the heading. */
  icon: ReactNode;
  /** Section heading. */
  title: string;
  /** One-line subhead under the heading. */
  description: string;
  /** Number of items rendered in this section. Drives the count chip
   *  and the "auto-open when short" heuristic. */
  count: number;
  /** Whether the underlying data is still loading. */
  isLoading: boolean;
  /** Copy shown in the empty-state card when `count === 0`. */
  emptyText: string;
  /** Skeleton grid rendered while `isLoading && count === 0`. */
  skeleton: ReactNode;
  /** The actual grid of cards. Caller chooses the grid layout so the
   *  section adapts to per-surface card sizes. */
  children: ReactNode;
  /** Optional tighter heading variant for pages whose other sections
   *  already use the smaller scale (CommunitiesPage). */
  size?: 'default' | 'compact';
  /** Optional horizontal padding override for embedded layouts. The
   *  CommunitiesPage variant wraps the section inside a card list that
   *  manages its own padding, so the trigger needs `px-4 sm:px-6` to
   *  align with the rest of the page. CampaignsPage / ActionsPage
   *  pages render this inside an already-padded `<main>` and pass no
   *  override. */
  triggerPaddingClassName?: string;
  /**
   * Explicit initial open state. When omitted, the section auto-opens
   * for short queues (`count <= 6`) and collapses for long ones —
   * the legacy heuristic.
   *
   * Pass `false` to force the section closed on first render
   * regardless of count (e.g. the Hidden queue on the home page,
   * where mods want to scan Pending first and only dig into Hidden
   * when needed).
   */
  defaultOpen?: boolean;
}

/**
 * Collapsible moderator-only review queue used by the campaigns,
 * pledges, and communities index pages. Renders a heading + count chip
 * + ChevronDown trigger; the body auto-expands when the list is short
 * (≤ 6 items) and starts collapsed when long.
 *
 * Visually identical across the three surfaces so moderators see the
 * same "Pending / Hidden" affordance everywhere.
 */
export function ModeratorCollapsibleSection({
  icon,
  title,
  description,
  count,
  isLoading,
  emptyText,
  skeleton,
  children,
  size = 'default',
  triggerPaddingClassName,
  defaultOpen,
}: ModeratorCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? count <= 6);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="space-y-5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-end justify-between gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              triggerPaddingClassName,
            )}
          >
            <div>
              <h2
                className={cn(
                  'font-bold tracking-tight inline-flex items-center gap-2',
                  size === 'default' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl',
                )}
              >
                <span className="text-muted-foreground">{icon}</span>
                {title}
                <span
                  className={cn(
                    'font-medium text-muted-foreground',
                    size === 'default' ? 'text-base' : 'text-sm',
                  )}
                >
                  ({count})
                </span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
            </div>
            <ChevronDown
              className={cn(
                'size-5 text-muted-foreground motion-safe:transition-transform shrink-0',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {isLoading && count === 0 ? (
            skeleton
          ) : count === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {emptyText}
              </CardContent>
            </Card>
          ) : (
            children
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
