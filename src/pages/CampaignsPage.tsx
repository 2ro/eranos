import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, EyeOff, HandHeart, Hourglass, PlusCircle, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { ModeratorCollapsibleSection } from '@/components/moderation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import type { ParsedCampaign } from '@/lib/campaign';

/** Cap on how many featured campaigns we render in the home-page row. */
const MAX_FEATURED = 4;

export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  // Moderator pack + per-campaign label state. The label query is gated on
  // moderators arriving, so during a cold load we render skeleton cards
  // until both resolve. Avoids flashing the full unmoderated grid.
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

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

  // The community grid is the approved-and-not-hidden set, minus featured
  // (which gets its own row above). We fetch by coordinate (one filter per
  // author, bundled in one REQ) to avoid pulling the entire kind-30223
  // stream when only a handful are surfaced.
  const approvedNotHidden = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.approvedCoords).filter((c) => !moderation.hiddenCoords.has(c));
  }, [moderation]);

  // Pass `coordinates: []` only once moderation is ready and the allowlist is
  // empty; before that, pass `undefined` so the query is enabled but doesn't
  // discriminate. We block render of the grid on `moderationReady` anyway.
  const { data: approvedCampaigns, isLoading: approvedLoading } = useCampaigns(
    moderationReady
      ? { coordinates: approvedNotHidden, limit: 60 }
      : { limit: 60 },
  );

  // For moderators we also pull the *entire* recent kind-30223 stream so we
  // can populate the Pending and Hidden sections. This second query only
  // runs for mods and reuses TanStack's cache on identical keys.
  const { data: allCampaignsForMods, isLoading: allLoading } = useCampaigns({
    limit: 200,
  });

  // For non-mod creators: their own campaigns regardless of moderation state,
  // so the "Your campaigns" shelf can explain why theirs aren't on the home
  // page. Skip the query entirely for mods and logged-out viewers.
  const { data: ownCampaigns } = useCampaigns({
    authors: user && !isMod ? [user.pubkey] : undefined,
    limit: 30,
  });

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Main grid excludes featured (they're shown above) and excludes any
  // hidden coord just in case approvedCoords/hiddenCoords overlap (a mod can
  // approve, another can hide — hide wins).
  const mainGridCampaigns = useMemo(
    () =>
      (approvedCampaigns ?? []).filter(
        (c) => !featuredCoordSet.has(c.aTag) && !moderation?.hiddenCoords.has(c.aTag),
      ),
    [approvedCampaigns, featuredCoordSet, moderation],
  );

  // Pending (mod-only): campaigns that exist on the network but lack an
  // approval AND aren't hidden.
  const pendingCampaigns = useMemo(() => {
    if (!isMod || !moderation) return [] as ParsedCampaign[];
    return (allCampaignsForMods ?? []).filter(
      (c) => !moderation.approvedCoords.has(c.aTag) && !moderation.hiddenCoords.has(c.aTag),
    );
  }, [isMod, moderation, allCampaignsForMods]);

  // Hidden (mod-only): campaigns where the latest hide-axis label is `hidden`.
  const hiddenCampaigns = useMemo(() => {
    if (!isMod || !moderation) return [] as ParsedCampaign[];
    return (allCampaignsForMods ?? []).filter((c) => moderation.hiddenCoords.has(c.aTag));
  }, [isMod, moderation, allCampaignsForMods]);

  // "Your campaigns" (non-mod creators only): the logged-in user's own
  // campaigns that aren't yet surfaced — i.e. not approved, or hidden.
  // We exclude already-approved ones so we don't double-render the same
  // card in two sections; if their own campaign is in the main grid they
  // already know it's live.
  const yourPendingCampaigns = useMemo(() => {
    if (isMod || !user || !moderation) return [] as ParsedCampaign[];
    return (ownCampaigns ?? []).filter(
      (c) => !moderation.approvedCoords.has(c.aTag) || moderation.hiddenCoords.has(c.aTag),
    );
  }, [isMod, user, moderation, ownCampaigns]);

  return (
    <main className="min-h-screen pb-16">
      {/* Hero.

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
               text-shadow at all. */}
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
              {!user && (
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

        {/* Community Campaigns — approved-and-not-hidden, minus featured.
            Skeletons until the moderator pack + label state both resolve,
            so we never flash an unmoderated grid. */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('campaigns.home.community')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('campaigns.home.communityDesc')}
              </p>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-2" />
                {t('campaigns.home.startCampaign')}
              </Link>
            </Button>
          </div>

          {moderatorsLoading || !moderationReady || approvedLoading ? (
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

          {/* "Browse all campaigns" link — reveals the page that includes
              campaigns not yet moderated (and, optionally, hidden ones). */}
          <div className="pt-2 text-center sm:text-left">
            <Button asChild variant="ghost" size="sm">
              <Link to="/campaigns/all">{t('campaigns.home.browseAll')}</Link>
            </Button>
          </div>
        </section>

        {/* Moderator-only: campaigns awaiting an approval decision. */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<Hourglass className="size-4" />}
            title={t('campaigns.home.pending')}
            description={t('campaigns.home.pendingDesc')}
            count={pendingCampaigns.length}
            isLoading={allLoading}
            emptyText={t('campaigns.home.pendingEmpty')}
            skeleton={<CampaignGridSkeleton />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {pendingCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </ModeratorCollapsibleSection>
        )}

        {/* Moderator-only: campaigns currently hidden. */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('campaigns.home.hidden')}
            description={t('campaigns.home.hiddenDesc')}
            count={hiddenCampaigns.length}
            isLoading={allLoading}
            emptyText={t('campaigns.home.hiddenEmpty')}
            skeleton={<CampaignGridSkeleton />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {hiddenCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </ModeratorCollapsibleSection>
        )}

        {/* Non-mod creator: surface their own not-yet-approved campaigns
            so they understand the campaign is live on the network but
            isn't on the homepage yet. */}
        {!isMod && user && yourPendingCampaigns.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2">
                <ShieldCheck className="size-6 text-primary/70" />
                {t('campaigns.home.yourCampaigns')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {t('campaigns.home.yourCampaignsDesc')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {yourPendingCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
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
