import { useQuery } from '@tanstack/react-query';

import { fetchBtcPrice } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Tiny standalone hook for the spot BTC→USD price.
 *
 * Lives separately from `useBitcoinWallet` so that low-level components (e.g.
 * `NoteCard`'s zap-receipt layout) can render USD-denominated amounts without
 * triggering the wallet's address-data and transaction fetches, which require
 * a logged-in user.
 *
 * Cache key matches `useBitcoinWallet` and `CampaignCard` so all consumers
 * share a single in-flight request and TanStack Query dedupes naturally.
 */
export function useBtcPrice() {
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;
  return useQuery({
    queryKey: ['btc-price', esploraBaseUrl],
    queryFn: () => fetchBtcPrice(esploraBaseUrl),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
