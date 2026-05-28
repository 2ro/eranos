import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HandHeart, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { useAllCampaigns, toQuerySort } from '@/hooks/useAllCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoveryFilters } from '@/hooks/useDiscoveryFilters';
import type { ParsedCampaign } from '@/lib/campaign';

interface CampaignsDiscoverySectionProps {
  /**
   * Where this section's filter state lives:
   *
   *   • `'url'` — flat URL params (`?q=&sort=&country=`). Used by the
   *     dedicated `/campaigns/all` page so search results are
   *     shareable and survive refresh.
   *   • `'local'` — local-only state. Used by `/` where three
   *     discovery sections coexist and can't all own `?q=`.
   */
  filterPersistence: 'url' | 'local';
  /**
   * Visible-row cap for the **idle** featured-first view. The active
   * (search / sort / country) view always shows the full result set,
   * because the user has explicitly asked to browse. Defaults to
   * unlimited (`undefined`).
   */
  idleLimit?: number;
  /**
   * Optional hoisted Show-hidden state. When provided, the toolbar
   * exposes the mod-only switch and uses this state. The page can
   * read the same value to drive a separate Hidden collapsible. When
   * omitted, the switch never appears.
   */
  showHidden?: {
    value: boolean;
    onChange: (next: boolean) => void;
    /** Hidden-count badge for the toolbar chip. */
    count?: number;
  };
}

/**
 * Unified campaigns discovery section: section header + toolbar +
 * idle/active grid.
 *
 * The section has two display modes:
 *
 *   1. **Idle** (no search, no sort, no country picked) — renders the
 *      moderator-curated featured grid. Falls back to the
 *      chronological grid when nothing is featured yet so the section
 *      is never blank.
 *   2. **Active** — renders the full ranked / chronological / country-
 *      scoped result set.
 *
 * Hidden campaigns are excluded by default. Moderators can flip the
 * Show-hidden switch in the toolbar; the section reads that state
 * from the `showHidden` prop so a page can persist it across
 * multiple shelves (e.g. the Hidden collapsible mod section).
 *
 * Search is post-filtered client-side across title / summary / story /
 * location / categories — relay NIP-50 sort-by-top doesn't account
 * for sats raised, which is the ranking signal users actually want
 * when searching for campaigns.
 */
