import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionShareMenu } from '@/components/ActionShareMenu';
import { Card } from '@/components/ui/card';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { ModerationOverlay } from '@/components/moderation';
import { PledgeCard, PledgeCardSkeleton } from '@/components/PledgeCard';
import { parseAction, useActions, type Action } from '@/hooks/useActions';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoveryFilters } from '@/hooks/useDiscoveryFilters';
import { useNip50Search } from '@/hooks/useNip50Search';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';
import { getPledgeCoord } from '@/lib/pledges';

interface PledgesDiscoverySectionProps {
  /**
   * Where this section's filter state lives. See
   * `CampaignsDiscoverySection` for the rationale.
   */
  filterPersistence: 'url' | 'local';
  /**
   * Visible-row cap for the **idle** featured-first view. The active
   * (search / sort / country) view always shows the full result set.
   * Defaults to unlimited (`undefined`).
   */
  idleLimit?: number;
  /**
   * Optional hoisted Show-hidden state. When provided, the toolbar
   * exposes the mod-only switch and uses this state. The page can
   * read the same value to drive a separate Hidden collapsible.
   */
  showHidden?: {
    value: boolean;
    onChange: (next: boolean) => void;
    /** Hidden-count badge for the toolbar chip. */
    count?: number;
  };
}

/**
 * Unified pledges discovery section: section header + toolbar +
 * idle/active grid.
 *
 *   • **Idle** (no search / no sort / no country) — renders the
 *     moderator-featured pledges, falling back to chronological
 *     all-pledges when nothing is featured yet.
 *
 *   • **Active** — renders the full search / sort / country-scoped
 *     result set, post-filtered against title / content client-side.
 *     Picking a country with an empty query still activates the
 *     search view — narrowing kind 36639 by NIP-73 `iso3166:XX` +
 *     legacy `geo:XX` tags produces a useful filtered grid even
 *     without a typed term.
 */
