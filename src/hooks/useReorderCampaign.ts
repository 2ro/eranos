import { useCallback } from 'react';

import { useCampaignModeration } from './useCampaignModeration';

/**
 * Multiplier that lifts a freshly-stamped rank into the
 * microseconds-since-epoch range. Reorder publishes start from
 * `Date.now() * RANK_SCALE`, which is several orders of magnitude
 * above any legacy `created_at` fallback (seconds-since-epoch) — so
 * a newly-reordered campaign always sits above un-reordered legacy
 * neighbors. The fine-grained sub-second resolution also leaves
 * ample room for inserting midpoint ranks during drag-to-position
 * without exhausting the integer gap.
 *
 * Headroom check: `Date.now() * 1000 ≈ 1.7e15`; `Number.MAX_SAFE_INTEGER
 * ≈ 9e15`. ~150 years before overflow concerns.
 */
const RANK_SCALE = 1_000;

/** A fresh "place at the top" rank, in the scaled space. */
function freshRank(): number {
  return Date.now() * RANK_SCALE;
}

/**
 * Reordering is implemented via a `["rank", "<number>"]` tag on
 * kind 1985 `featured` labels. The fold reads the rank as the sort
 * key (descending), falling back to `created_at` when the rank tag
 * is absent — so labels published before this feature existed (and
 * any normal feature actions that don't carry a rank) continue to
 * sort sensibly.
 *
 * Why a tag and not the label's `created_at` directly: the fold
 * always picks the newest-`created_at` event per `(coord, axis)`.
 * If we encoded order in `created_at`, "move down" — which needs a
 * lower sort key than the existing label — would have to publish a
 * label with an *older* `created_at`. That label would lose the
 * fold to the existing one and the move would silently revert.
 * Decoupling the sort key from `created_at` lets reorders always
 * publish with `created_at = now` so the fold always picks them up.
 *
 * Operations:
 *
 * - `moveToTop` — publish with `rank = max(now_scaled, topRank + 1)`.
 *   The `max` guard handles a (rare) clock-skewed neighbor whose
 *   stored rank is somehow already above `now_scaled`.
 * - `moveUp` — publish with `rank = aboveNeighbor.rank + 1`. The
 *   "+1" is what crosses the boundary; the neighbor above already
 *   has the smallest rank strictly greater than ours so beating it
 *   by one is sufficient.
 * - `moveDown` — publish with `rank = belowNeighbor.rank - 1`.
 *   Inverse of moveUp.
 * - `moveTo(toIndex)` — pick a rank between the new neighbors. With
 *   millisecond-scaled ranks there's almost always plenty of gap;
 *   for legacy seconds-scaled neighbors the gap is still wide
 *   enough for many midpoint inserts.
 *
 * Conflict model: identical to the rest of the moderation
 * namespace. The newest label per `(coord, axis)` from any
 * moderator wins. Concurrent reorders resolve to whoever's publish
 * lands later.
 */
export function useReorderCampaign() {
  const { moderate, data: moderation } = useCampaignModeration();

  /**
   * Publishes a `featured` label for `coord` carrying an explicit
   * rank. `useCampaignModeration().moderate` handles the relay
   * invalidations and the campaign coord-prefix check; the rank is
   * written into a `["rank", "<number>"]` tag on the label event.
   */
  const publishWithRank = useCallback(
    async (coord: string, rank: number) => {
      await moderate.mutateAsync({
        coord,
        action: 'featured',
        rank,
      });
    },
    [moderate],
  );

  /** Move `coord` to position 0 of the displayed list. */
  const moveToTop = useCallback(
    async (coord: string, displayedList: readonly string[]) => {
      const map = moderation.featuredOrder;
      const topCoord = displayedList[0];
      const topRank = topCoord && topCoord !== coord ? map.get(topCoord) ?? 0 : 0;
      const newRank = Math.max(freshRank(), topRank + 1);
      await publishWithRank(coord, newRank);
    },
    [moderation, publishWithRank],
  );

  /**
   * Move `coord` up by one position. No-op when the item is already
   * at the top.
   */
  const moveUp = useCallback(
    async (coord: string, displayedList: readonly string[]) => {
      const idx = displayedList.indexOf(coord);
      if (idx <= 0) return;
      if (idx === 1) {
        // The neighbor above is the current top; just go to top.
        await moveToTop(coord, displayedList);
        return;
      }
      const map = moderation.featuredOrder;
      const aboveCoord = displayedList[idx - 1];
      const aboveRank = map.get(aboveCoord);
      if (aboveRank === undefined) {
        // Shouldn't happen for items currently in the displayed list,
        // but degrade to "move to top" rather than throw.
        await moveToTop(coord, displayedList);
        return;
      }
      await publishWithRank(coord, aboveRank + 1);
    },
    [moderation, publishWithRank, moveToTop],
  );

  /** Move `coord` down by one position. */
  const moveDown = useCallback(
    async (coord: string, displayedList: readonly string[]) => {
      const idx = displayedList.indexOf(coord);
      if (idx < 0 || idx >= displayedList.length - 1) return;
      const map = moderation.featuredOrder;
      const belowCoord = displayedList[idx + 1];
      const belowRank = map.get(belowCoord);
      if (belowRank === undefined) return;
      await publishWithRank(coord, belowRank - 1);
    },
    [moderation, publishWithRank],
  );

  /**
   * Generalized move: relocate `coord` to `toIndex` in the displayed
   * list. Used by drag-and-drop. Picks a rank between the new
   * neighbors and publishes once.
   */
  const moveTo = useCallback(
    async (
      coord: string,
      displayedList: readonly string[],
      toIndex: number,
    ) => {
      const fromIndex = displayedList.indexOf(coord);
      if (fromIndex < 0) return;
      const clamped = Math.max(0, Math.min(toIndex, displayedList.length - 1));
      if (clamped === fromIndex) return;

      // Build the list without `coord`, then identify the items that
      // sit directly above and below `coord` after insertion.
      const without = displayedList.filter((c) => c !== coord);
      const prevCoord = clamped > 0 ? without[clamped - 1] : undefined;
      const nextCoord = clamped < without.length ? without[clamped] : undefined;

      const map = moderation.featuredOrder;
      const prevRank = prevCoord ? map.get(prevCoord) : undefined;
      const nextRank = nextCoord ? map.get(nextCoord) : undefined;

      let newRank: number;
      if (prevRank === undefined && nextRank === undefined) {
        newRank = freshRank();
      } else if (prevRank === undefined) {
        // Moving to position 0: stay above current top.
        newRank = Math.max(freshRank(), (nextRank ?? 0) + 1);
      } else if (nextRank === undefined) {
        // Moving to last slot: stay below current bottom but keep
        // headroom — `prevRank - 1` is safe because ranks are
        // milliseconds-of-publish-time (so a 1-unit step is a
        // sub-millisecond fraction of the typical inter-rank gap).
        newRank = prevRank - 1;
      } else if (prevRank - nextRank >= 2) {
        // Pick the midpoint. With millisecond-scaled ranks the
        // typical gap is millions; midpoint is exact integer
        // arithmetic with plenty of room for future inserts.
        newRank = Math.floor((prevRank + nextRank) / 2);
      } else {
        // Tight gap (1 unit). Nudge above next and accept the
        // off-by-one — the fold's refetch will surface the new
        // ordering and any subsequent moves recompute from the
        // refreshed map.
        newRank = nextRank + 1;
      }

      await publishWithRank(coord, newRank);
    },
    [moderation, publishWithRank],
  );

  return {
    moveToTop,
    moveUp,
    moveDown,
    moveTo,
    isPending: moderate.isPending,
  };
}
