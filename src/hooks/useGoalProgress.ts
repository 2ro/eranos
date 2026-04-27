import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { extractZapAmount, extractZapSender } from '@/hooks/useEventInteractions';

export interface GoalProgress {
  /** Total zapped in millisatoshis. */
  currentMsat: number;
  /** Total zapped in satoshis. */
  currentSats: number;
  /** Target in millisatoshis. */
  targetMsat: number;
  /** Target in satoshis. */
  targetSats: number;
  /** Percentage funded (0–100, capped at 100). */
  percentage: number;
  /** Unique contributor pubkeys. */
  contributors: string[];
  /** Number of individual zap receipts. */
  zapCount: number;
}

/**
 * Queries kind 9735 zap receipts targeting a goal event and tallies the progress.
 * Respects the goal's `closed_at` deadline — receipts after the cutoff are excluded.
 */
export function useGoalProgress(
  goalEventId: string | undefined,
  targetMsat: number,
  closedAt?: number,
) {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['goal-progress', goalEventId],
    queryFn: async (c) => {
      if (!goalEventId) {
        return { receipts: [] as { msats: number; sender: string; createdAt: number }[] };
      }
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const receipts = await nostr.query(
        [{ kinds: [9735], '#e': [goalEventId], limit: 500 }],
        { signal },
      );

      return {
        receipts: receipts.map((r) => ({
          msats: extractZapAmount(r),
          sender: extractZapSender(r),
          createdAt: r.created_at,
        })),
      };
    },
    enabled: !!goalEventId,
    staleTime: 30_000,
  });

  const progress = useMemo((): GoalProgress => {
    const items = query.data?.receipts ?? [];

    let totalMsat = 0;
    const contributorSet = new Set<string>();
    let count = 0;

    for (const item of items) {
      // Skip receipts after the deadline
      if (closedAt && item.createdAt > closedAt) continue;
      if (item.msats <= 0) continue;

      totalMsat += item.msats;
      if (item.sender) contributorSet.add(item.sender);
      count++;
    }

    const targetSats = Math.floor(targetMsat / 1000);
    const currentSats = Math.floor(totalMsat / 1000);

    return {
      currentMsat: totalMsat,
      currentSats,
      targetMsat,
      targetSats,
      percentage: targetMsat > 0 ? Math.min(100, Math.round((totalMsat / targetMsat) * 100)) : 0,
      contributors: Array.from(contributorSet),
      zapCount: count,
    };
  }, [query.data, targetMsat, closedAt]);

  return {
    ...progress,
    isLoading: query.isLoading,
  };
}
