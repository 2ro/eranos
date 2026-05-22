import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import {
  extractOnchainZapTxid,
  verifyOnchainZap,
} from '@/hooks/useOnchainZaps';
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
            <Megaphone className="size-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isOwnProfile
                ? "You haven't launched a campaign yet."
                : `${displayName} hasn't launched a campaign yet.`}
            </p>
            {isOwnProfile && (
              <Link
                to="/campaigns/new"
                className="inline-block mt-4 text-sm font-medium text-primary hover:underline"
              >
                Start a campaign →
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
          {filtered.length} {filtered.length === 1 ? 'campaign' : 'campaigns'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant={sortMode === 'new' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('new')}
          >
            New
          </Button>
          <Button
            variant={sortMode === 'top' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortMode('top')}
          >
            Top
          </Button>
          {canShowHidden && (
            <Button
              variant={showHidden ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowHidden((v) => !v)}
            >
              {showHidden ? 'Hide hidden' : 'Show hidden'}
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
 * Sorts the visible campaigns by verified sats raised (descending) by
 * fanning out one receipts query + per-receipt verification across all
 * campaigns at once. Uses `useQueries`, so the hook call count is
 * deterministic per render (one queries-tuple, not one hook per campaign)
 * and the rules of hooks hold.
 *
 * Caches share keys with `useCampaignDonations` so the verifier results
 * are reused across the profile and any other view of the same campaign.
 */
function SortedByTopGrid({ campaigns }: { campaigns: ParsedCampaign[] }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { esploraBaseUrl } = config;

  // Only on-chain campaigns can have verifiable totals. SP campaigns sort to 0.
  const onchain = campaigns.filter((c) => c.wallet?.mode === 'onchain');

  // Step 1: one receipts query per on-chain campaign.
  const receiptsQueries = useQueries({
    queries: onchain.map((campaign) => ({
      queryKey: ['campaign-donations', 'events', campaign.aTag],
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<NostrEvent[]> => {
        return nostr.query(
          [{ kinds: [8333], '#a': [campaign.aTag], limit: 500 }],
          { signal },
        );
      },
      staleTime: 15_000,
    })),
  });

  // Step 2: dedupe receipts by txid (earliest wins, matching useCampaignDonations).
  const verificationInputs: Array<{ aTag: string; wallet: string; event: NostrEvent }> = [];
  for (let i = 0; i < onchain.length; i++) {
    const campaign = onchain[i];
    const wallet = campaign.wallet?.value;
    if (!wallet) continue;
    const receipts = receiptsQueries[i]?.data ?? [];
    const ascending = [...receipts].sort((a, b) => a.created_at - b.created_at);
    const seenTxids = new Set<string>();
    for (const event of ascending) {
      const txid = extractOnchainZapTxid(event);
      if (!txid || seenTxids.has(txid)) continue;
      seenTxids.add(txid);
      verificationInputs.push({ aTag: campaign.aTag, wallet, event });
    }
  }

  const verifications = useQueries({
    queries: verificationInputs.map(({ wallet, event }) => ({
      queryKey: ['onchain-zaps', 'verify', esploraBaseUrl, event.id, wallet],
      queryFn: () => verifyOnchainZap(event, esploraBaseUrl, wallet),
      staleTime: 60_000,
    })),
  });

  // Step 3: sum verified sats per campaign aTag.
  const totalsByCoord = new Map<string, number>();
  for (let i = 0; i < verifications.length; i++) {
    const { aTag } = verificationInputs[i];
    const sats = verifications[i].data?.amountSats ?? 0;
    totalsByCoord.set(aTag, (totalsByCoord.get(aTag) ?? 0) + sats);
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
