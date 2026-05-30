export const BITCOIN_FEE_SPEED_ORDER = ['fastest', 'halfHour', 'hour', 'economy'] as const;

/** The preset confirmation-speed tiers, in display order. */
export type PresetBitcoinFeeSpeed = typeof BITCOIN_FEE_SPEED_ORDER[number];

/**
 * A fee selection: one of the preset tiers, or `'custom'` for a
 * user-entered sat/vB rate (used when the estimate API is down or the
 * user wants explicit control).
 */
export type BitcoinFeeSpeed = PresetBitcoinFeeSpeed | 'custom';

export interface BitcoinFeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
}

export function getBitcoinFeeRate(rates: BitcoinFeeRates, speed: PresetBitcoinFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

export function getUniqueBitcoinFeeSpeeds(
  rates: BitcoinFeeRates | undefined,
): PresetBitcoinFeeSpeed[] {
  if (!rates) return [...BITCOIN_FEE_SPEED_ORDER];
  const seen = new Set<number>();
  const result: PresetBitcoinFeeSpeed[] = [];
  for (const speed of BITCOIN_FEE_SPEED_ORDER) {
    const rate = getBitcoinFeeRate(rates, speed);
    if (!seen.has(rate)) {
      seen.add(rate);
      result.push(speed);
    }
  }
  return result;
}

/**
 * Resolve the effective sat/vB rate for the current selection.
 *
 * For `'custom'` the user-typed value wins (parsed and floored, valid only
 * when ≥ 1). For preset tiers we read the loaded rates; returns `undefined`
 * when rates haven't loaded (or a custom value isn't a usable rate), which
 * callers should treat as "not ready" rather than a real rate.
 */
export function resolveBitcoinFeeRate(
  speed: BitcoinFeeSpeed,
  rates: BitcoinFeeRates | undefined,
  customFeeRate: string,
): number | undefined {
  if (speed === 'custom') {
    const parsed = Math.floor(Number(customFeeRate));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
  }
  if (!rates) return undefined;
  return getBitcoinFeeRate(rates, speed);
}
