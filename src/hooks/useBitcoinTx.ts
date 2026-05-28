import { useQuery } from '@tanstack/react-query';

import { fetchTxDetail } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';

/**
 * Fetch full transaction details for a Bitcoin txid via the configured
 * Esplora API roots, alongside the current BTC/USD price for display.
 */
export function useBitcoinTx(txid: string) {
  const { config } = useAppContext();
  const { esploraApis } = config;

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['bitcoin-tx-detail', esploraApis, txid],
    queryFn: ({ signal }) => fetchTxDetail(txid, esploraApis, signal),
    enabled: !!txid,
    staleTime: 60_000,
  });

  const { data: btcPrice } = useBtcPrice();

  return { tx, btcPrice, isLoading, error };
}
