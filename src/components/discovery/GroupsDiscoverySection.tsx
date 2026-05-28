import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';
import { CommunityGrid } from '@/components/discovery/CommunityGrid';
import {
  CommunityMiniCard,
  CommunityMiniCardSkeleton,
} from '@/components/discovery/CommunityMiniCard';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoveryFilters } from '@/hooks/useDiscoveryFilters';
import { useFeaturedOrganizations } from '@/hooks/useFeaturedOrganizations';
import { useNip50Search } from '@/hooks/useNip50Search';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';

interface GroupsDiscoverySectionProps {
  /**
   * Where this section's filter state lives. See
   * `CampaignsDiscoverySection` for the rationale.
   */
  filterPersistence: 'url' | 'local';
  /**
   * Visible-row cap for the **idle** featured-first view. The active
   * (search / sort) view always shows the full result set. Defaults
   * to unlimited (`undefined`).
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
 * Unified groups discovery section: section header + toolbar +
 * idle/active grid.
 *
 *   • **Idle** (default sort, empty query) — renders ONLY
 *     moderator-featured groups. No fallback to a chronological "all
 *     groups" grid: that produced a flash of unrelated communities
 *     while the relay returned every kind-34550 event before the
 *     client-side Agora-tag filter ran. The skeleton is gated on the
 *     featured query itself so the idle view goes
 *     skeleton → curated grid without an intermediate state.
 *
 *   • **Active** (search / Top / New) — renders the full relay
 *     search result set, post-filtered against name / description /
 *     content client-side because group names live in tags and most
 *     NIP-50 relays only match `content`.
 *
 * Groups aren't country-scoped (a community is its own scope), so
 * the country picker is intentionally omitted from the toolbar even
 * though Campaigns and Pledges expose it.
 */
export function GroupsDiscoverySection({
  filterPersistence,
  idleLimit,
  showHidden: showHiddenProp,
}: GroupsDiscoverySectionProps) {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const filters = useDiscoveryFilters({
    urlPrefix: filterPersistence === 'url' ? '' : undefined,
    enableCountry: false,
  });

  const trimmedSearch = filters.debouncedSearch.trim();
  const showHiddenValue = showHiddenProp?.value ?? false;
  const hiddenCount = showHiddenProp?.count ?? 0;

  const {
    data: searchHitsRaw,
    isFetching: isSearchFetching,
    isActive: isSearching,
  } = useNip50Search<ParsedCommunity>({
    kind: COMMUNITY_DEFINITION_KIND,
    query: filters.debouncedSearch,
    sort: filters.sort,
    parse: parseCommunityEvent,
    // Group names and descriptions live in tags, not `content`. Relay
    // NIP-50 implementations that only match content silently miss
    // obvious title hits — widen client-side by also checking these
    // tag values.
    getKeywordHaystack: (event) => {
      const name = event.tags.find(([n]) => n === 'name')?.[1] ?? '';
      const description = event.tags.find(([n]) => n === 'description')?.[1] ?? '';
      return [name, description, event.content];
    },
  });

  const { data: orgModeration, isReady: orgModerationReady } =
    useOrganizationModeration();

  const searchHits = useMemo(() => {
    if (!searchHitsRaw) return undefined;
    const hiddenCoords = orgModeration?.hiddenCoords ?? new Set<string>();
    const visible: ParsedCommunity[] = [];
    for (const c of searchHitsRaw) {
      if (hiddenCoords.has(c.aTag)) {
        if (showHiddenValue) visible.push(c);
      } else {
        visible.push(c);
      }
    }
    return visible;
  }, [searchHitsRaw, orgModeration, showHiddenValue]);

  // Featured groups — the curated list moderators publish. This is
  // the entire idle-mode payload: no chronological fallback, no
  // client-side tag filter, no "fetch everything and pick the Agora
  // ones out of it" dance. Hidden coords are dropped (unless a
  // moderator has flipped Show hidden on).
  const { data: featuredOrgs, isLoading: featuredOrgsLoading } =
    useFeaturedOrganizations();

  const featuredGroups = useMemo<ParsedCommunity[]>(() => {
    if (!featuredOrgs) return [];
    const hiddenCoords = orgModeration?.hiddenCoords ?? new Set<string>();
    const list = featuredOrgs
      .map((entry) => entry.community)
      .filter((c) => (isMod && showHiddenValue) || !hiddenCoords.has(c.aTag));
    return idleLimit ? list.slice(0, idleLimit) : list;
  }, [featuredOrgs, orgModeration, isMod, showHiddenValue, idleLimit]);

  // Idle-render skeleton gate. `useFeaturedOrganizations` is
  // internally gated on `moderationReady`, so while the moderation
  // labels are still loading, the hook is *disabled* and reports
  // `isLoading: false` / `data: undefined`. Treating that as "not
  // loading" would render the empty state for a moment before the
  // curated grid pops in; tracking moderation-readiness here keeps
  // the skeleton on screen until we know what's featured.
  const idleLoading =
    !orgModerationReady || featuredOrgsLoading || featuredOrgs === undefined;

  return (
    <section className="space-y-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {trimmedSearch ? t('common.search') : t('groups.list.allGroups')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isSearching && searchHits
              ? t('common.searchResultsCount', { count: searchHits.length })
              : t('groups.list.allGroupsTagline')}
          </p>
        </div>
        <DiscoverySearchToolbar
          query={filters.searchInput}
          onQueryChange={filters.setSearchInput}
          sort={filters.sort}
          onSortChange={filters.setSort}
          sortOptions={['top', 'new']}
          searchPlaceholderKey="groups.list.searchPlaceholder"
          searchAriaLabelKey="groups.list.searchAriaLabel"
          showHidden={
            isMod && showHiddenProp
              ? {
                  value: showHiddenProp.value,
                  onChange: showHiddenProp.onChange,
                  count: hiddenCount,
                }
              : undefined
          }
        />
      </div>

      {isSearching ? (
        <>
          {isSearchFetching && !searchHits ? (
            <CommunityGrid>
              {Array.from({ length: 8 }).map((_, i) => (
                <CommunityMiniCardSkeleton key={i} className="w-full" />
              ))}
            </CommunityGrid>
          ) : searchHits && searchHits.length > 0 ? (
            <CommunityGrid>
              {searchHits.map((community) => (
                <CommunityMiniCard
                  key={community.aTag}
                  community={community}
                  className="w-full"
                />
              ))}
            </CommunityGrid>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center space-y-2">
                {trimmedSearch ? (
                  <>
                    <p className="text-base font-medium">
                      {t('groups.list.noMatch', { query: trimmedSearch })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('groups.list.noMatchHint')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('groups.list.noFeaturedBody', { appName: config.appName })}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : idleLoading ? (
        <CommunityGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <CommunityMiniCardSkeleton key={i} className="w-full" />
          ))}
        </CommunityGrid>
      ) : featuredGroups.length > 0 ? (
        <CommunityGrid>
          {featuredGroups.map((community) => (
            <CommunityMiniCard
              key={community.aTag}
              community={community}
              className="w-full"
            />
          ))}
        </CommunityGrid>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('groups.list.noFeaturedBody', { appName: config.appName })}
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
