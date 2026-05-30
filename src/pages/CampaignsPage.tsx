import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, HandHeart, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import type { ParsedCampaign } from '@/lib/campaign';

/** Cap on how many featured campaigns we render in the home-page row. */
const MAX_FEATURED = 4;

/**
 * Home page (`/`).
 *
 * The canonical browse view for campaigns: hero, then a featured row,
 * and the full Community Campaigns grid (chronological, every campaign
 * on the network minus the ones currently hidden by moderators). A
 * toggle in the section header reveals the hidden set when a viewer
 * wants to see it; off by default so the page stays clean.
 *
 * Campaigns are the home page's sole focus. Groups and Pledges each
 * have their own dedicated browse pages (`/groups`, `/pledges`), so
 * they're intentionally absent here.
 */
export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  // Moderation labels drive the Featured row and the Hidden filter.
  // Public — every viewer fetches them so non-mods can also flip the
  // "Show hidden" toggle and see what moderators have suppressed.
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();

  // Toggle the Hidden bucket on/off in the community grid. Off by
  // default — viewers shouldn't have to opt out of suppressed content.
  const [showHidden, setShowHidden] = useState(false);

  // Featured slot list — derived from moderation labels. Sorted newest-
  // featured first, capped at MAX_FEATURED, and hidden coords removed so a
  // featured-then-hidden campaign disappears from the row.
  const featuredCoords = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.featuredCoords)
      .filter((c) => !moderation.hiddenCoords.has(c))
      .sort((a, b) => (moderation.featuredOrder.get(b) ?? 0) - (moderation.featuredOrder.get(a) ?? 0))
      .slice(0, MAX_FEATURED);
  }, [moderation]);

  const { data: featuredCampaigns, isLoading: featuredLoading } = useCampaigns(
    moderationReady && featuredCoords.length > 0
      ? { coordinates: featuredCoords, limit: MAX_FEATURED }
      : { coordinates: [], limit: MAX_FEATURED },
  );

  // Sort the fetched featured campaigns to match the newest-label order.
  // `useCampaigns` returns them in network order; we want the row to match
  // the moderation-label ordering.
  const orderedFeatured = useMemo<ParsedCampaign[]>(() => {
    if (!moderation || !featuredCampaigns) return [];
    const order = moderation.featuredOrder;
    return [...featuredCampaigns]
      .filter((c) => featuredCoords.includes(c.aTag))
      .sort((a, b) => (order.get(b.aTag) ?? 0) - (order.get(a.aTag) ?? 0))
      .slice(0, MAX_FEATURED);
  }, [featuredCampaigns, featuredCoords, moderation]);

  const featuredCoordSet = useMemo(() => new Set(featuredCoords), [featuredCoords]);

  // Community grid: every kind-33863 campaign on the network. We fetch
  // unfiltered (no coordinate allowlist) so pending and previously-
  // unapproved campaigns appear chronologically alongside approved ones.
  // The Featured row dedupes its picks out of this grid.
  const { data: allCampaigns, isLoading: allCampaignsLoading } = useCampaigns({
    limit: 200,
  });

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Main grid: chronological all-but-hidden, minus featured (which has
  // its own row above). When the viewer toggles "Show hidden" on, the
  // hidden bucket flows back in — still chronological, still minus
  // featured. `useCampaigns` already sorts newest-first; we don't
  // re-sort here.
  const mainGridCampaigns = useMemo(() => {
    if (!allCampaigns) return [] as ParsedCampaign[];
    const hiddenCoords = moderation?.hiddenCoords ?? new Set<string>();
    return allCampaigns.filter((c) => {
      if (featuredCoordSet.has(c.aTag)) return false;
      if (hiddenCoords.has(c.aTag) && !showHidden) return false;
      return true;
    });
  }, [allCampaigns, featuredCoordSet, moderation, showHidden]);

  // Hidden count drives the toggle's helper text — "Show hidden (3)".
  // Only counts hidden coords present in our current network sample.
  const hiddenCount = useMemo(() => {
    if (!allCampaigns || !moderation) return 0;
    const hiddenCoords = moderation.hiddenCoords;
    let n = 0;
    for (const c of allCampaigns) {
      if (hiddenCoords.has(c.aTag) && !featuredCoordSet.has(c.aTag)) n += 1;
    }
    return n;
  }, [allCampaigns, moderation, featuredCoordSet]);

  return (
    <main className="min-h-screen pb-16">
      <Hero loggedIn={!!user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="campaigns">
        {/* Featured — only rendered when at least one campaign is featured
            (or the featured query is still loading on first paint). */}
        {(featuredCoords.length > 0 || (featuredLoading && !moderationReady)) && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('campaigns.home.featured')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('campaigns.home.featuredDesc', { appName: config.appName })}
                </p>
              </div>
            </div>

            <FeaturedRow
              campaigns={orderedFeatured}
              isLoading={featuredLoading || !moderationReady}
              expectedCount={featuredCoords.length}
            />
          </section>
        )}

        {/* Community Campaigns — every campaign on the network, chronological,
            minus those currently hidden by moderators (unless the viewer
            opts in via the toggle). Skeletons until the moderation labels
            and the campaign stream both resolve so we never flash the grid
            with hidden coords still in it. */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('campaigns.home.community')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('campaigns.home.communityDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3 ms-auto">
              {/* Show-hidden toggle. Visible to everyone — moderation is
                  transparent on Agora. The count badge only renders when
                  there's something hidden to reveal. */}
              <div className="flex items-center gap-2">
                <Switch
                  id="show-hidden-campaigns"
                  checked={showHidden}
                  onCheckedChange={setShowHidden}
                />
                <Label
                  htmlFor="show-hidden-campaigns"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  {t('common.showHidden')}
                  {hiddenCount > 0 && (
                    <span className="ms-1 text-xs">({hiddenCount})</span>
                  )}
                </Label>
              </div>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link to="/campaigns/new">
                  <PlusCircle className="size-4 mr-2" />
                  {t('campaigns.home.startCampaign')}
                </Link>
              </Button>
            </div>
          </div>

          {!moderationReady || allCampaignsLoading ? (
            <CampaignGridSkeleton />
          ) : mainGridCampaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {mainGridCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          )}

          {/* "Browse all campaigns" link — reveals the page with search,
              sort, and country filters for the full network. */}
          <div className="pt-2 text-center sm:text-left">
            <Button asChild variant="ghost" size="sm">
              <Link to="/campaigns/all">{t('campaigns.home.browseAll')}</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

function Hero({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useTranslation();

  return (
    /* Hero.

       Dark, brand-driven, type-led. Three layers:
         1. Near-black backdrop (`bg-[hsl(220_25%_6%)]`) — the canvas
            every other element sits on. No campaign photo, no random
            hue cycling: the hero looks the same on every visit, so
            quality doesn't depend on which campaign is featured.
         2. HeroLightningMap — decorative dark world map with curated
            glowing brand-orange arcs and pulsing city nodes. Pure SVG,
            negligible render cost, animations honor reduced-motion.
         3. Headline column on the left, lifted by a left-edge gradient
            inside HeroLightningMap so type stays readable without any
            text-shadow at all. */
    <section className="relative overflow-hidden border-b border-border bg-[hsl(220_25%_6%)] text-white">
      <HeroLightningMap />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 min-h-[440px] sm:min-h-[480px] lg:min-h-[520px] flex flex-col justify-center">
        <div className="space-y-6 max-w-2xl">
          <h1
            className="font-display italic text-6xl sm:text-7xl lg:text-8xl font-normal tracking-wide leading-none uppercase"
            style={{
              // Bebas Neue only ships at weight 400. Paint a stroke the
              // same color as the fill to fatten the letterforms without
              // the fuzz a synthetic-bold transform would produce.
              WebkitTextStroke: '0.022em currentColor',
            }}
          >
            <Trans
              i18nKey="campaigns.home.heroTagline"
              components={[
                // Index 0: solid brand-orange highlighter block.
                // i18next injects the matched translation segment
                // (the text between <0>...</0>) as this span's
                // `children`, so the word renders *inside* the
                // orange background.
                //
                // Padding: `ps-0 pe-3` keeps the first letter flush
                // with the box's start edge while the box extends
                // past the trailing edge as a deliberate visual
                // flourish. Logical properties so RTL languages
                // (ar, fa, ps) flip automatically.
                //
                // `text-indent: -0.06em` compensates for Bebas
                // Neue's italic skew, which shifts the visible
                // left edge of "U" rightward of its geometric box
                // — without the nudge there's a visible gap
                // between the orange block's left edge and the
                // letter. The shift is small enough that other
                // scripts (Arabic, Khmer, Chinese) tolerate it.
                //
                // NOTE: `components` MUST be an array, not an
                // object keyed by `{0: ..., 1: ...}`. The object
                // form silently drops the indexed tags in this
                // react-i18next version, rendering the text
                // without any wrapping element.
                <span
                  key="hl"
                  className="inline-block w-fit ps-0 pe-3 bg-primary text-white leading-[0.95] align-baseline"
                  style={{ textIndent: '-0.06em' }}
                />,
                // Index 1: line break. English wants the
                // highlighted word on its own line as a standalone
                // block. Translations that prefer inline flow
                // simply omit `<1></1>` from their string.
                <br key="br" />,
              ]}
            />
          </h1>
          <p className="text-base sm:text-lg text-white/80 max-w-xl">
            {t('campaigns.home.heroBody')}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {/* Primary CTA — solid brand-orange pill. The dark hero gives
                the brand color the spotlight without competing with it. */}
            <Button
              size="lg"
              asChild
              className="rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px] motion-safe:transition-colors"
            >
              <Link to="/campaigns/new">
                <PlusCircle className="mr-2" />
                {t('campaigns.home.startCampaign')}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="rounded-full h-12 px-6 text-base border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white hover:border-white/50 [&_svg]:size-[18px]"
            >
              <Link to="/about">
                {t('campaigns.home.howItWorks')}
                <ArrowRight className="ml-2 rtl:rotate-180" />
              </Link>
            </Button>
            {!loggedIn && (
              <Button
                variant="outline"
                size="lg"
                asChild
                className="rounded-full h-12 px-6 text-base border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white hover:border-white/50"
              >
                <a href="#campaigns">{t('campaigns.home.exploreCampaigns')}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Returns the grid class string for an adaptive featured row.
 * Mobile stays 1-column; desktop expands to 2/3/4 columns based on count.
 * Tailwind JIT requires literal class strings, so we spell each variant
 * out rather than building the class name dynamically.
 */
function featuredGridClass(n: number): string {
  if (n <= 1) return 'grid grid-cols-1 gap-5';
  if (n === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-5';
  if (n === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
}

/** Renders the featured row with an adaptive column count. */
function FeaturedRow({
  campaigns,
  isLoading,
  expectedCount,
}: {
  campaigns: ParsedCampaign[];
  isLoading: boolean;
  /** How many featured slots we expect once data resolves. Drives the skeleton column count. */
  expectedCount: number;
}) {
  if (isLoading && campaigns.length === 0) {
    const skeletonCount = Math.max(1, Math.min(MAX_FEATURED, expectedCount || 2));
    return (
      <div className={featuredGridClass(skeletonCount)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <CampaignCardSkeleton key={i} variant={skeletonCount === 1 ? 'featured' : 'compact'} />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    // Defensive — the parent guards on `featuredCoords.length > 0`, but if
    // a hidden-after-featured race leaves us with no campaigns to render,
    // collapse silently rather than show an empty card.
    return null;
  }

  // 1 featured campaign gets the hero `variant="featured"` treatment;
  // 2-4 use the regular compact card sized to the dynamic grid.
  const useFeaturedVariant = campaigns.length === 1;

  return (
    <div className={featuredGridClass(campaigns.length)}>
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.aTag}
          campaign={campaign}
          variant={useFeaturedVariant ? 'featured' : 'compact'}
        />
      ))}
    </div>
  );
}

function CampaignGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <CampaignCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 px-8 text-center space-y-4">
        <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">{t('campaigns.home.empty')}</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            {t('campaigns.home.emptyHint', { appName: config.appName })}
          </p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <PlusCircle className="size-4 mr-2" />
            {t('campaigns.home.startCampaign')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default CampaignsPage;
