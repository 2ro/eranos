import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { bech32 } from '@scure/base';
import { nip57 } from 'nostr-tools';

import { extractZapAmount, extractZapSender } from '@/hooks/useEventInteractions';
import { useAuthor } from '@/hooks/useAuthor';
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

function parseBolt11AmountMsats(bolt11: string | undefined): number {
  if (!bolt11) return 0;
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 0;
  switch (match[2]) {
    case 'm': return value * 100_000_000;
    case 'u': return value * 100_000;
    case 'n': return value * 100;
    case 'p': return value / 10;
    default: return value * 100_000_000_000;
  }
}

async function resolveZapReceiptSigner(profileEvent: NostrEvent | undefined, signal?: AbortSignal): Promise<string | undefined> {
  if (!profileEvent) return undefined;

  let lnurl = '';
  try {
    const metadata = JSON.parse(profileEvent.content) as { lud06?: string; lud16?: string };
    if (metadata.lud06) {
      const { words } = bech32.decode(metadata.lud06, 1000);
      lnurl = new TextDecoder().decode(new Uint8Array(bech32.fromWords(words)));
    } else if (metadata.lud16) {
      const [name, domain] = metadata.lud16.split('@');
      if (!name || !domain) return undefined;
      lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString();
    }
  } catch {
    return undefined;
  }

  if (!lnurl) return undefined;

  try {
    const res = await fetch(lnurl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const body = await res.json() as { allowsNostr?: boolean; nostrPubkey?: string };
    return body.allowsNostr && /^[a-f0-9]{64}$/.test(body.nostrPubkey ?? '')
      ? body.nostrPubkey
      : undefined;
  } catch {
    return undefined;
  }
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
  const author = useAuthor(goal.beneficiary);
  const goalEventId = goalEvent?.id;
  const relaysKey = goal.relays.join(',');
  const lnAddr = author.data?.metadata?.lud16 ?? author.data?.metadata?.lud06;

  const query = useQuery({
    queryKey: ['goal-progress', goalEventId, goal.beneficiary, lnAddr, relaysKey],
    queryFn: async (c) => {
      if (!goalEventId) {
        return { receipts: [] as { msats: number; sender: string; createdAt: number }[] };
      }
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const receiptSigner = await resolveZapReceiptSigner(author.data?.event, c.signal);
      const relay = goal.relays.length > 0 ? nostr.group(goal.relays) : nostr;

      const receipts = await relay.query(
        [{ kinds: [9735], '#e': [goalEventId], limit: 500 }],
        { signal },
      );

      return {
        receipts: receipts
          .filter((r) => isValidGoalZapReceipt(r, goalEventId, goal.beneficiary, receiptSigner))
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
