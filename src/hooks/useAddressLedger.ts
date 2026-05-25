import { useInfiniteQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { fetchAddressTxs, type AddressTransaction } from '@/lib/bitcoin';

/**
 * Fetch on-chain transaction history for a Bitcoin address with infinite
 * pagination, mirroring Esplora's `/address/:addr/txs` cursor model.
 *
 * The first page returns any unconfirmed (mempool) txs plus the newest 50
 * confirmed txs. Subsequent pages are fetched via the `chain/<last_seen_txid>`
 * cursor — Esplora pages 50 confirmed txs at a time, so a page shorter than
 * 50 entries means the address history has been fully walked.
 *
 * The query is gated by the `enabled` flag so callers can call this hook
 * unconditionally and only flip it on once the address is known to exist.
 */
export function useAddressLedger(address: string | undefined, enabled: boolean) {
  const { config } = useAppContext();
  const { esploraApis } = config;

  return useInfiniteQuery<AddressTransaction[], Error>({
    queryKey: ['address-ledger', esploraApis, address ?? ''],
    enabled: enabled && !!address,
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchAddressTxs(address!, esploraApis, pageParam as string | undefined, signal),
    getNextPageParam: (lastPage) => {
      // Esplora paginates confirmed txs 50 per page. A short page means
      // we've walked to the end of the address's confirmed history.
      // The first page can include mempool entries on top of up to 50
      // confirmed txs, so use the *confirmed* page size as the boundary.
      const confirmed = lastPage.filter((tx) => tx.confirmed);
      if (confirmed.length < 50) return undefined;
      return confirmed[confirmed.length - 1].txid;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
