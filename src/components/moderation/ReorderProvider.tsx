import { useMemo } from 'react';

import type { ReorderAxis } from '@/hooks/useReorderCampaign';
import {
  ReorderContext,
  type ReorderContextValue,
  type ReorderEntry,
} from './reorderContext';

/**
 * Provides reorder controls to every descendant `ModerationOverlay`.
 * `ReorderableCampaignGrid` mounts this with its computed lookup;
 * non-reorderable grids simply don't mount it and the moderator
 * kebab renders without the move rows.
 *
 * The provider builds a per-coord lookup once per render of the
 * list; consumers look up their own coord and feed the result into
 * the moderation menu's optional `reorder` prop. Using a context
 * (rather than props through `CampaignCard`) keeps the card itself
 * unaware of list positioning concerns — any future grid can
 * publish its own reorder context without touching the card.
 */
export function ReorderProvider({
  axis,
  coords,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  children,
}: {
  axis: ReorderAxis;
  coords: readonly string[];
  onMoveToTop: (coord: string) => Promise<void> | void;
  onMoveUp: (coord: string) => Promise<void> | void;
  onMoveDown: (coord: string) => Promise<void> | void;
  children: React.ReactNode;
}) {
  const value = useMemo<ReorderContextValue>(() => {
    const byCoord = new Map<string, ReorderEntry>();
    coords.forEach((coord, idx) => {
      byCoord.set(coord, {
        canMoveUp: idx > 0,
        canMoveDown: idx < coords.length - 1,
        onMoveToTop: () => onMoveToTop(coord),
        onMoveUp: () => onMoveUp(coord),
        onMoveDown: () => onMoveDown(coord),
      });
    });
    return { axis, byCoord };
  }, [axis, coords, onMoveToTop, onMoveUp, onMoveDown]);

  return <ReorderContext.Provider value={value}>{children}</ReorderContext.Provider>;
}
