import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Megaphone } from 'lucide-react';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { ProfileOverviewSections } from '@/components/profile/ProfileIdentityRail';
import { ProfileVerifierSection } from '@/components/profile/ProfileVerifierSection';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useVerifiedCampaigns } from '@/hooks/useVerifiedCampaigns';
import type { ProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import type { Action } from '@/hooks/useActions';
import type { ParsedCampaign } from '@/lib/campaign';

interface ProfileAgoraTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  profileCampaignStats: ProfileCampaignStats;
  campaigns: ParsedCampaign[];
  pledges: Action[];
  btcPrice: number | undefined;
  onTabChange: (tabId: string) => void;
}

interface CampaignRelationship {
  campaign: ParsedCampaign;
  authored: boolean;
  verified: boolean;
}

/**
 * Unified Agora profile tab.
 *
 * Merges the old Overview, Verified, and Campaigns profile concepts into
 * one surface while keeping Activity separate. Campaigns are keyed by their
 * canonical `a` coordinate so a profile that authors and verifies the same
 * campaign only renders one card.
 */
export function ProfileAgoraTab({
  pubkey,
  displayName,
  isOwnProfile,
  profileCampaignStats,
  campaigns,
  pledges,
  btcPrice,
  onTabChange,
}: ProfileAgoraTabProps) {
  const { t } = useTranslation();
  const { campaigns: verifiedCampaigns, isLoading: verifiedLoading } = useVerifiedCampaigns(pubkey);
  const { data: moderation } = useCampaignModeration();

  const authoredLoading = profileCampaignStats.isVerifying && campaigns.length === 0;

  const mergedCampaigns = useMemo(() => {
    const byCoord = new Map<string, CampaignRelationship>();

    for (const campaign of campaigns) {
      if (moderation.hiddenCoords.has(campaign.aTag)) continue;
      byCoord.set(campaign.aTag, { campaign, authored: true, verified: false });
    }

    for (const campaign of verifiedCampaigns) {
      if (moderation.hiddenCoords.has(campaign.aTag)) continue;
      const existing = byCoord.get(campaign.aTag);
      if (existing) {
        existing.verified = true;
      } else {
        byCoord.set(campaign.aTag, { campaign, authored: false, verified: true });
      }
    }

    return [...byCoord.values()].sort((a, b) => b.campaign.createdAt - a.campaign.createdAt);
  }, [campaigns, verifiedCampaigns, moderation.hiddenCoords]);

  const isLoading = (authoredLoading || verifiedLoading) && mergedCampaigns.length === 0;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6" data-pubkey={pubkey}>
      <ProfileVerifierSection pubkey={pubkey} isOwnProfile={isOwnProfile} />

      <ProfileOverviewSections
        pubkey={pubkey}
        isOwnProfile={isOwnProfile}
        campaigns={campaigns}
        campaignStats={profileCampaignStats}
        pledges={pledges}
        btcPrice={btcPrice}
        onTabChange={onTabChange}
        showOrganizations={false}
        className="lg:hidden"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      ) : mergedCampaigns.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            {isOwnProfile ? (
              <Megaphone className="size-10 mx-auto mb-3 text-muted-foreground" />
            ) : (
              <BadgeCheck className="size-10 mx-auto mb-3 text-muted-foreground" />
            )}
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isOwnProfile
                ? t('profile.campaigns.emptySelf')
                : t('profile.campaigns.emptyOther', { name: displayName })}
            </p>
            {isOwnProfile && (
              <StartCampaignLink className="inline-block mt-4 text-sm font-medium text-primary hover:underline">
                {t('profile.campaigns.startLink')}
              </StartCampaignLink>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('profile.campaigns.count', { count: mergedCampaigns.length })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {mergedCampaigns.map(({ campaign, authored, verified }) => (
              <CampaignCard
                key={campaign.aTag}
                campaign={campaign}
                footerBadge={<CampaignRelationshipBadges authored={authored} verified={verified} />}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignRelationshipBadges({ authored, verified }: { authored: boolean; verified: boolean }) {
  const { t } = useTranslation();

  return (
    <>
      {authored && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {t('profile.badges.founder')}
        </Badge>
      )}
      {verified && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t('campaignsDetail.verifiedLabel')}
        </Badge>
      )}
    </>
  );
}
