import { useCallback } from 'react';

import { useCampaignModeration } from './useCampaignModeration';
import type { ModerationLabel } from '@/lib/agoraModeration';

/**
 * Reordering axis. Featured uses the `featured` axis; the Community
 * Campaigns grid uses the `approval` axis. Both surfaces sort by the
 * `created_at` of the latest label on their axis, newest first.
 */
export type ReorderAxis = 'featured' | 'approval';

/** Maps a reorder axis to the `ModerationLabel` we publish to bump it. */
function axisToLabel(axis: ReorderAxis): ModerationLabel {
  return axis === 'featured' ? 'featured' : 'approved';
}

/**
 * Reordering implemented entirely on top of the existing kind-1985
 * moderation labels (no new tags, no new kind). The sort key is the
 * label's `created_at` newest-first; "moving" a campaign means
 * republishing its label with a chosen `created_at` that lands the
 * campaign at the desired position in the displayed list.
 *
 * All operations take the **currently displayed ordered list** as
 * input and reference it to compute the new `created_at`:
 *
 * - `moveToTop` — publish with `now`, or `max(orderTimestamps) + 1` if
 *   any existing label is somehow already at `now` or beyond.
 * - `moveUp` — publish with `prevNeighbor.t + 1`. The "+1" is what
 *   crosses the boundary; the previous neighbor's timestamp is the
 *   smallest one strictly greater than ours, so beating it by one
 *   second is sufficient.
 * - `moveDown` — publish with `nextNeighbor.t - 1`. Same logic
 *   inverted; we want to fall just below the item directly beneath us.
 * - `moveTo(toIndex)` — generalizes the three: figures out the new
 *   neighbors after the move, picks a timestamp between them, and
 *   publishes once.
 *
 * **Conflict model** matches the rest of the axis: the newest label
 * per `(coord, axis)` wins regardless of moderator. If two mods
 * reorder concurrently, whoever's publish lands later "wins" — same
 * trust model the rest of the moderation system already uses.
 *
 * **Why timestamps and not a rank tag.** Encoding the order in the
 * label's `created_at` keeps the protocol surface unchanged: every
 * relay, every reader, every existing label cache already sorts
 * correctly without learning a new tag. The downside is that we burn
 * 1-second resolution per reorder operation; for a moderator-driven
 * UI with handful-of-items lists this is comfortably below the rate
 * at which reorders happen.
 */
