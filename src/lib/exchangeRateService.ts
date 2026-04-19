/**
 * Exchange rate service for fetching BTC/USD rates from Coinbase API
 * 
 * Uses module-level cache to avoid excessive API calls
 */

import { logger } from '@/lib/logger';

const COINBASE_API_URL = "https://api.coinbase.com/v2/exchange-rates";
const CACHE_DURATION_MS = 60000; // 1 minute cache

let cachedRate: number | null = null;
let cacheTimestamp: number = 0;

/**
 * Get the current BTC/USD exchange rate from Coinbase API
 * Uses caching to avoid excessive API calls
 * 
 * @returns Promise resolving to BTC/USD exchange rate
 */
export async function getBtcUsdRate(): Promise<number> {
  const now = Date.now();
  
  // Return cached rate if still valid
  if (cachedRate && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    logger.debug('[ExchangeRate] Using cached BTC/USD rate:', cachedRate);
    return cachedRate;
  }

  try {
    logger.debug('[ExchangeRate] Fetching BTC/USD rate from Coinbase API');

    const response = await fetch(`${COINBASE_API_URL}?currency=BTC`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data?.data?.rates?.USD) {
      throw new Error("Invalid response format from Coinbase API");
    }

    const rate = parseFloat(data.data.rates.USD);
    
    if (isNaN(rate) || rate <= 0) {
      throw new Error(`Invalid exchange rate received: ${data.data.rates.USD}`);
    }

    // Update cache
    cachedRate = rate;
    cacheTimestamp = now;

    logger.debug('[ExchangeRate] Fetched BTC/USD rate:', rate);

    return rate;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('[ExchangeRate] Failed to fetch BTC/USD rate:', errorMessage);

    // If we have a cached rate, use it as fallback
    if (cachedRate) {
      logger.warn('[ExchangeRate] Using stale cached rate as fallback:', cachedRate);
      return cachedRate;
    }

    // If no cached rate available, throw error
    throw new Error(`Unable to fetch BTC/USD exchange rate: ${errorMessage}`);
  }
}

/**
 * Convert sats to USD using current exchange rate
 * 
 * @param sats - Amount in satoshis
 * @returns Promise resolving to USD amount
 */
export async function satsToUsd(sats: number): Promise<number> {
  const rate = await getBtcUsdRate();
  const btcAmount = sats / 100_000_000;
  return btcAmount * rate;
}

/**
 * Convert USD to sats using current exchange rate
 * 
 * @param usdAmount - Amount in USD
 * @returns Promise resolving to satoshis
 */
export async function usdToSats(usdAmount: number): Promise<number> {
  const rate = await getBtcUsdRate();
  const btcAmount = usdAmount / rate;
  return Math.floor(btcAmount * 100_000_000);
}

/**
 * Clear the cached exchange rate (useful for testing or forcing refresh)
 */
export function clearCache(): void {
  cachedRate = null;
  cacheTimestamp = 0;
}

/**
 * Format USD amount for display
 * 
 * @param usd - USD amount
 * @returns Formatted string (e.g., "$1,234.56")
 */
export function formatUsd(usd: number): string {
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format sats amount for display
 * 
 * @param sats - Satoshis amount
 * @returns Formatted string (e.g., "1,234,567")
 */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}