export function PledgesDiscoverySection({
  filterPersistence,
  idleLimit,
  showHidden: showHiddenProp,
}: PledgesDiscoverySectionProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const filters = useDiscoveryFilters({
    urlPrefix: filterPersistence === 'url' ? '' : undefined,
    enableCountry: true,
  });

  const trimmedSearch = filters.debouncedSearch.trim();
  const showHiddenValue = showHiddenProp?.value ?? false;
  const canShowHidden = isMod && showHiddenValue;
  const hiddenCount = showHiddenProp?.count ?? 0;

  // Country → NIP-73 `#i` tag list. Picking a country with no typed
  // query still activates the search view; narrowing a kind by
  // external identifier produces a useful filtered grid even without
  // a typed term.
  const iTags = useMemo<string[] | undefined>(() => {
    if (!filters.country) return undefined;
    const code = filters.country.toUpperCase();
    return [`iso3166:${code}`, `geo:${code}`];
  }, [filters.country]);

  const {
    data: searchHitsRaw,
    isFetching: isSearchFetching,
    isActive: isSearching,
  } = useNip50Search<Action>({
    kind: 36639,
    query: filters.debouncedSearch,
    sort: filters.sort,
    parse: parseAction,
    iTags,
    // Pledge titles live in a `title` tag, not `content`. Most NIP-50
    // implementations only match content; widen the net client-side.
    getKeywordHaystack: (event) => {
      const title = event.tags.find(([n]) => n === 'title')?.[1] ?? '';
      return [title, event.content];
    },
  });

  // Chronological feed that backs the idle grid (and the
  // featured-then-chronological fallback). Gated on `!isSearching`
  // because the search branch renders `searchHits` instead and never
  // reads `rawActions` / `actions` — leaving this query enabled during
  // search burns a 300-event relay round-trip on every keystroke that
  // activates the search view. The idle branch is the only consumer,
  // and the idle branch only renders when `!isSearching`, so this
  // gate strictly removes wasted work.
  const { data: rawActions, isLoading: actionsLoading } = useActions({
    countryCode: filters.country,
    limit: 300,
    enabled: !isSearching,
  });

  const { data: pledgeModeration, isReady: pledgeModerationReady } =
    usePledgeModeration();

  const featuredPledgeCoords = useMemo(() => {
    if (!pledgeModerationReady) return [] as string[];
    return Array.from(pledgeModeration.featuredCoords)
      .filter((coord) => !pledgeModeration.hiddenCoords.has(coord))
      .sort(
        (a, b) =>
          (pledgeModeration.featuredOrder.get(b) ?? 0) -
          (pledgeModeration.featuredOrder.get(a) ?? 0),
      );
  }, [pledgeModeration, pledgeModerationReady]);

  const { data: featuredPledges } = useActions({
    coordinates: featuredPledgeCoords,
    limit: featuredPledgeCoords.length || 1,
    enabled: pledgeModerationReady && featuredPledgeCoords.length > 0,
  });

  const orderedFeaturedPledges = useMemo(() => {
    if (!featuredPledges || !pledgeModerationReady) return [] as Action[];
    const order = pledgeModeration.featuredOrder;
    return [...featuredPledges].sort((a, b) => {
      const aCoord = getPledgeCoord(a);
      const bCoord = getPledgeCoord(b);
      return (order.get(bCoord) ?? 0) - (order.get(aCoord) ?? 0);
    });
  }, [featuredPledges, pledgeModeration, pledgeModerationReady]);

  const featuredPledgeCoordSet = useMemo(
    () => new Set(featuredPledgeCoords),
    [featuredPledgeCoords],
  );

  const searchHits = useMemo(() => {
    if (!searchHitsRaw) return undefined;
    const hiddenCoords = pledgeModeration?.hiddenCoords ?? new Set<string>();
    const visible: Action[] = [];
    for (const a of searchHitsRaw) {
      const coord = getPledgeCoord(a);
      if (hiddenCoords.has(coord)) {
        if (canShowHidden) visible.push(a);
      } else {
        visible.push(a);
      }
    }
    return visible;
  }, [searchHitsRaw, pledgeModeration, canShowHidden]);

  // Chronological pledge list filtered by country, with
  // moderator-hidden items dropped (unless `showHidden` is on).
  // Featured pledges are NOT excluded here — the idle render path
  // pulls them separately, and the active render path shows the
  // full list.
  const actions = useMemo(() => {
    if (!rawActions) return undefined;
    const hiddenCoords = pledgeModeration?.hiddenCoords ?? new Set<string>();
    const visible: Action[] = [];
    for (const action of rawActions) {
      const coord = getPledgeCoord(action);
      if (hiddenCoords.has(coord)) {
        if (canShowHidden) visible.push(action);
      } else {
        visible.push(action);
      }
    }
    return visible;
  }, [rawActions, pledgeModeration, canShowHidden]);

  const isLoading = actionsLoading || !pledgeModerationReady;
  const isSearchLoading = isSearchFetching || !pledgeModerationReady;

  // Idle list: featured first; if none are featured, fall back to
  // the chronological all-pledges grid so the section is never blank.
  const idlePledges = useMemo<Action[]>(() => {
    const list =
      orderedFeaturedPledges.length > 0
        ? orderedFeaturedPledges
        : (actions ?? []).filter(
            (action) => !featuredPledgeCoordSet.has(getPledgeCoord(action)),
          );
    return idleLimit ? list.slice(0, idleLimit) : list;
  }, [orderedFeaturedPledges, actions, featuredPledgeCoordSet, idleLimit]);

  const renderPledge = (action: Action) => (
    <PledgeCard
      key={`${action.pubkey}:${action.id}`}
      action={action}
      showAuthor
      showTranslate
      topRight={
        <>
          <ModerationOverlay
            coord={getPledgeCoord(action)}
            entityTitle={action.title}
            surface="pledge"
            axes={['hide', 'featured']}
            showMenu={false}
            className="flex items-center"
          />
          <ActionShareMenu action={action} displayTitle={action.title} />
        </>
      }
    />
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {trimmedSearch ? t('common.search') : t('pledges.list.allPledges')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isSearching && searchHits
              ? t('common.searchResultsCount', { count: searchHits.length })
              : t('pledges.list.allPledgesTagline')}
          </p>
        </div>
        <DiscoverySearchToolbar
          query={filters.searchInput}
          onQueryChange={filters.setSearchInput}
          sort={filters.sort}
          onSortChange={filters.setSort}
          sortOptions={['top', 'new']}
          searchPlaceholderKey="pledges.list.searchPlaceholder"
          searchAriaLabelKey="pledges.list.searchAriaLabel"
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

      {isSearching ? (
        <>
          {isSearchLoading && !searchHits ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <PledgeCardSkeleton key={i} />
              ))}
            </div>
          ) : searchHits && searchHits.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {searchHits.map(renderPledge)}
            </div>
          ) : (
            <Card className="border-dashed">
              <div className="py-12 px-8 text-center space-y-2">
                {trimmedSearch ? (
                  <>
                    <p className="text-base font-medium">
                      {t('pledges.list.noMatch', { query: trimmedSearch })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('pledges.list.noMatchHint')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('pledges.list.emptyTitle')}
                  </p>
                )}
              </div>
            </Card>
          )}
        </>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <PledgeCardSkeleton key={i} />
          ))}
        </div>
      ) : idlePledges.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {idlePledges.map(renderPledge)}
        </div>
      ) : (
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('pledges.list.emptyTitle')}
            </p>
          </div>
        </Card>
      )}
    </section>
  );
}
