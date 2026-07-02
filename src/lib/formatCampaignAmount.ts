/**
 * Formats an integer USD amount (the campaign goal unit per NIP.md Kind
 * 33863). Uses thousands separators and a leading `$`. Negative or
 * non-finite values render as `$0`.
 */
export function formatUsdGoal(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0';
  return `$${Math.floor(usd).toLocaleString()}`;
}
