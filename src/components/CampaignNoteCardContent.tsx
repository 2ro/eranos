import type { NostrEvent } from '@nostrify/nostrify';

import { CampaignCard } from '@/components/CampaignCard';
import { parseCampaign } from '@/lib/campaign';

/**
 * Renders a kind 33863 Campaign event inside the activity feed using the
 * same polished {@link CampaignCard} component that powers the campaign
 * directory. The whole card is a `<Link>` to the campaign's naddr-based
 * detail route, so taps from the feed land directly on the campaign page.
 *
 * Malformed events (missing required fields, invalid wallet endpoint,
 * etc.) silently drop — `parseCampaign` returns `null` and we return
 * `null` from the component. A future enhancement could render a
 * "Malformed campaign" fallback, but for now keeping the feed clean
 * wins over surfacing parse errors to viewers.
 */
export function CampaignNoteCardContent({ event }: { event: NostrEvent }) {
  const campaign = parseCampaign(event);
  if (!campaign) return null;
  return <CampaignCard campaign={campaign} className="mt-2" />;
}
