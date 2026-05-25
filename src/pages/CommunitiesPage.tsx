import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, EyeOff, Globe2, HandHeart, Hourglass, PlusCircle, Users } from 'lucide-react';

import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityGrid } from '@/components/discovery/CommunityGrid';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { ModeratorCollapsibleSection } from '@/components/moderation';
import { COOL_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDebounce } from '@/hooks/useDebounce';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useFeaturedOrganizations } from '@/hooks/useFeaturedOrganizations';
import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { useGlobalDonations } from '@/hooks/useGlobalDonations';
import { useNip50Search, type Nip50Sort } from '@/hooks/useNip50Search';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { useToast } from '@/hooks/useToast';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { hasAgoraTag } from '@/lib/agoraNoteTags';
import { formatSatsShort } from '@/lib/formatCampaignAmount';
import { COMMUNITY_DEFINITION_KIND, parseCommunityEvent, type ParsedCommunity } from '@/lib/communityUtils';

// ─── Page ──────────────────────────────────────────────────────────────────────

export function CommunitiesPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const userOrganizations = useUserOrganizations();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Moderator gate. Reuses the campaign moderator pack (Team Soapbox) —
  // see useOrganizationModeration for why the same pack governs both
  // surfaces. The `isMod` boolean drives the visibility of the two
  // collapsible review sections at the bottom of the page; the heavy
  // discovery + moderation queries that power them are themselves
  // mounted INSIDE the moderator-only subtree so non-mod viewers don't
  // pay the cost of fetching 200 orgs and folding labels just to never
  // render anything.
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  useSeoMeta({
    title: `${t('groups.list.seoTitle')} | ${config.appName}`,
    description: t('groups.list.seoDescription'),
  });

  const handleCreateCommunity = () => {
    if (!user) {
      toast({
        title: t('groups.list.createGroupLoginTitle'),
        description: t('groups.list.createGroupLoginBody'),
      });
      return;
    }
    navigate('/groups/new');
  };

  // On-page NIP-50 search + sort + show-hidden toolbar state.
  //
  //   Default sort, empty query, no country → curated "My groups" /
  //     "Featured" / moderator shelves below.
  //   Default sort, with query              → relay search for kind
  //     34550, results post-filtered against name/description/content
  //     client-side.
  //   Country picked (any sort/query)       → search view activates;
  //     relay query carries a NIP-73 `#i` tag filter narrowing to that
  //     country (iso3166 + legacy geo forms).
  //   Top / New                             → always active. Top sends
  //     `sort:top`; New sends a raw chronological feed of the kind.
  const [searchInput, setSearchInput] = useState('');
  const [sortMode, setSortMode] = useState<Nip50Sort>('default');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  const debouncedSearch = useDebounce(searchInput, 300);
  const trimmedSearch = debouncedSearch.trim();
  const iTags = useMemo<string[] | undefined>(() => {
    if (!selectedCountry) return undefined;
    const code = selectedCountry.toUpperCase();
    return [`iso3166:${code}`, `geo:${code}`];
  }, [selectedCountry]);
  const {
    data: searchHitsRaw,
    isFetching: isSearchFetching,
    isActive: isSearching,
  } = useNip50Search<ParsedCommunity>({
    kind: COMMUNITY_DEFINITION_KIND,
    query: debouncedSearch,
    sort: sortMode,
    parse: parseCommunityEvent,
    iTags,
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

  // Lift org moderation to the page so search results can drop hidden
  // groups (or include them when the Show-hidden switch is on). The
  // ModeratorReviewSections subtree below still calls its own copy of
  // the hook — query results are cached, so the second call is free.
  const { data: orgModeration } = useOrganizationModeration();
  const { searchHits, searchHiddenCount } = useMemo(() => {
    if (!searchHitsRaw) return { searchHits: undefined, searchHiddenCount: 0 };
    const hiddenCoords = orgModeration?.hiddenCoords ?? new Set<string>();
    let hidden = 0;
    const visible: ParsedCommunity[] = [];
    for (const c of searchHitsRaw) {
      if (hiddenCoords.has(c.aTag)) {
        hidden += 1;
        if (showHidden) visible.push(c);
      } else {
        visible.push(c);
      }
    }
    return { searchHits: visible, searchHiddenCount: hidden };
  }, [searchHitsRaw, orgModeration, showHidden]);

  // Search + sort + show-hidden cluster reused on both branches' top
  // section row. Factored out so the "My groups" heading (curated
  // layout) and the "Search / Top / New" heading (search-active layout)
  // both render the same affordance without duplicating the prop list.
  const searchToolbar = (
    <DiscoverySearchToolbar
      query={searchInput}
      onQueryChange={setSearchInput}
      sort={sortMode}
      onSortChange={setSortMode}
      searchPlaceholderKey="groups.list.searchPlaceholder"
      searchAriaLabelKey="groups.list.searchAriaLabel"
      showHidden={{
        value: showHidden,
        onChange: setShowHidden,
        count: searchHiddenCount,
      }}
      country={selectedCountry}
      onCountryChange={setSelectedCountry}
    />
  );

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <CommunitiesHero onCreateCommunity={handleCreateCommunity} />

      {isSearching ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {trimmedSearch
                    ? t('common.search')
                    : sortMode === 'top'
                      ? t('common.sortTop')
                      : t('common.sortNew')}
                </h2>
                {searchHits && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('common.searchResultsCount', { count: searchHits.length })}
                  </p>
                )}
              </div>
              {searchToolbar}
            </div>

            {isSearchFetching && !searchHits ? (
              <CommunityGrid className="px-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <CommunityMiniCardSkeleton key={i} className="w-full" />
                ))}
              </CommunityGrid>
            ) : searchHits && searchHits.length > 0 ? (
              <CommunityGrid className="px-0">
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
          </section>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10 sm:space-y-12 pb-8 pt-10 lg:pt-14">
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {t('groups.list.myGroups')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('groups.list.myGroupsTagline')}
                </p>
              </div>
              {searchToolbar}
            </div>
            <MyCommunitiesShelf
              userOrganizations={userOrganizations}
              onCreateCommunity={handleCreateCommunity}
            />
          </section>

          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {t('groups.list.featuredGroups')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('groups.list.featuredGroupsTagline')}
                </p>
              </div>
            </div>
            <FeaturedOrganizationsShelf />
          </section>

          {/* Moderator-only review sections: "Needs review" and "Hidden".
              Organizations have a two-axis moderation model (featured /
              hidden — no approval gate), so anything not yet labelled
              simply lives in the public Featured-or-not space. The Needs
              review queue surfaces unlabelled Agora-tagged orgs so
              moderators can pick what to feature or hide. */}
          {isMod && <ModeratorReviewSections />}
        </div>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Moderator review sections
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the "Needs review" and "Hidden" rails for moderators only.
 *
 * Organizations don't have an `approved` axis (unlike campaigns) — every
 * Agora-tagged org is publicly visible by default. Moderation reduces to:
 *
 * - **Needs review** — orgs minted through Agora (carry `t:agora`) that
 *   have no featured or hidden label yet. These are candidates for
 *   either lifting into Featured or suppressing with Hidden.
 * - **Hidden** — orgs whose latest hide-axis label is `hidden`.
 *
 * The component owns its own data fetches (discovery pool + moderation
 * rollup) so the page can mount it conditionally on `isMod` and skip
 * both queries entirely for the overwhelmingly common non-moderator
 * case. Mirrors the campaign side's `ModeratorSection` pattern
 * (collapsible, defaults to open when the list is short).
 */
function ModeratorReviewSections() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  // Wider pull than the public discovery shelf so reviewers see deeper
  // history. Bumping the limit further would just add network cost —
  // anything truly old can be reviewed by visiting it directly.
  const { data: allOrgs, isLoading } = useDiscoverCommunities({ limit: 200 });
  const { data: moderation, isReady } = useOrganizationModeration();

  const needsReviewOrgs = useMemo(() => {
    if (!moderation || !allOrgs) return [] as ParsedCommunity[];
    return allOrgs.filter(
      (org) =>
        // Restrict the review queue to orgs minted through Agora's create
        // flow. Without this gate, every kind 34550 community on the
        // network would appear here — including badge-gated NIP-72
        // communities, music scenes, etc. — none of which Agora moderators
        // should be expected to triage.
        hasAgoraTag(org.tags) &&
        !moderation.featuredCoords.has(org.aTag) &&
        !moderation.hiddenCoords.has(org.aTag),
    );
  }, [moderation, allOrgs]);

  const hiddenOrgs = useMemo(() => {
    if (!moderation || !allOrgs) return [] as ParsedCommunity[];
    return allOrgs.filter((org) => moderation.hiddenCoords.has(org.aTag));
  }, [moderation, allOrgs]);

  const sectionsLoading = isLoading || !isReady;

  return (
    <>
      <ModeratorCollapsibleSection
        icon={<Hourglass className="size-4" />}
        title={t('groups.list.needsReview')}
        description={t('groups.list.needsReviewDesc', { appName: config.appName })}
        count={needsReviewOrgs.length}
        isLoading={sectionsLoading}
        emptyText={t('groups.list.needsReviewEmpty')}
        size="compact"
        triggerPaddingClassName="pb-3"
        skeleton={
          <CommunityGrid className="px-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <CommunityMiniCardSkeleton key={i} className="w-full" />
            ))}
          </CommunityGrid>
        }
      >
        <CommunityGrid className="px-0">
          {needsReviewOrgs.map((org) => (
            <CommunityMiniCard key={org.aTag} community={org} className="w-full" />
          ))}
        </CommunityGrid>
      </ModeratorCollapsibleSection>
      <ModeratorCollapsibleSection
        icon={<EyeOff className="size-4" />}
        title={t('groups.list.hidden')}
        description={t('groups.list.hiddenDesc')}
        count={hiddenOrgs.length}
        isLoading={sectionsLoading}
        emptyText={t('groups.list.hiddenEmpty')}
        size="compact"
        triggerPaddingClassName="pb-3"
        skeleton={
          <CommunityGrid className="px-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <CommunityMiniCardSkeleton key={i} className="w-full" />
            ))}
          </CommunityGrid>
        }
      >
        <CommunityGrid className="px-0">
          {hiddenOrgs.map((org) => (
            <CommunityMiniCard key={org.aTag} community={org} className="w-full" />
          ))}
        </CommunityGrid>
      </ModeratorCollapsibleSection>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

