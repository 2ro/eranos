import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { CampaignCard } from '@/components/CampaignCard';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useReorderCampaign } from '@/hooks/useReorderCampaign';
import { useToast } from '@/hooks/useToast';
import type { ParsedCampaign } from '@/lib/campaign';
import { cn } from '@/lib/utils';

import { ReorderProvider } from './ReorderProvider';

interface ReorderableCampaignGridProps {
  campaigns: ParsedCampaign[];
  /** Grid class. Caller passes the exact `grid grid-cols-…` it needs. */
  gridClassName: string;
  /**
   * Custom card renderer. Defaults to the standard `CampaignCard`.
   * The Featured row uses a custom renderer for its single-/multi-
   * column variant logic.
   */
  renderCard?: (campaign: ParsedCampaign, index: number) => ReactNode;
  /**
   * Optional per-item wrapper class (driven by display index, after
   * any optimistic reorder). The Featured row uses this to make the
   * first two cards span two columns on wider breakpoints so they
   * read as "large" hero placements above a 4-up tail.
   */
  itemClassName?: (index: number) => string;
}

/**
 * Drop-in replacement for a plain grid of `CampaignCard`s that
 * lets moderators reorder the Featured row.
 *
 * - **Non-moderators**: identical to a plain grid. No DnD listeners,
 *   no context provider, no extra DOM. The component is cheap enough
 *   to drop into every campaign grid.
 * - **Moderators on desktop**: each card is wrapped in a native
 *   HTML5 `draggable` div. Dropping on another card publishes a new
 *   `featured` label with a rank computed from the new neighbors
 *   (see `useReorderCampaign.moveTo`). One label per drop — no
 *   batch publish, no neighbor re-stamping.
 * - **Moderators on mobile**: drag is disabled (touch DnD without a
 *   library is unreliable and we don't ship one), but the moderator
 *   kebab gets Move up / Move down / Move to top rows via the
 *   `ReorderProvider` context. Same publish path, different trigger.
 *
 * Optimistic local order:
 *
 * Republishing a label invalidates the moderation query and the
 * campaign list query, which means React refetches both before the
 * grid can re-sort. Until those resolve we'd render the campaign in
 * its OLD position, then jerk to the new one when the new label
 * arrives. To smooth that out we hold an `optimisticOrder` of coords
 * that takes precedence over the incoming campaign list until the
 * authoritative order matches.
 */
export function ReorderableCampaignGrid({
  campaigns,
  gridClassName,
  renderCard,
  itemClassName,
}: ReorderableCampaignGridProps) {
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const isMobile = useIsMobile();
  const reorder = useReorderCampaign();
  const { t } = useTranslation();
  const { toast } = useToast();

  // Optimistic order: coords in the desired display order, set by a
  // successful move and cleared once the authoritative `campaigns`
  // prop converges on the same sequence. The ref backs an effectful
  // comparison against incoming props.
  const [optimisticCoords, setOptimisticCoords] = useState<readonly string[] | null>(null);

  // Compute the displayed campaign list. If we have an optimistic
  // order and every coord in it is still in `campaigns`, render in
  // that order — otherwise fall through to the authoritative list.
  const byCoord = useMemo(() => {
    const m = new Map<string, ParsedCampaign>();
    for (const c of campaigns) m.set(c.aTag, c);
    return m;
  }, [campaigns]);

  const displayed = useMemo<ParsedCampaign[]>(() => {
    if (!optimisticCoords) return campaigns;
    const optimisticList = optimisticCoords
      .map((coord) => byCoord.get(coord))
      .filter((c): c is ParsedCampaign => !!c);
    // If the optimistic list lost a campaign (e.g. it was hidden in
    // the meantime), abandon optimism and fall back to authoritative.
    if (optimisticList.length !== optimisticCoords.length) return campaigns;
    return optimisticList;
  }, [optimisticCoords, byCoord, campaigns]);

  // Compare the displayed coord sequence to the authoritative one;
  // when they match, drop the optimistic override so future
  // moderation updates (from any mod, not just us) are reflected
  // immediately.
  const displayedCoords = useMemo(() => displayed.map((c) => c.aTag), [displayed]);
  const authoritativeCoords = useMemo(() => campaigns.map((c) => c.aTag), [campaigns]);
  if (
    optimisticCoords &&
    authoritativeCoords.length === optimisticCoords.length &&
    authoritativeCoords.every((c, i) => c === optimisticCoords[i])
  ) {
    // Authoritative caught up — clear the override. Calling setState
    // during render is fine here because it's idempotent and
    // bails out on the second pass.
    queueMicrotask(() => setOptimisticCoords(null));
  }

  /**
   * Wraps a reorder mutation: optimistically reorders locally, then
   * publishes. Failure rolls back. The signature takes the
   * already-mutated coord list (computed in the caller) so the move
   * logic stays in one place per operation.
   */
  const applyOptimisticThenPublish = useCallback(
    async (newCoords: string[], publish: () => Promise<void>) => {
      const prev = optimisticCoords;
      setOptimisticCoords(newCoords);
      try {
        await publish();
      } catch (err) {
        // Roll back to whatever order we had before (or to
        // authoritative, by clearing). Toast goes through the
        // moderation menu's runReorder for menu-driven moves;
        // drag-and-drop has its own toast below.
        setOptimisticCoords(prev);
        throw err;
      }
    },
    [optimisticCoords],
  );

  const onMoveToTop = useCallback(
    async (coord: string) => {
      const idx = displayedCoords.indexOf(coord);
      if (idx <= 0) return;
      const next = [coord, ...displayedCoords.filter((c) => c !== coord)];
      await applyOptimisticThenPublish(next, () => reorder.moveToTop(coord, displayedCoords));
    },
    [displayedCoords, applyOptimisticThenPublish, reorder],
  );

  const onMoveUp = useCallback(
    async (coord: string) => {
      const idx = displayedCoords.indexOf(coord);
      if (idx <= 0) return;
      const next = [...displayedCoords];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      await applyOptimisticThenPublish(next, () => reorder.moveUp(coord, displayedCoords));
    },
    [displayedCoords, applyOptimisticThenPublish, reorder],
  );

  const onMoveDown = useCallback(
    async (coord: string) => {
      const idx = displayedCoords.indexOf(coord);
      if (idx < 0 || idx >= displayedCoords.length - 1) return;
      const next = [...displayedCoords];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      await applyOptimisticThenPublish(next, () => reorder.moveDown(coord, displayedCoords));
    },
    [displayedCoords, applyOptimisticThenPublish, reorder],
  );

  // Generic "drop at index" used by drag-and-drop. Success is its
  // own visual feedback (the card snaps into place via the
  // optimistic order), so we only toast on failure.
  const onMoveTo = useCallback(
    async (coord: string, toIndex: number) => {
      const fromIndex = displayedCoords.indexOf(coord);
      if (fromIndex < 0 || fromIndex === toIndex) return;
      const next = [...displayedCoords];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, coord);
      try {
        await applyOptimisticThenPublish(next, () =>
          reorder.moveTo(coord, displayedCoords, toIndex),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: t('moderation.menu.failedReorder'),
          description: msg,
          variant: 'destructive',
        });
      }
    },
    [displayedCoords, applyOptimisticThenPublish, reorder, toast, t],
  );

  const renderItem = useCallback(
    (campaign: ParsedCampaign, index: number) => renderCard?.(campaign, index) ?? <CampaignCard campaign={campaign} />,
    [renderCard],
  );

  // Non-mods: plain grid, no DnD, no context. Branch out early so we
  // don't pay any of the moderator-only cost (the moderation cache
  // is already gated separately in `ModerationOverlay`).
  if (!isMod) {
    return (
      <div className={gridClassName}>
        {displayed.map((campaign, idx) => (
          <div key={campaign.aTag} className={itemClassName?.(idx)}>{renderItem(campaign, idx)}</div>
        ))}
      </div>
    );
  }

  // Moderators: provide reorder context (for the kebab menu rows)
  // and, on desktop, wrap each card in a `DraggableCard`. The
  // wrapper handles its own dragover/drop styling.
  return (
    <ReorderProvider
      coords={displayedCoords}
      onMoveToTop={onMoveToTop}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    >
      <div className={gridClassName}>
        {displayed.map((campaign, idx) =>
          isMobile ? (
            <div key={campaign.aTag} className={itemClassName?.(idx)}>{renderItem(campaign, idx)}</div>
          ) : (
            <DraggableCard
              key={campaign.aTag}
              index={idx}
              coord={campaign.aTag}
              onDropAt={(droppedCoord) => onMoveTo(droppedCoord, idx)}
              className={itemClassName?.(idx)}
            >
              {renderItem(campaign, idx)}
            </DraggableCard>
          ),
        )}
      </div>
    </ReorderProvider>
  );
}

