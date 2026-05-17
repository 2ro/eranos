import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  fetchAddressData,
  fetchBtcPrice,
  fetchTransactions,
  nostrPubkeyToBitcoinAddress,
} from '@/lib/bitcoin';

export function useBitcoinWallet() {
  const { user } = useCurrentUser();

  const bitcoinAddress = useMemo(() => {
    if (!user) return '';
    return nostrPubkeyToBitcoinAddress(user.pubkey);
  }, [user]);

  const {
    data: addressData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bitcoin-balance', bitcoinAddress],
    queryFn: () => fetchAddressData(bitcoinAddress),
    enabled: !!bitcoinAddress,
    refetchInterval: 30_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const {
    data: transactions,
    isLoading: isLoadingTxs,
  } = useQuery({
    queryKey: ['bitcoin-txs', bitcoinAddress],
    queryFn: () => fetchTransactions(bitcoinAddress),
    enabled: !!bitcoinAddress,
    refetchInterval: 30_000,
  });

  return {
    bitcoinAddress,
    addressData,
    btcPrice,
    transactions,
    isLoading,
    isLoadingTxs,
    error,
    refetch,
    pubkey: user?.pubkey ?? '',
  };
}
