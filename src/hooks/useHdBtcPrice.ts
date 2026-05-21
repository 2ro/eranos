import { useQuery } from '@tanstack/react-query';

import { fetchBlockbookBtcPrice } from '@/lib/hdwallet/blockbook';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Spot BTC→USD price for the HD wallet, sourced from Trezor Blockbook's
 * WebSocket `getCurrentFiatRates` method.
 *
 * Why a dedicated hook instead of the app-wide {@link useBtcPrice}?
 *
 * `/hdwallet` deliberately isolates its network surface to the single
 * Blockbook endpoint the user has configured — no Esplora, no
 * mempool.space `/v1/prices`. This hook keeps that contract: if Blockbook
 * is reachable, the HD wallet has everything it needs; if it isn't,
 * errors surface in one place instead of being split across two
 * unrelated APIs.
 *
 * Cache key is keyed on the Blockbook base URL so changes in app settings
 * trigger a fresh fetch without manual invalidation.
 */
export function useHdBtcPrice() {
  const { config } = useAppContext();
  const { blockbookBaseUrl } = config;
  return useQuery({
    queryKey: ['hd-btc-price', blockbookBaseUrl],
    queryFn: ({ signal }) => fetchBlockbookBtcPrice(blockbookBaseUrl, 'usd', signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
