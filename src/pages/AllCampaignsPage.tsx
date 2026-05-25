import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { HandHeart, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { useAllCampaigns, type CampaignSort } from '@/hooks/useAllCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useAppContext } from '@/hooks/useAppContext';
import { useDebounce } from '@/hooks/useDebounce';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import type { Nip50Sort } from '@/hooks/useNip50Search';
import type { ParsedCampaign } from '@/lib/campaign';

/** Type-guard for the `?sort=` URL param. Default is `top` (most-zapped). */
function parseSort(value: string | null): CampaignSort {
  return value === 'none' ? 'none' : 'top';
}

/**
 * Map between the shared toolbar's sort vocabulary (`default` / `top` /
 * `new`) and the `useAllCampaigns` hook's vocabulary (`top` / `none`).
 *
 * AllCampaignsPage doesn't have a curated/default layout — it's the
 * "show me everything" page — so the toolbar's 'default' option falls
 * through to 'top' here, the page's canonical ranked view. The legacy
 * `none` value is preserved on the URL so existing share links keep
 * working.
 */
const toToolbarSort = (s: CampaignSort): Nip50Sort => (s === 'none' ? 'new' : 'top');
const toQuerySort = (s: Nip50Sort): CampaignSort => (s === 'new' ? 'none' : 'top');

/**
 * Lists every campaign found on relays. Two sort modes:
 *
 * - **Top** (default): ranked by total sats raised (kind 8333 donation receipts).
 * - **New**: chronological by `created_at`.
 *
 * Both modes share a free-text search bar that filters across title,
 * summary, story, location, and category tags client-side.
 *
 * Hidden campaigns are excluded by default — flip the "Show hidden"
 * toggle (inside the toolbar's filter popover) to include them.
 *
 * URL state: `?sort=none&q=<search>`. Default values are stripped so the
 * canonical URL stays clean. Useful for sharing search results.
 */
export function AllCampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  // URL state — sort, query, and country live in the URL so results are
  // shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get('sort'));
  const urlQuery = searchParams.get('q') ?? '';
  const urlCountry = searchParams.get('country') ?? undefined;

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

  const setSortFromToolbar = (value: Nip50Sort) => {
    const next = new URLSearchParams(searchParams);
    const queryValue = toQuerySort(value);
    if (queryValue === 'none') next.set('sort', 'none');
    else next.delete('sort');
    setSearchParams(next, { replace: true });
  };

  // The country picker also rides the URL so country-scoped views are
  // shareable / linkable.
  const setCountry = (next: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('country', next);
    else params.delete('country');
    setSearchParams(params, { replace: true });
  };

  const { data: campaigns, isLoading } = useAllCampaigns({
    sort,
    search: debouncedSearch.trim(),
    countryCode: urlCountry,
    limit: 200,
  });
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();

  useSeoMeta({
    title: `${t('campaigns.all.seoTitle')} | ${config.appName}`,
    description: t('campaigns.all.description'),
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
  const totalCampaigns = campaigns?.length ?? 0;

  return (
    <main className="min-h-screen pb-16">
      <AllCampaignsHero campaignCount={totalCampaigns} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
        {/* Section heading — matches the `/pledges` and `/groups` pages
            so the discovery surfaces all share the same large-bold
            section header pattern. Title switches between Search / Top /
            New based on toolbar state; tagline stays constant.
            Search input + filter button cluster on the right, paired
            with the heading on the left in a single row. */}
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {activeQuery
                ? t('common.search')
                : sort === 'top'
                  ? t('common.sortTop')
                  : t('common.sortNew')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {activeQuery
                ? t('common.searchResultsCount', { count: visible.length })
                : t('campaigns.all.sectionTagline')}
            </p>
          </div>
          <DiscoverySearchToolbar
            query={searchInput}
            onQueryChange={setSearchInput}
            sort={toToolbarSort(sort)}
            onSortChange={setSortFromToolbar}
            sortOptions={['top', 'new']}
            searchPlaceholderKey="campaigns.all.searchPlaceholder"
            searchAriaLabelKey="campaigns.all.searchAriaLabel"
            showHidden={{
              value: showHidden,
              onChange: setShowHidden,
              count: hiddenCount,
            }}
            country={urlCountry}
            onCountryChange={setCountry}
          />
        </div>

        {/* Grid — widens to 3 columns at lg and 4 at xl so desktop users
            can scan more campaigns at once, matching the Pledge index's
            card density. Mobile and small tablets stay single / double
            column so the cards keep their tappable size. */}
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
                {activeQuery ? (
                  <>
                    <h2 className="text-lg font-semibold">
                      {t('campaigns.all.noMatch', { query: activeQuery })}
                    </h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      {t('campaigns.all.noMatchHint')}
                    </p>
                  </>
                ) : hiddenCount > 0 && !showHidden ? (
                  <>
                    <h2 className="text-lg font-semibold">{t('campaigns.all.allHidden')}</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      {t('campaigns.all.allHiddenHint')}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">{t('campaigns.all.empty')}</h2>
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

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

interface AllCampaignsHeroProps {
  /** Total campaigns currently loaded — fuels the live stat pill. */
  campaignCount: number;
}

/**
 * Photo-led hero for the All-Campaigns page. Mirrors the Pledges /
 * Communities hero recipe (rotating banner + atmospheric tint + scrims
 * + overlay copy + glassy CTA) so the three discovery pages share the
 * same visual shape. The campaign home (`/campaigns`) keeps its bespoke
 * lightning-map hero as the brand-leading entry point; this surface
 * gets the photo-led treatment because it's the actual browseable index.
 */
function AllCampaignsHero({ campaignCount }: AllCampaignsHeroProps) {
  const { t } = useTranslation();
  // Cycle through warm hues on the same cadence as the banner so the
  // whole hero feels like one coordinated moment instead of two
  // unrelated rotations.
  const [hueIndex, setHueIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % HOPE_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);
  const activeHue = HOPE_PALETTE[hueIndex];

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      {/* Rotating photo banner — uses the default WLC photo set so this
          page matches the Communities hero's photographic vocabulary. */}
      <HeroBanner />

      {/* Warm atmosphere — campaigns-side hue, same as the Pledges hero. */}
      <HeroAtmosphere hue={activeHue} />

      {/* Top scrim so the headline stays legible across every photo. */}
      <div
        className="absolute inset-x-0 top-0 h-64 sm:h-80 pointer-events-none bg-gradient-to-b from-black/70 via-black/40 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom scrim so the stat pill + CTA stay legible. */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 sm:h-72 pointer-events-none bg-gradient-to-t from-black/70 via-black/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:py-14 min-h-[380px] sm:min-h-[420px] lg:min-h-[460px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white/85 drop-shadow">
            {t('campaigns.all.heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {t('campaigns.all.heroHeading')}
            <br className="sm:hidden" /> {t('campaigns.all.heroHeadingLine2')}
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {t('campaigns.all.heroBody')}
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        {/* Live stat pill — campaigns-on-network count. */}
        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-black/30 backdrop-blur-xl backdrop-saturate-150 border border-white/20 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-3">
            <HandHeart className="size-5 text-amber-200 shrink-0 drop-shadow" aria-hidden />
            <span className="text-sm sm:text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {campaignCount.toLocaleString()}
            </span>
            <span className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {t('campaigns.all.campaignsCount', { count: campaignCount })}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(24_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(24_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <Link to="/campaigns/new">
              <PlusCircle className="mr-2" />
              {t('campaigns.all.startCampaign')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