export function useReorderCampaign() {
  const { moderate, data: moderation } = useCampaignModeration();

  /**
   * Returns the `created_at` of the latest label on `axis` for `coord`,
   * or `undefined` if no such label exists yet (the campaign was never
   * approved / featured before).
   */
  const orderTimestamp = useCallback(
    (coord: string, axis: ReorderAxis): number | undefined => {
      const map = axis === 'featured' ? moderation.featuredOrder : moderation.approvedOrder;
      return map.get(coord);
    },
    [moderation],
  );

  /**
   * Publishes a label on `axis` for `coord` with an explicit
   * `created_at`. We piggyback on `useCampaignModeration().moderate`
   * which already handles the relay invalidation and the campaign
   * coord prefix check.
   */
  const publishAt = useCallback(
    async (coord: string, axis: ReorderAxis, createdAt: number) => {
      await moderate.mutateAsync({
        coord,
        action: axisToLabel(axis),
        createdAt,
      });
    },
    [moderate],
  );

  /**
   * Move `coord` to the top of the displayed list.
   *
   * `displayedList` is the ordered coords currently rendered to the
   * user. We need it to defend against a clock-skewed label that's
   * somehow already in the future — we always end up strictly above
   * the current top.
   */
  const moveToTop = useCallback(
    async (coord: string, axis: ReorderAxis, displayedList: readonly string[]) => {
      const now = Math.floor(Date.now() / 1000);
      const map = axis === 'featured' ? moderation.featuredOrder : moderation.approvedOrder;
      const topCoord = displayedList[0];
      const topTs = topCoord && topCoord !== coord ? map.get(topCoord) ?? 0 : 0;
      const newTs = Math.max(now, topTs + 1);
      await publishAt(coord, axis, newTs);
    },
    [moderation, publishAt],
  );

  /**
   * Move `coord` up by one position in the displayed list. No-op when
   * the item is already at the top.
   */
  const moveUp = useCallback(
    async (coord: string, axis: ReorderAxis, displayedList: readonly string[]) => {
      const idx = displayedList.indexOf(coord);
      if (idx <= 0) return;
      if (idx === 1) {
        // The neighbor above is the current top; just go to top.
        await moveToTop(coord, axis, displayedList);
        return;
      }
      const map = axis === 'featured' ? moderation.featuredOrder : moderation.approvedOrder;
      const aboveCoord = displayedList[idx - 1];
      const aboveTs = map.get(aboveCoord);
      if (aboveTs === undefined) {
        // Shouldn't happen for items currently in the displayed list,
        // but degrade to "move to top" rather than throw.
        await moveToTop(coord, axis, displayedList);
        return;
      }
      await publishAt(coord, axis, aboveTs + 1);
    },
    [moderation, publishAt, moveToTop],
  );

  /**
   * Move `coord` down by one position. No-op when already at the
   * bottom.
   */
  const moveDown = useCallback(
    async (coord: string, axis: ReorderAxis, displayedList: readonly string[]) => {
      const idx = displayedList.indexOf(coord);
      if (idx < 0 || idx >= displayedList.length - 1) return;
      const map = axis === 'featured' ? moderation.featuredOrder : moderation.approvedOrder;
      const belowCoord = displayedList[idx + 1];
      const belowTs = map.get(belowCoord);
      if (belowTs === undefined) return;
      // Subtract 1s to land strictly below the next item. The next
      // item's existing neighbor timestamp is some other value (or
      // nothing) — we don't need to touch it because we're only
      // crossing one boundary.
      await publishAt(coord, axis, belowTs - 1);
    },
    [moderation, publishAt],
  );

  /**
   * General-purpose move: relocate `coord` to `toIndex` in the
   * displayed list. Used by drag-and-drop. Computes a timestamp
   * between the new neighbors (if any) and publishes a single label.
   *
   * The chosen timestamp is `min(prev.t, now) - 1` when there's no
   * `next`, or `next.t + 1` when there's no `prev`, or
   * `Math.floor((prev.t + next.t) / 2)` when both exist and the gap
   * is at least 2 seconds. If the gap is too tight (< 2s) we fall
   * back to `prev.t + 1` and accept the off-by-one (only the moved
   * item ends up out of position by sub-second, which the next render
   * fixes when the new label arrives).
   */
  const moveTo = useCallback(
    async (
      coord: string,
      axis: ReorderAxis,
      displayedList: readonly string[],
      toIndex: number,
    ) => {
      const fromIndex = displayedList.indexOf(coord);
      if (fromIndex < 0) return;
      const clamped = Math.max(0, Math.min(toIndex, displayedList.length - 1));
      if (clamped === fromIndex) return;

      // Build the list without `coord`, then identify the items that
      // will sit directly above and below `coord` after insertion at
      // `clamped`.
      const without = displayedList.filter((c) => c !== coord);
      const prevCoord = clamped > 0 ? without[clamped - 1] : undefined;
      const nextCoord = clamped < without.length ? without[clamped] : undefined;

      const map = axis === 'featured' ? moderation.featuredOrder : moderation.approvedOrder;
      const now = Math.floor(Date.now() / 1000);
      const prevTs = prevCoord ? map.get(prevCoord) : undefined;
      const nextTs = nextCoord ? map.get(nextCoord) : undefined;

      let newTs: number;
      if (prevTs === undefined && nextTs === undefined) {
        newTs = now;
      } else if (prevTs === undefined) {
        // Moving to position 0: stay above current top.
        newTs = Math.max(now, (nextTs ?? 0) + 1);
      } else if (nextTs === undefined) {
        // Moving to bottom: stay below current bottom but ≥ 1.
        newTs = Math.max(1, prevTs - 1);
      } else if (prevTs - nextTs >= 2) {
        newTs = Math.floor((prevTs + nextTs) / 2);
      } else {
        // Tight gap: nudge above next. The displayed list refreshes
        // from the new label, so any sub-second mis-ordering self-
        // corrects on the next render.
        newTs = nextTs + 1;
      }

      await publishAt(coord, axis, newTs);
    },
    [moderation, publishAt],
  );

  return {
    moveToTop,
    moveUp,
    moveDown,
    moveTo,
    orderTimestamp,
    isPending: moderate.isPending,
  };
}
