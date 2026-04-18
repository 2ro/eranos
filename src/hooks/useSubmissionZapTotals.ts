import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { extractZapAmount } from '@/hooks/useEventInteractions';

/**
 * Batches a single relay query for kind 9735 zap receipts targeting any of the
 * supplied event IDs, then returns a `Map<eventId, totalSats>` summing the
 * msat amounts per receipt.
 *
 * Used by `ChallengeDetailPage` to rank submissions by total zap amount.
 */
export function useSubmissionZapTotals(eventIds: string[]) {
  const { nostr } = useNostr();

  // Stable cache key — sort to keep insertion order from changing the key.
  const sortedKey = [...eventIds].sort().join(',');

  return useQuery({
    queryKey: ['submission-zap-totals', sortedKey],
    queryFn: async (c) => {
      if (eventIds.length === 0) return new Map<string, number>();
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const receipts = await nostr.query(
        [{ kinds: [9735], '#e': eventIds, limit: eventIds.length * 50 }],
        { signal },
      );

      const totals = new Map<string, number>();
      for (const id of eventIds) totals.set(id, 0);

      for (const receipt of receipts) {
        // A receipt may carry multiple `e` tags; credit any that reference our
        // submissions (in practice this is just one).
        const targetIds = receipt.tags.filter(([n]) => n === 'e').map(([, v]) => v);
        const matching = targetIds.filter((id) => totals.has(id));
        if (matching.length === 0) continue;

        const msats = extractZapAmount(receipt);
        if (msats <= 0) continue;
        const sats = Math.floor(msats / 1000);

        for (const id of matching) {
          totals.set(id, (totals.get(id) ?? 0) + sats);
        }
      }
      return totals;
    },
    enabled: eventIds.length > 0,
    staleTime: 30_000,
  });
}
