export const BITCOIN_FEE_SPEED_ORDER = ['fastest', 'halfHour', 'hour', 'economy'] as const;

export type BitcoinFeeSpeed = typeof BITCOIN_FEE_SPEED_ORDER[number];

export interface BitcoinFeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
}

export function getBitcoinFeeRate(rates: BitcoinFeeRates, speed: BitcoinFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

export function getUniqueBitcoinFeeSpeeds(
  rates: BitcoinFeeRates | undefined,
): BitcoinFeeSpeed[] {
  if (!rates) return [...BITCOIN_FEE_SPEED_ORDER];
  const seen = new Set<number>();
  const result: BitcoinFeeSpeed[] = [];
  for (const speed of BITCOIN_FEE_SPEED_ORDER) {
    const rate = getBitcoinFeeRate(rates, speed);
    if (!seen.has(rate)) {
      seen.add(rate);
      result.push(speed);
    }
  }
  return result;
}