interface CommunitiesHeroProps {
  onCreateCommunity: () => void;
}

interface TickerStat {
  id: string;
  value: string;
  label: string;
  icon: React.ReactNode;
}

function CommunitiesHero({ onCreateCommunity }: CommunitiesHeroProps) {
  const { t } = useTranslation();
  const { data: featured } = useFeaturedOrganizations();
  const { data: activityByCountry } = useGlobalActivity();
  const { data: donations, isLoading: donationsLoading } = useGlobalDonations();
  const [hueIndex, setHueIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % COOL_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);

  const activeHue = COOL_PALETTE[hueIndex];

  const stats = useMemo<TickerStat[]>(() => {
    const items: TickerStat[] = [];

    if (donations && donations.totalSats > 0) {
      items.push({
        id: 'sats',
        value: formatSatsShort(donations.totalSats),
        label: t('groups.list.tickerCampaignsRaised', { count: donations.campaignCount }),
        icon: <HandHeart className="size-5" aria-hidden />,
      });
    }
    if (featured && featured.length > 0) {
      items.push({
        id: 'groups',
        value: featured.length.toLocaleString(),
        label: t('groups.list.tickerFeaturedGroups', { count: featured.length }),
        icon: <Users className="size-5" aria-hidden />,
      });
    }
    if (activityByCountry && activityByCountry.size > 0) {
      items.push({
        id: 'countries',
        value: activityByCountry.size.toLocaleString(),
        label: t('groups.list.tickerCountries', { count: activityByCountry.size }),
        icon: <Globe2 className="size-5" aria-hidden />,
      });
    }
    return items;
  }, [donations, featured, activityByCountry, t]);

  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    if (stats.length <= 1) return;
    const id = window.setInterval(() => {
      setTickerIndex((i) => (i + 1) % stats.length);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [stats.length]);

  const currentStat = stats[tickerIndex % Math.max(stats.length, 1)];

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      {/* Rotating photo banner — World Liberty Congress events. Crossfades
          every 7s and pans slowly between cuts. Sits at the bottom of the
          stack so atmosphere, scrims, and content layer above it. */}
      <HeroBanner />

      {/* Cool atmosphere — blue/green hues rotate independently of the
          banner cycle. The explicit `hue` prop overrides the warm
          seed-derived default HeroAtmosphere uses on campaign pages. The
          screen-blend gradients tint the photo without flattening it. */}
      <HeroAtmosphere hue={activeHue} />

      {/* Top scrim so the headline stays legible regardless of which
          photo is currently on top. */}
      <div
        className="absolute inset-x-0 top-0 h-64 sm:h-80 pointer-events-none bg-gradient-to-b from-black/70 via-black/40 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom scrim so the stat pill + CTA stay legible across photos. */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 sm:h-72 pointer-events-none bg-gradient-to-t from-black/70 via-black/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:py-14 min-h-[380px] sm:min-h-[420px] lg:min-h-[460px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white/85 drop-shadow">
            {t('groups.list.heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {t('groups.list.heroHeading')}
            <br className="sm:hidden" /> {t('groups.list.heroHeadingLine2')}
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {t('groups.list.heroBody')}
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-black/30 backdrop-blur-xl backdrop-saturate-150 border border-white/20 px-5 py-3 shadow-lg shadow-teal-500/10"
          aria-live="polite"
        >
          {currentStat ? (
            <div
              key={currentStat.id}
              className="flex items-center justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
            >
              <span className="text-cyan-200 shrink-0 drop-shadow">{currentStat.icon}</span>
              <span className="text-sm sm:text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                {currentStat.value}
              </span>
              <span className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                {currentStat.label}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              {donationsLoading ? (
                <>
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : (
                <span className="text-xs text-white/85 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                  {t('groups.list.connectingRelays')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={onCreateCommunity}
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-cyan-100/10 to-emerald-100/10 hover:from-white/20 hover:via-cyan-100/14 hover:to-emerald-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(186_75%_45%/0.45)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(186_75%_45%/0.55)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <PlusCircle className="mr-2" />
            {t('groups.list.createGroup')}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Community shelves
// ═══════════════════════════════════════════════════════════════════════════════

type UserOrganizationsResult = ReturnType<typeof useUserOrganizations>;

function MyCommunitiesShelf({
  userOrganizations,
  onCreateCommunity,
}: {
  userOrganizations: UserOrganizationsResult;
  onCreateCommunity: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title={t('groups.list.loginToSeeTitle')}
        body={t('groups.list.loginToSeeBody')}
        action={<LoginArea className="max-w-60" />}
      />
    );
  }

  return (
    <MyCommunitiesShelfContent
      userOrganizations={userOrganizations}
      onCreateCommunity={onCreateCommunity}
    />
  );
}

function MyCommunitiesShelfContent({
  userOrganizations,
  onCreateCommunity,
}: {
  userOrganizations: UserOrganizationsResult;
  onCreateCommunity: () => void;
}) {
  const { t } = useTranslation();
  // "My organizations" = orgs the user founded, moderates, or follows.
  // Sorting is founder first, moderator second, followed-only last, with
  // newest community definition revisions first inside each bucket.
  const { data: organizations, isLoading } = userOrganizations;
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <CommunityGrid className="px-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} className="w-full" />
        ))}
      </CommunityGrid>
    );
  }

  if (!organizations || organizations.length === 0) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title={t('groups.list.noGroupsTitle')}
        body={t('groups.list.noGroupsBody')}
        action={(
          <Button type="button" onClick={onCreateCommunity} className="rounded-full">
            <PlusCircle className="size-4 mr-2" />
            {t('groups.list.createGroup')}
          </Button>
        )}
      />
    );
  }

  const COLLAPSED_COUNT = 4;
  const visible = expanded ? organizations : organizations.slice(0, COLLAPSED_COUNT);
  const canExpand = organizations.length > COLLAPSED_COUNT;

  return (
    <div className="space-y-4">
      <CommunityGrid className="px-0">
        {visible.map((entry) => (
          <CommunityMiniCard
            key={entry.community.aTag}
            community={entry.community}
            className="w-full"
          />
        ))}
      </CommunityGrid>
      {canExpand && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full text-sm"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4 mr-1.5" />
                {t('groups.list.showLess')}
              </>
            ) : (
              <>
                <ChevronDown className="size-4 mr-1.5" />
                {t('groups.list.showMore', { count: organizations.length - COLLAPSED_COUNT })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeaturedOrganizationsShelf() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { data: featured, isLoading } = useFeaturedOrganizations();
  const hasFeatured = !!featured && featured.length > 0;

  if (isLoading && !hasFeatured) {
    return (
      <CommunityGrid className="px-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} className="w-full" />
        ))}
      </CommunityGrid>
    );
  }

  if (!hasFeatured) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title={t('groups.list.noFeaturedTitle')}
        body={t('groups.list.noFeaturedBody', { appName: config.appName })}
        action={null}
      />
    );
  }

  return (
    <CommunityGrid className="px-0">
      {featured.map((entry) => (
        <CommunityMiniCard
          key={entry.community.aTag}
          community={entry.community}
          className="w-full"
        />
      ))}
    </CommunityGrid>
  );
}

function EmptyShelf({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 px-6 text-center space-y-3 flex flex-col items-center">
        <div className="p-3 rounded-full bg-primary/10">{icon}</div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
