/**
 * Parse the amount from a BOLT11 invoice string.
 * Returns the amount in millisatoshis, or 0 if the invoice has no amount or cannot be parsed.
 *
 * BOLT11 encodes the amount in the human-readable part (HRP) of the bech32 string:
 *   ln + <coin type> + [amount + multiplier]
 * The last `1` in the string separates the HRP from the data part.
 * The amount is optional — invoices with no amount (e.g. `lnbc1p...`) return 0.
 */
export function parseBolt11AmountMsats(bolt11: string | undefined): number {
  if (!bolt11) return 0;

  const lower = bolt11.toLowerCase();

  // Find the last '1' which separates HRP from data in bech32.
  const lastOne = lower.lastIndexOf('1');
  if (lastOne < 2) return 0;

  const hrp = lower.substring(0, lastOne);

  // HRP format: ln + coin type (bc/tb/bcrt/sb/ltc/tltc) + optional amount
  // Extract the amount+multiplier portion from the end of the HRP.
  const amountMatch = hrp.match(/(\d+)([munp]?)$/);
  if (!amountMatch) return 0; // No amount in HRP (zero-amount invoice)

  const value = parseInt(amountMatch[1], 10);
  if (isNaN(value) || value <= 0) return 0;

  // Convert to millisatoshis based on multiplier.
  // The numeric value represents BTC divided by the multiplier:
  //   (none) = BTC, m = milli-BTC, u = micro-BTC, n = nano-BTC, p = pico-BTC
  // 1 BTC = 100_000_000_000 msats
  const multiplier = amountMatch[2];
  switch (multiplier) {
    case 'm': return value * 100_000_000;     // milli-BTC: 1e8 msats
    case 'u': return value * 100_000;          // micro-BTC: 1e5 msats
    case 'n': return value * 100;              // nano-BTC:  1e2 msats
    case 'p': return value / 10;               // pico-BTC:  0.1 msats
    default:  return value * 100_000_000_000;  // BTC:       1e11 msats
  }
}
