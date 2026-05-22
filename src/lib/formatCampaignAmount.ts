import { satsToUSDWhole } from '@/lib/bitcoin';

/**
 * Formats a sats amount into a short, human-readable string.
 *
 * - `< 10,000` sats — shows the exact number with thousands separators.
 * - `10,000 – 999,999` sats — rounds to the nearest thousand (`12K sats`).
 * - `1,000,000 – 99,999,999` sats — two decimals of millions (`1.23M sats`).
 * - `>= 100,000,000` sats (1 BTC) — switches to BTC with two decimals.
 */
export function formatSatsShort(sats: number): string {
  if (sats >= 100_000_000) return `${(sats / 100_000_000).toFixed(2)} BTC`;
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M sats`;
  if (sats >= 10_000) return `${(sats / 1_000).toFixed(0)}K sats`;
  return `${sats.toLocaleString()} sats`;
}

/**
 * Renders a sats count as USD (whole dollars) when a BTC price is
 * available, falling back to {@link formatSatsShort} otherwise. Used by
 * campaign cards and the hero spotlight so totals are consistent across
 * the app.
 */
export function formatCampaignAmount(sats: number, btcPrice: number | undefined): string {
  if (btcPrice) return satsToUSDWhole(sats, btcPrice);
  return formatSatsShort(sats);
}

/**
 * Formats an integer USD amount (the campaign goal unit per NIP.md Kind
 * 33863). Uses thousands separators and a leading `$`. Negative or
 * non-finite values render as `$0`.
 */
export function formatUsdGoal(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0';
  return `$${Math.floor(usd).toLocaleString()}`;
}

/**
 * Convert sats to USD using a live BTC/USD price. Returns `undefined` if
 * the price isn't available — callers should fall back to the sats
 * representation in that case.
 */
export function satsToUsd(sats: number, btcPrice: number | undefined): number | undefined {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return undefined;
  return (sats / 100_000_000) * btcPrice;
}
