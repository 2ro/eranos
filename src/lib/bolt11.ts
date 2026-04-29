/**
 * Parse the amount from a BOLT11 invoice string.
 * Returns the amount in millisatoshis, or 0 if the invoice cannot be parsed.
 */
export function parseBolt11AmountMsats(bolt11: string | undefined): number {
  if (!bolt11) return 0;
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 0;
  switch (match[2]) {
    case 'm': return value * 100_000_000;
    case 'u': return value * 100_000;
    case 'n': return value * 100;
    case 'p': return value / 10;
    default: return value * 100_000_000_000;
  }
}
