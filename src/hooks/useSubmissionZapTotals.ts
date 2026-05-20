import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { getZapAmountSats } from '@/lib/zapHelpers';

/**
 * Batches a single relay query for zap/donation receipts targeting any of the
 * supplied submission IDs, then returns a `Map<eventId, totalSats>`.
 *
 * Used by pledge detail pages to rank submissions and calculate open-pool
 * funding progress. Kind 9735 carries millisats; kind 8333 carries sats.
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
        [{ kinds: [9735, 8333], '#e': eventIds, limit: eventIds.length * 50 }],
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

        const sats = getZapAmountSats(receipt);
        if (sats <= 0) continue;

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
