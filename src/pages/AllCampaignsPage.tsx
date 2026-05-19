import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { EyeOff, HandHeart, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * Lists every campaign found on relays, regardless of approval status.
 *
 * By default, hidden campaigns are excluded — flip the "Show hidden" toggle
 * to include them. Featured and approved badges are surfaced by the
 * existing `CampaignCard`, so users can tell at a glance which campaigns
 * have moderation status.
 *
 * Mods see the per-card kebab menu (same as the home page) and can moderate
 * directly from this page.
 */
export function AllCampaignsPage() {
  useLayoutOptions({ rightSidebar: null });
  const { config } = useAppContext();
  const [showHidden, setShowHidden] = useState(false);

  // Pull a wide window of campaigns; the network's all-up campaign volume
  // is still small enough that 200 covers everything in practice. If/when
  // that stops being true we can add pagination here.
  const { data: campaigns, isLoading } = useCampaigns({ limit: 200 });
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();

  useSeoMeta({
    title: `All campaigns | ${config.appName}`,
    description: 'Browse every campaign published on Agora.',
  });

  const { visible, hiddenCount } = useMemo(() => {
    const all = campaigns ?? [];
    const hiddenCoords = moderation?.hiddenCoords ?? new Set<string>();
    let hiddenCount = 0;
    const visible: ParsedCampaign[] = [];

    for (const c of all) {
      if (hiddenCoords.has(c.aTag)) {
        hiddenCount += 1;
        if (showHidden) visible.push(c);
      } else {
        visible.push(c);
      }
    }

    return { visible, hiddenCount };
  }, [campaigns, moderation, showHidden]);

  const showSkeleton = isLoading || !moderationReady;

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">All Campaigns</h1>
          <p className="text-muted-foreground max-w-2xl">
            Every campaign published on Agora, including ones awaiting
            moderation. Hidden campaigns are excluded by default — toggle
            below to include them.
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-border/70 bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <Switch
              id="show-hidden"
              checked={showHidden}
              onCheckedChange={setShowHidden}
            />
            <Label
              htmlFor="show-hidden"
              className="text-sm font-medium cursor-pointer inline-flex items-center gap-2"
            >
              <EyeOff className="size-4 text-muted-foreground" aria-hidden />
              Show hidden campaigns
              {hiddenCount > 0 && (
                <span className="text-muted-foreground font-normal">({hiddenCount})</span>
              )}
            </Label>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/campaigns/new">
              <PlusCircle className="size-4 mr-2" />
              Start a campaign
            </Link>
          </Button>
        </div>

        {/* Grid */}
        {showSkeleton ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <CampaignCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center space-y-4">
              <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">No campaigns found</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  {hiddenCount > 0 && !showHidden
                    ? 'Every campaign on the network has been hidden by moderators. Toggle "Show hidden" to view them.'
                    : 'No campaigns have been published yet. Be the first.'}
                </p>
              </div>
              <Button asChild>
                <Link to="/campaigns/new">
                  <PlusCircle className="size-4 mr-2" />
                  Start a campaign
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {visible.map((campaign) => (
              <CampaignCard key={campaign.aTag} campaign={campaign} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default AllCampaignsPage;
