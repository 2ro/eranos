import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { extractZapAmount, extractZapSender } from '@/hooks/useEventInteractions';
import { getPaginationCursor } from '@/lib/feedUtils';
import type { ParsedGoal } from '@/lib/goalUtils';

const ZAP_RECEIPT_PAGE_SIZE = 500;
const MAX_ZAP_RECEIPT_PAGES = 20;

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
  /** True when the tally reached the safety cap before exhausting relay results. */
  isPartial: boolean;
}

interface ZapReceiptItem {
  msats: number;
  sender: string;
  createdAt: number;
}

/**
 * Queries kind 9735 zap receipts targeting a goal event and tallies progress.
 * Respects the goal's `relays` and `closed_at` deadline.
 *
 * Zap receipts are tallied at face value (same as the rest of the app).
 * Full NIP-57 validation was removed because the LNURL signer resolution
 * added a network request per beneficiary for a trust level that is still
 * spoofable and that no other zap display in the app enforces.
 */
export function useGoalProgress(goalEvent: NostrEvent | undefined, goal: ParsedGoal) {
  const { nostr } = useNostr();
  const goalEventId = goalEvent?.id;
  const relaysKey = goal.relays.join(',');

  const query = useQuery({
    queryKey: ['goal-progress', goalEventId, relaysKey, goal.closedAt ?? null],
    queryFn: async (c) => {
      if (!goalEventId) {
        return { receipts: [] as ZapReceiptItem[], isPartial: false };
      }
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const relay = goal.relays.length > 0 ? nostr.group(goal.relays) : nostr;
      const receipts: ZapReceiptItem[] = [];
      const seen = new Set<string>();
      let until = goal.closedAt;
      let isPartial = false;

      for (let page = 0; page < MAX_ZAP_RECEIPT_PAGES; page++) {
        const events = await relay.query(
          [{ kinds: [9735], '#e': [goalEventId], limit: ZAP_RECEIPT_PAGE_SIZE, ...(until ? { until } : {}) }],
          { signal },
        );

        const validEvents = events.filter((event) => !goal.closedAt || event.created_at <= goal.closedAt);

        for (const event of validEvents) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          receipts.push({
            msats: extractZapAmount(event),
            sender: extractZapSender(event),
            createdAt: event.created_at,
          });
        }

        if (events.length < ZAP_RECEIPT_PAGE_SIZE || validEvents.length === 0) {
          break;
        }

        until = getPaginationCursor(validEvents) - 1;
        if (page === MAX_ZAP_RECEIPT_PAGES - 1) {
          isPartial = true;
        }
      }

      return { receipts, isPartial };
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
      if (goal.closedAt && item.createdAt > goal.closedAt) continue;
      if (item.msats <= 0) continue;

      totalMsat += item.msats;
      if (item.sender) contributorSet.add(item.sender);
      count++;
    }

    const targetMsat = goal.amountMsat;
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
      isPartial: query.data?.isPartial ?? false,
    };
  }, [query.data, goal.amountMsat, goal.closedAt]);

  return {
    ...progress,
    isLoading: query.isLoading,
  };
}
