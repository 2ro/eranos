/**
 * Exchange Rate Hook
 * 
 * Provides BTC/USD exchange rate with caching and conversion utilities
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBtcUsdRate } from '@/lib/exchangeRateService';

/**
 * Hook to fetch and cache BTC/USD exchange rate
 * 
 * @example
 * ```tsx
 * const { data: rate, isLoading } = useExchangeRate();
 * 
 * if (rate) {
 *   const usdValue = balanceSats / 100_000_000 * rate;
 * }
 * ```
 */
export function useExchangeRate() {
  return useQuery({
    queryKey: ['btc-usd-rate'],
    queryFn: getBtcUsdRate,
    staleTime: 60000, // Consider stale after 1 minute
    refetchInterval: 120000, // Refetch every 2 minutes
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Hook to convert sats to USD with current exchange rate
 * 
 * @param sats - Amount in satoshis
 * @returns USD amount or null if rate unavailable
 * 
 * @example
 * ```tsx
 * const usdValue = useSatsToUsd(10000);
 * // usdValue = 5.00 (if BTC = $50,000)
 * ```
 */
export function useSatsToUsd(sats: number | null | undefined): number | null {
  const { data: rate } = useExchangeRate();
  
  return useMemo(() => {
    if (sats === null || sats === undefined || !rate) return null;
    return (sats / 100_000_000) * rate;
  }, [sats, rate]);
}

/**
 * Hook to convert USD to sats with current exchange rate
 * 
 * @param usd - Amount in USD
 * @returns Satoshis or null if rate unavailable
 * 
 * @example
 * ```tsx
 * const satsValue = useUsdToSats(5.00);
 * // satsValue = 10000 (if BTC = $50,000)
 * ```
 */
export function useUsdToSats(usd: number | null | undefined): number | null {
  const { data: rate } = useExchangeRate();
  
  return useMemo(() => {
    if (usd === null || usd === undefined || !rate) return null;
    return Math.floor((usd / rate) * 100_000_000);
  }, [usd, rate]);
}
