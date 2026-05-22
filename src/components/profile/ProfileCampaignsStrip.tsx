import { Megaphone } from 'lucide-react';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import type { ParsedCampaign } from '@/lib/campaign';

interface ProfileCampaignsStripProps {
  /** Campaigns authored by the profile owner, newest-first as returned by useCampaigns. */
  campaigns: ParsedCampaign[];
  isLoading: boolean;
  /** Whether the viewer is the profile owner — controls own-empty-state copy upstream. */
  isOwnProfile: boolean;
  /** Switch to the Campaigns tab. */
  onSeeAll?: () => void;
  /** Cap the strip at this many cards (default 6). The full list lives in the Campaigns tab. */
  limit?: number;
}

/**
 * Hero row of the profile owner's active campaigns.
 *
 * Conditional: renders nothing when the profile has no campaigns to show,
 * so a Nostr-native profile collapses cleanly. Hidden campaigns
 * (moderation `hide` axis set) are filtered out unless the viewer is the
 * profile owner — own-profile sees everything so they understand their
 * own moderation state.
 *
 * Layout: single column on mobile, 2 cols at sm, 3 at lg, 4 at xl. The
 * grid is the same one CampaignsPage / AllCampaignsPage use so the cards
 * scale consistently across the app.
 */
export function ProfileCampaignsStrip({
  campaigns,
  isLoading,
  isOwnProfile,
  onSeeAll,
  limit = 6,
}: ProfileCampaignsStripProps) {
  const { data: moderation } = useCampaignModeration();

  // Filter hidden out for visitors; own-profile sees them so they understand
  // why a campaign isn't on the home page.
  const visible = isOwnProfile
    ? campaigns
    : campaigns.filter((c) => !moderation.hiddenCoords.has(c.aTag));

  // Loading-skeleton fallback when no campaigns are known yet.
  if (isLoading && visible.length === 0) {
    return (
      <section className="mt-6">
        <header className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Megaphone className="size-5 text-primary" />
            Campaigns
          </h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (visible.length === 0) return null;

  const truncated = visible.slice(0, limit);
  const more = visible.length - truncated.length;

  return (
    <section className="mt-6">
      <header className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Megaphone className="size-5 text-primary" />
          Campaigns
          <span className="text-sm font-normal text-muted-foreground">({visible.length})</span>
        </h2>
        {onSeeAll && visible.length > 0 && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-sm text-primary hover:underline font-medium"
          >
            See all →
          </button>
        )}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {truncated.map((campaign) => (
          <CampaignCard key={campaign.aTag} campaign={campaign} />
        ))}
      </div>
      {more > 0 && onSeeAll && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onSeeAll}
            className="text-sm text-primary hover:underline font-medium"
          >
            View all {visible.length} campaigns →
          </button>
        </div>
      )}
    </section>
  );
}
