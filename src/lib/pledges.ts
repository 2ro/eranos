import { formatSats, satsToUSDWhole } from '@/lib/bitcoin';

export function formatPledgeAmount(sats: number, btcPrice: number | undefined): string {
  if (btcPrice) return satsToUSDWhole(sats, btcPrice);
  return `${formatSats(sats)} sats`;
}

export function formatCompactPledgeDeadline(unixSeconds: number): { label: string; isPast: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return { label: 'Ended', isPast: true };
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: 'Ends today', isPast: false };
  if (days < 30) return { label: `${days} days left`, isPast: false };
  const months = Math.round(days / 30);
  return { label: `${months} mo left`, isPast: false };
}
