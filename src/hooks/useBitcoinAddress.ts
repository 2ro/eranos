import { useQuery } from '@tanstack/react-query';

import { fetchAddressData, fetchAddressTxs, type AddressData } from '@/lib/bitcoin';
import { useAppContext } from '@/hooks/useAppContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';

/**
 * A simplified address-relative transaction row used in the
 * `BitcoinAddressHeader` recent transactions list.
 */
export interface AddressRecentTx {
  txid: string;
  /** Absolute satoshi amount of the address-relative net flow. */
  amount: number;
  /** Whether this tx was a net receive or send for the address. */
  type: 'receive' | 'send';
  confirmed: boolean;
  /** Block time (unix seconds), undefined if unconfirmed. */
  timestamp?: number;
}

export interface AddressDetail extends AddressData {
  address: string;
  /** Most recent transactions (up to 25). */
  recentTxs: AddressRecentTx[];
}

/**
 * Fetch full Bitcoin address details (balance + recent transactions) via the
 * configured Esplora API roots, alongside the current BTC/USD price.
 */
export function useBitcoinAddress(address: string) {
  const { config } = useAppContext();
  const { esploraApis } = config;

  const { data: addressDetail, isLoading, error, refetch } = useQuery({
    queryKey: ['bitcoin-address-detail', esploraApis, address],
    queryFn: async ({ signal }): Promise<AddressDetail> => {
      const [addrData, txs] = await Promise.all([
        fetchAddressData(address, esploraApis, signal),
        fetchAddressTxs(address, esploraApis, undefined, signal),
      ]);

      const recentTxs: AddressRecentTx[] = txs.slice(0, 25).map((tx) => ({
        txid: tx.txid,
        amount: Math.abs(tx.netSats),
        type: tx.netSats >= 0 ? 'receive' : 'send',
        confirmed: tx.confirmed,
        timestamp: tx.blockTime,
      }));

      return {
        address,
        ...addrData,
        recentTxs,
      };
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });

  const { data: btcPrice } = useBtcPrice();

  return { addressDetail, btcPrice, isLoading, error, refetch };
}
