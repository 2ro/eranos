/**
 * Addressable coordinate for a pledge (kind 36639): `36639:<pubkey>:<d>`.
 *
 * Accepts any object carrying `pubkey` and `id` so this helper stays in
 * the lib layer without taking a hook dep on `Action`. Both the moderation
 * label system (NIP-32 / kind 1985 `a`-tags) and the share-link generator
 * (NIP-09 deletion requests, naddr encoders) hand-rolled the same string
 * three times before this consolidation; one source of truth now.
 */
export function getPledgeCoord({ pubkey, id }: { pubkey: string; id: string }): string {
  return `36639:${pubkey}:${id}`;
}

export function formatPledgeAmount(sats: number): string {
  return `${sats.toLocaleString()} sats`;
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