export function CampaignsDiscoverySection({
  filterPersistence,
  idleLimit,
  showHidden: showHiddenProp,
}: CampaignsDiscoverySectionProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const filters = useDiscoveryFilters({
    urlPrefix: filterPersistence === 'url' ? '' : undefined,
    enableCountry: true,
  });

  const activeQuery = filters.debouncedSearch.trim();
  const isActive =
    activeQuery !== '' || filters.sort !== 'default' || !!filters.country;

  const { data: campaigns, isLoading } = useAllCampaigns({
    sort: toQuerySort(filters.sort),
    search: activeQuery,
    countryCode: filters.country,
    limit: 200,
  });

  const { data: moderation, isReady: moderationReady } = useCampaignModeration();

  // Featured slot list — derived from moderation labels. Hidden
  // coords dropped so a featured-then-hidden campaign disappears
  // from the row.
  const featuredCoords = useMemo(() => {
    if (!moderationReady) return [] as string[];
    return Array.from(moderation.featuredCoords)
      .filter((coord) => !moderation.hiddenCoords.has(coord))
      .sort(
        (a, b) =>
          (moderation.featuredOrder.get(b) ?? 0) -
          (moderation.featuredOrder.get(a) ?? 0),
      );
  }, [moderation, moderationReady]);

  const { data: featuredCampaigns } = useCampaigns({
    coordinates: featuredCoords,
    limit: featuredCoords.length || 1,
    // Mirrors the pledges section's pattern: don't enable the query
    // when there are no coords to fetch. `useCampaigns` already
    // short-circuits internally on an empty `coordinates` array, so
    // this is purely about not creating a meaningless cache entry.
    enabled: moderationReady && featuredCoords.length > 0,
  });

  const showHiddenValue = showHiddenProp?.value ?? false;

  // Visible campaigns in the **active** branch: every campaign
  // matching the search / sort / country, minus hidden (unless the
  // moderator opted in). Featured items are intentionally NOT pulled
  // out — when the user is actively browsing, they want a ranked or
  // chronological grid, not the curated shelf.
  const visible = useMemo(() => {
    const all = campaigns ?? [];
    const hiddenCoords = moderation?.hiddenCoords ?? new Set<string>();
    const out: ParsedCampaign[] = [];
    for (const c of all) {
      if (hiddenCoords.has(c.aTag)) {
        if (isMod && showHiddenValue) out.push(c);
      } else {
        out.push(c);
      }
    }
    return out;
  }, [campaigns, isMod, moderation, showHiddenValue]);

  const orderedFeaturedCampaigns = useMemo(() => {
    if (!featuredCampaigns) return [] as ParsedCampaign[];
    return [...featuredCampaigns].sort(
      (a, b) =>
        (moderation.featuredOrder.get(b.aTag) ?? 0) -
        (moderation.featuredOrder.get(a.aTag) ?? 0),
    );
  }, [featuredCampaigns, moderation]);

  // Idle-mode list: featured first; if nothing is featured, fall back
  // to the latest chronological grid so the section is never blank
  // when there's content to show.
  const idleCampaigns = useMemo<ParsedCampaign[]>(() => {
    const list =
      orderedFeaturedCampaigns.length > 0 ? orderedFeaturedCampaigns : visible;
    return idleLimit ? list.slice(0, idleLimit) : list;
  }, [orderedFeaturedCampaigns, visible, idleLimit]);

  const showSkeleton = isLoading || !moderationReady;
  const listForRender = isActive ? visible : idleCampaigns;
  const hiddenCount = showHiddenProp?.count ?? 0;
  const hiddenAllOfThem = !isActive && hiddenCount > 0 && !showHiddenValue;

  return (
    <section className="space-y-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {activeQuery ? t('common.search') : t('campaigns.all.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeQuery
              ? t('common.searchResultsCount', { count: visible.length })
              : t('campaigns.all.sectionTagline')}
          </p>
        </div>
        <DiscoverySearchToolbar
          query={filters.searchInput}
          onQueryChange={filters.setSearchInput}
          sort={filters.sort}
          onSortChange={filters.setSort}
          sortOptions={['top', 'new']}
          searchPlaceholderKey="campaigns.all.searchPlaceholder"
          searchAriaLabelKey="campaigns.all.searchAriaLabel"
          showHidden={
            isMod && showHiddenProp
              ? {
                  value: showHiddenProp.value,
                  onChange: showHiddenProp.onChange,
                  count: hiddenCount,
                }
              : undefined
          }
          country={filters.country}
          onCountryChange={filters.setCountry}
        />
      </div>

      {showSkeleton ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      ) : listForRender.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center space-y-4">
            <HandHeart className="size-10 text-muted-foreground mx-auto" />
            <div className="space-y-1.5">
              {activeQuery ? (
                <>
                  <h3 className="text-lg font-semibold">
                    {t('campaigns.all.noMatch', { query: activeQuery })}
                  </h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    {t('campaigns.all.noMatchHint')}
                  </p>
                </>
              ) : hiddenAllOfThem ? (
                <>
                  <h3 className="text-lg font-semibold">
                    {t('campaigns.all.allHidden')}
                  </h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    {t('campaigns.all.allHiddenHint')}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold">
                    {t('campaigns.all.empty')}
                  </h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    {t('campaigns.all.emptyHint')}
                  </p>
                </>
              )}
            </div>
            <Button asChild>
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-2" />
                {t('campaigns.all.startCampaign')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {listForRender.map((campaign) => (
            <CampaignCard key={campaign.aTag} campaign={campaign} />
          ))}
        </div>
      )}
    </section>
  );
}
