import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Megaphone } from 'lucide-react';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { ProfileVerifierSection } from '@/components/profile/ProfileVerifierSection';
import { Card } from '@/components/ui/card';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useVerifiedCampaigns } from '@/hooks/useVerifiedCampaigns';
import type { ProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import type { ParsedCampaign } from '@/lib/campaign';

interface ProfileAgoraTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  profileCampaignStats: ProfileCampaignStats;
  campaigns: ParsedCampaign[];
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
}: ProfileAgoraTabProps) {
  const { t } = useTranslation();
  const { campaigns: verifiedCampaigns, isLoading: verifiedLoading } = useVerifiedCampaigns(pubkey);
  const { data: moderation } = useCampaignModeration();

  const authoredLoading = profileCampaignStats.isVerifying && campaigns.length === 0;

  const mergedCampaigns = useMemo(() => {
    const seenCoords = new Set<string>();
    const relationshipsByCoord = new Map<string, CampaignRelationship>();

    for (const campaign of campaigns) {
      if (moderation.hiddenCoords.has(campaign.aTag)) continue;
      seenCoords.add(campaign.aTag);
      relationshipsByCoord.set(campaign.aTag, { campaign, authored: true, verified: false });
    }

    for (const campaign of verifiedCampaigns) {
      if (moderation.hiddenCoords.has(campaign.aTag)) continue;
      const existing = relationshipsByCoord.get(campaign.aTag);
      if (seenCoords.has(campaign.aTag) && existing) {
        existing.verified = true;
      } else {
        seenCoords.add(campaign.aTag);
        relationshipsByCoord.set(campaign.aTag, { campaign, authored: false, verified: true });
      }
    }

    return [...relationshipsByCoord.values()].sort((a, b) => b.campaign.createdAt - a.campaign.createdAt);
  }, [campaigns, verifiedCampaigns, moderation.hiddenCoords]);

  const isLoading = (authoredLoading || verifiedLoading) && mergedCampaigns.length === 0;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4" data-pubkey={pubkey}>
      <ProfileVerifierSection pubkey={pubkey} isOwnProfile={isOwnProfile} className="mb-2" />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {mergedCampaigns.map(({ campaign }) => (
              <CampaignCard
                key={campaign.aTag}
                campaign={campaign}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