/**
 * HTML5-DnD wrapper for a single grid item. No external library — a
 * grid of 12-50 cards is well within native DnD's comfortable range.
 *
 * Drag semantics:
 *
 *  - Only the dedicated **drag handle** (six-dot button, top-left of
 *    the card on hover) is `draggable`. The card itself stays a
 *    plain `<Link>` so a click anywhere else still navigates to the
 *    campaign — making the whole card draggable would swallow that.
 *  - `dragstart` on the handle stashes the source coord on
 *    `dataTransfer`.
 *  - The wrapper handles `dragover` + `drop` so the user can target
 *    any part of a destination card, not just the destination
 *    handle.
 *  - `dragover` calls `preventDefault` (otherwise drop never fires)
 *    and adds a brief ring outline.
 *  - `drop` reads the source coord and calls `onDropAt`.
 *
 * The wrapper does NOT try to visually relocate the card during
 * dragover — the parent's optimistic reorder snaps the grid into
 * the new order on drop.
 */
function DraggableCard({
  index,
  coord,
  onDropAt,
  className,
  children,
}: {
  index: number;
  coord: string;
  onDropAt: (sourceCoord: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'relative group/drag motion-safe:transition-shadow',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl shadow-lg',
        className,
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/x-agora-campaign-coord')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        const sourceCoord = e.dataTransfer.getData('text/x-agora-campaign-coord');
        setIsOver(false);
        if (!sourceCoord || sourceCoord === coord) return;
        e.preventDefault();
        onDropAt(sourceCoord);
      }}
    >
      {/* Drag handle — top-left so it never collides with the
          existing moderator kebab in the top-right. The button
          itself carries `draggable`, not the wrapper, so clicking
          anywhere else on the card still navigates the `<Link>`.
          Visible on hover and on keyboard focus. */}
      <div
        role="button"
        tabIndex={0}
        draggable
        aria-label={t('moderation.menu.dragHandle', { index: index + 1 })}
        title={t('moderation.menu.dragHandle', { index: index + 1 })}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/x-agora-campaign-coord', coord);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          // Don't let the click bubble up to the underlying `<Link>`.
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          // Same as click: a handle press shouldn't fire the link.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="absolute top-3 left-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur text-muted-foreground opacity-0 group-hover/drag:opacity-100 focus-visible:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing motion-safe:transition-opacity"
      >
        <DragHandleIcon />
      </div>
      {children}
    </div>
  );
}

/** Six-dot grip icon. Pure SVG to avoid pulling another lucide import. */
function DragHandleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="3" r="1.4" />
      <circle cx="11" cy="3" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  );
}
