import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { ProfileVerifierSection } from '@/components/profile/ProfileVerifierSection';
import { Card } from '@/components/ui/card';
import { useVerifiedCampaigns } from '@/hooks/useVerifiedCampaigns';

interface ProfileVerifiedTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile?: boolean;
}

/**
 * The profile's verification tab: the account's self-published
 * "How We Verify" statement (kind 14672) followed by the grid of
 * campaigns it has verified — resolved from the account's own
 * `agora.verified` (kind 1985) labels via {@link useVerifiedCampaigns}.
 * Surfaced as the default tab for verifier profiles so visitors
 * immediately see how the organization vets campaigns and what it
 * stands behind.
 */
export function ProfileVerifiedTab({ pubkey, displayName, isOwnProfile = false }: ProfileVerifiedTabProps) {
  const { t } = useTranslation();
  const { campaigns, isLoading } = useVerifiedCampaigns(pubkey);

  if (isLoading && campaigns.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-6">
        <ProfileVerifierSection pubkey={pubkey} isOwnProfile={isOwnProfile} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-6" data-pubkey={pubkey}>
        <ProfileVerifierSection pubkey={pubkey} isOwnProfile={isOwnProfile} />
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            <BadgeCheck className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {t('profile.verified.empty', { name: displayName })}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <ProfileVerifierSection pubkey={pubkey} isOwnProfile={isOwnProfile} className="mb-2" />
      <p className="text-sm text-muted-foreground">
        {t('profile.verified.count', { count: campaigns.length })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {campaigns.map((c) => (
          <CampaignCard key={c.aTag} campaign={c} />
        ))}
      </div>
    </div>
  );
}
