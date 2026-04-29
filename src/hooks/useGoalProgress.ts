import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';

import { extractZapAmount, extractZapSender } from '@/hooks/useEventInteractions';
import { useLnurlSigner } from '@/hooks/useLnurlSigner';
import { parseBolt11AmountMsats } from '@/lib/bolt11';
import type { ParsedGoal } from '@/lib/goalUtils';

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

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function isValidGoalZapReceipt(
  receipt: NostrEvent,
  goalEventId: string,
  beneficiary: string,
  receiptSigner: string | undefined,
): boolean {
  if (!receiptSigner || receipt.pubkey !== receiptSigner) return false;

  const description = tagValue(receipt.tags, 'description');
  if (!description || nip57.validateZapRequest(description) !== null) return false;

  let zapRequest: NostrEvent;
  try {
    zapRequest = JSON.parse(description) as NostrEvent;
  } catch {
    return false;
  }

  const pTags = zapRequest.tags.filter(([n]) => n === 'p');
  const eTags = zapRequest.tags.filter(([n]) => n === 'e');
  if (pTags.length !== 1 || pTags[0][1] !== beneficiary) return false;
  if (eTags.length !== 1 || eTags[0][1] !== goalEventId) return false;
  if (tagValue(receipt.tags, 'p') !== beneficiary) return false;

  const requestMsats = parseInt(tagValue(zapRequest.tags, 'amount') ?? '', 10);
  if (isNaN(requestMsats) || requestMsats <= 0) return false;

  const invoiceMsats = parseBolt11AmountMsats(tagValue(receipt.tags, 'bolt11'));
  return invoiceMsats > 0 && invoiceMsats === requestMsats;
}

/**
 * Queries kind 9735 zap receipts targeting a goal event and tallies validated progress.
 * Respects the goal's `relays` and `closed_at` deadline.
 */
export function useGoalProgress(goalEvent: NostrEvent | undefined, goal: ParsedGoal) {
  const { nostr } = useNostr();
  const { data: receiptSigner } = useLnurlSigner(goal.beneficiary);
  const goalEventId = goalEvent?.id;
  const relaysKey = goal.relays.join(',');

  const query = useQuery({
    queryKey: ['goal-progress', goalEventId, goal.beneficiary, receiptSigner, relaysKey],
    queryFn: async (c) => {
      if (!goalEventId) {
        return { receipts: [] as { msats: number; sender: string; createdAt: number }[] };
      }
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const relay = goal.relays.length > 0 ? nostr.group(goal.relays) : nostr;

      const receipts = await relay.query(
        [{ kinds: [9735], '#e': [goalEventId], limit: 500 }],
        { signal },
      );

      return {
        receipts: receipts
          .filter((r) => isValidGoalZapReceipt(r, goalEventId, goal.beneficiary, receiptSigner ?? undefined))
          .map((r) => ({
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
    };
  }, [query.data, goal.amountMsat, goal.closedAt]);

  return {
    ...progress,
    isLoading: query.isLoading,
  };
}
