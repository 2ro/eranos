import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { fetchAddressData } from '@/lib/bitcoin';
import type { ParsedCampaign } from '@/lib/campaign';

interface ProfileCampaignsTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  campaigns: ParsedCampaign[];
  isLoading: boolean;
}

type SortMode = 'top' | 'new';

/**
 * Full grid of every campaign authored by this profile.
 *
 * Owner / moderator can toggle "Show hidden" to see campaigns the
 * moderation pack has hidden from the home page — visitors only see
 * non-hidden campaigns by default. Sort modes mirror
 * {@link AllCampaignsPage}: New (newest created_at first, the default
 * incoming order) and Top (most sats raised, requires the verified
 * donation totals).
 */
export function ProfileCampaignsTab({
  pubkey,
  displayName,
  isOwnProfile,
  campaigns,
  isLoading,
}: ProfileCampaignsTabProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderation } = useCampaignModeration();
  const { data: moderators } = useCampaignModerators();
  const isModerator = !!user && (moderators ?? []).includes(user.pubkey);

  const [sortMode, setSortMode] = useState<SortMode>('new');
  const [showHidden, setShowHidden] = useState(false);

  const canShowHidden = isOwnProfile || isModerator;

  const filtered = useMemo(() => {
    if (canShowHidden && showHidden) return campaigns;
    return campaigns.filter((c) => !moderation.hiddenCoords.has(c.aTag));
  }, [campaigns, canShowHidden, showHidden, moderation.hiddenCoords]);

  if (isLoading && filtered.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-12" data-pubkey={pubkey}>
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            <Megaphone className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isOwnProfile
                ? t('profile.campaigns.emptySelf')
                : t('profile.campaigns.emptyOther', { name: displayName })}
            </p>
            {isOwnProfile && (
              <Link
                to="/campaigns/new"
                className="inline-block mt-4 text-sm font-medium text-primary hover:underline"
              >
                {t('profile.campaigns.startLink')}
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('profile.campaigns.count', { count: filtered.length })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant={sortMode === 'new' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('new')}
          >
            {t('profile.campaigns.sortNew')}
          </Button>
          <Button
            variant={sortMode === 'top' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('top')}
          >
            {t('profile.campaigns.sortTop')}
          </Button>
          {canShowHidden && (
            <Button
              variant={showHidden ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowHidden((v) => !v)}
            >
              {showHidden ? t('profile.campaigns.hideHidden') : t('profile.campaigns.showHidden')}
            </Button>
          )}
        </div>
      </div>

      {sortMode === 'top' ? (
        <SortedByTopGrid campaigns={filtered} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {filtered.map((c) => (
            <CampaignCard key={c.aTag} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sorts the visible campaigns by sats raised (descending) by fanning
 * out one address-balance query per on-chain campaign. Uses `useQueries`,
 * so the hook call count is deterministic per render (one queries-tuple,
 * not one hook per campaign) and the rules of hooks hold.
 *
 * Caches share keys with `useCampaignDonations` so the balance results
 * are reused across the profile and any other view of the same campaign.
 */
function SortedByTopGrid({ campaigns }: { campaigns: ParsedCampaign[] }) {
  const { config } = useAppContext();
  const { esploraApis } = config;

  // Only on-chain campaigns can have observable totals. SP-only campaigns sort to 0.
  const onchain = campaigns.flatMap((c) => {
    const address = c.wallets?.onchain?.value;
    return address ? [{ campaign: c, address }] : [];
  });

  const balanceQueries = useQueries({
    queries: onchain.map(({ address }) => ({
      queryKey: ['bitcoin-balance', 'campaign', esploraApis, address],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchAddressData(address, esploraApis, signal),
      staleTime: 30_000,
      enabled: !!address,
    })),
  });

  const totalsByCoord = new Map<string, number>();
  for (let i = 0; i < onchain.length; i++) {
    const sats = balanceQueries[i]?.data?.totalReceived ?? 0;
    totalsByCoord.set(onchain[i].campaign.aTag, sats);
  }

  const sorted = [...campaigns].sort(
    (a, b) => (totalsByCoord.get(b.aTag) ?? 0) - (totalsByCoord.get(a.aTag) ?? 0),
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
      {sorted.map((campaign) => (
        <CampaignCard key={campaign.aTag} campaign={campaign} />
      ))}
    </div>
  );
}
