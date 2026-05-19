import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Clock, EyeOff, HandHeart, PlusCircle, Search, TrendingUp, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { useAllCampaigns, type CampaignSort } from '@/hooks/useAllCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import type { ParsedCampaign } from '@/lib/campaign';

const SORT_OPTIONS: { value: CampaignSort; label: string; icon: typeof TrendingUp }[] = [
  { value: 'none', label: 'Newest', icon: Clock },
  { value: 'top', label: 'Top', icon: TrendingUp },
];

/** Type-guard for the `?sort=` URL param. Default is `none` (chronological). */
function parseSort(value: string | null): CampaignSort {
  return value === 'top' ? 'top' : 'none';
}

/**
 * Lists every campaign found on relays. Two sort modes:
 *
 * - **Newest** (default): chronological by `created_at`.
 * - **Top**: ranked by total sats raised (kind 8333 donation receipts).
 *
 * Both modes share a free-text search bar that filters across title,
 * summary, story, location, and category tags client-side.
 *
 * Hidden campaigns are excluded by default — flip the "Show hidden"
 * toggle to include them. The toggle filters client-side after the
 * campaign list resolves.
 *
 * URL state: `?sort=top&q=<search>`. Default values are stripped so the
 * canonical URL stays clean. Useful for sharing search results.
 */
export function AllCampaignsPage() {
  useLayoutOptions({ rightSidebar: null });
  const { config } = useAppContext();

  // URL state — sort and query live in the URL so results are shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get('sort'));
  const urlQuery = searchParams.get('q') ?? '';

  // Search input is local-state so typing is responsive; we debounce to
  // the URL + the query.
  const [searchInput, setSearchInput] = useState(urlQuery);
  const debouncedSearch = useDebounce(searchInput, 300);
  const [showHidden, setShowHidden] = useState(false);

  // Sync the debounced search → URL. Empty / default values are stripped
  // so the canonical URL is `/campaigns/all` (not
  // `/campaigns/all?sort=none&q=`).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = debouncedSearch.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    // Only replace history when the params actually change, to avoid
    // looping when the URL is already in sync.
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [debouncedSearch, searchParams, setSearchParams]);

  // Sync URL → input (e.g. browser back/forward or a deep link).
  useEffect(() => {
    if (urlQuery !== debouncedSearch) {
      setSearchInput(urlQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const setSort = (value: CampaignSort) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'top') next.set('sort', 'top');
    else next.delete('sort');
    setSearchParams(next, { replace: true });
  };

  const { data: campaigns, isLoading } = useAllCampaigns({
    sort,
    search: debouncedSearch.trim(),
    limit: 200,
  });
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
  const activeQuery = debouncedSearch.trim();

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">All Campaigns</h1>
        </header>

        {/* Toolbar */}
        <div className="space-y-4 rounded-lg border border-border/70 bg-card px-4 py-4">
          {/* Search input */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              inputMode="search"
              autoComplete="off"
              aria-label="Search campaigns"
              placeholder="Search campaigns…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Controls row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort pills */}
              <div
                className="flex gap-1 p-1 rounded-lg bg-secondary/40"
                role="radiogroup"
                aria-label="Sort order"
              >
                {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sort === value}
                    onClick={() => setSort(value)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md motion-safe:transition-colors',
                      sort === value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Show-hidden switch */}
              <div className="flex items-center gap-2">
                <Switch
                  id="show-hidden"
                  checked={showHidden}
                  onCheckedChange={setShowHidden}
                />
                <Label
                  htmlFor="show-hidden"
                  className="text-sm font-medium cursor-pointer inline-flex items-center gap-1.5"
                >
                  <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                  Show hidden
                  {hiddenCount > 0 && (
                    <span className="text-muted-foreground font-normal">({hiddenCount})</span>
                  )}
                </Label>
              </div>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-2" />
                Start a campaign
              </Link>
            </Button>
          </div>
        </div>

        {/* Grid — capped at 2 columns per row regardless of viewport. */}
        {showSkeleton ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <CampaignCardSkeleton key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center space-y-4">
              <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
              <div className="space-y-1.5">
                {activeQuery ? (
                  <>
                    <h2 className="text-lg font-semibold">
                      No campaigns match &ldquo;{activeQuery}&rdquo;
                    </h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      Try a different search term, or clear the search to
                      see every campaign.
                    </p>
                  </>
                ) : hiddenCount > 0 && !showHidden ? (
                  <>
                    <h2 className="text-lg font-semibold">No campaigns to show</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      Every campaign on the network has been hidden by
                      moderators. Toggle &ldquo;Show hidden&rdquo; to view
                      them.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">No campaigns yet</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      No campaigns have been published yet. Be the first.
                    </p>
                  </>
                )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
