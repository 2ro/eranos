import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, EyeOff, HandHeart, Hourglass, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { ModeratorCollapsibleSection, ReorderableCampaignGrid } from '@/components/moderation';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * Maximum number of skeleton cards to render in the Featured row
 * while the campaigns are loading. Featured campaigns themselves
 * are uncapped (moderators can promote as many as they like) but
 * a wall of skeletons hurts perceived performance, so the
 * placeholder is bounded.
 */
const FEATURED_SKELETON_CAP = 8;

/**
 * Home page (`/`).
 *
 * Four sections, top-to-bottom:
 *
 *  1. **Featured** — moderator-curated, sorted newest-featured first.
 *     No cap — moderators can feature any number of campaigns and the
 *     grid expands. Visible to everyone.
 *  2. **Community Campaigns** — every campaign approved by a Team
 *     Soapbox moderator, minus hidden and minus featured (featured
 *     dedupes into the row above). Sorted newest first. Visible to
 *     everyone.
 *  3. **Pending** — campaigns on the network that no moderator has
 *     approved or hidden yet. Moderator-only review queue.
 *  4. **Hidden** — campaigns currently suppressed. Moderator-only,
 *     collapsed by default so the page doesn't lead with suppressed
 *     content for the people responsible for it.
 *
 * Campaign coverage is the failure mode to watch: an approved
 * campaign that's older than the last 200 events would otherwise
 * fall off the recent-stream query and disappear from the Community
 * grid. We mitigate by issuing a second targeted query keyed on
 * every approved/hidden coord, merging both result sets in the
 * grids below. The Featured row already used a coord-targeted query
 * for the same reason.
 *
 * Campaigns are the home page's sole focus. Groups and Pledges each
 * have their own dedicated browse pages (`/groups`, `/pledges`).
 */
export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  // Moderation pack + label rollups. We gate the four sections on
  // `moderationReady` so we never flash an unmoderated grid.
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  // Featured slot list — derived from moderation labels. Sorted newest-
  // featured first; hidden coords removed so a featured-then-hidden
  // campaign disappears from the row. No cap: every campaign a
  // moderator features renders.
  const featuredCoords = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.featuredCoords)
      .filter((c) => !moderation.hiddenCoords.has(c))
      .sort((a, b) => (moderation.featuredOrder.get(b) ?? 0) - (moderation.featuredOrder.get(a) ?? 0));
  }, [moderation]);

  // `useCampaigns` ignores `limit` when `coordinates` is set (it fans
  // out into one #d-filter per author), so we don't need to pass one.
  const { data: featuredCampaigns, isLoading: featuredLoading } = useCampaigns(
    moderationReady && featuredCoords.length > 0
      ? { coordinates: featuredCoords }
      : { coordinates: [] },
  );

  // Sort the fetched featured campaigns to match the newest-label order.
  // `useCampaigns` returns them in network order; we want the row to match
  // the moderation-label ordering.
  const orderedFeatured = useMemo<ParsedCampaign[]>(() => {
    if (!moderation || !featuredCampaigns) return [];
    const order = moderation.featuredOrder;
    return [...featuredCampaigns]
      .filter((c) => featuredCoords.includes(c.aTag))
      .sort((a, b) => (order.get(b.aTag) ?? 0) - (order.get(a.aTag) ?? 0));
  }, [featuredCampaigns, featuredCoords, moderation]);

  const featuredCoordSet = useMemo(() => new Set(featuredCoords), [featuredCoords]);

  // Recent stream — the latest 200 campaign events on the network. Drives
  // the Pending list (the only way a not-yet-labeled campaign can surface
  // is to be in the recent stream), and supplements the targeted approved
  // query below for fresh data on already-approved campaigns.
  const { data: recentCampaigns, isLoading: recentLoading } = useCampaigns({
    limit: 200,
  });

  // Targeted query for every approved-or-hidden coord. This guarantees the
  // Community grid and the Hidden section render correctly even when the
  // approved/hidden campaign is older than the recent-200 window — the
  // exact bug that made approved campaigns silently disappear from the
  // home page once enough new campaigns published.
  const labeledCoords = useMemo(() => {
    if (!moderation) return [] as string[];
    const out = new Set<string>();
    for (const c of moderation.approvedCoords) out.add(c);
    for (const c of moderation.hiddenCoords) out.add(c);
    return Array.from(out);
  }, [moderation]);

  const { data: labeledCampaigns, isLoading: labeledLoading } = useCampaigns(
    moderationReady && labeledCoords.length > 0
      ? { coordinates: labeledCoords, limit: labeledCoords.length }
      : { coordinates: [], limit: 1 },
  );

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Merge the two streams (recent + labeled), de-dupe by aTag, sort newest
  // first. The result is the authoritative working set: every campaign
  // the page needs to render across all four sections.
  const allKnownCampaigns = useMemo(() => {
    const byCoord = new Map<string, ParsedCampaign>();
    for (const c of recentCampaigns ?? []) byCoord.set(c.aTag, c);
    for (const c of labeledCampaigns ?? []) {
      // Prefer whichever revision is newer — the recent stream and the
      // targeted query can return different revisions of the same
      // addressable event from different relays.
      const prev = byCoord.get(c.aTag);
      if (!prev || c.createdAt > prev.createdAt) byCoord.set(c.aTag, c);
    }
    return Array.from(byCoord.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [recentCampaigns, labeledCampaigns]);

  // Community Campaigns: approved, not hidden, not featured. Sorted
  // by the `created_at` of the latest `approved` label, newest first
  // — mirroring the featured row's `featuredOrder` sort. Moderators
  // can reorder the grid by re-approving (or dragging) a campaign;
  // see `useReorderCampaign`. Campaigns missing from `approvedOrder`
  // (which shouldn't happen — every coord in `approvedCoords` has an
  // entry) fall back to the campaign's own `createdAt` so the sort
  // is total.
  const communityCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!moderation) return [];
    const approvedOrder = moderation.approvedOrder;
    return allKnownCampaigns
      .filter(
        (c) =>
          moderation.approvedCoords.has(c.aTag) &&
          !moderation.hiddenCoords.has(c.aTag) &&
          !featuredCoordSet.has(c.aTag),
      )
      .sort((a, b) => {
        const ta = approvedOrder.get(a.aTag) ?? a.createdAt;
        const tb = approvedOrder.get(b.aTag) ?? b.createdAt;
        return tb - ta;
      });
  }, [allKnownCampaigns, moderation, featuredCoordSet]);

  // Pending: not approved, not hidden. Featured-but-unapproved is treated
  // as pending too — a moderator can feature without explicitly approving
  // and the queue still needs to surface the approval decision.
  const pendingCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!moderation) return [];
    return allKnownCampaigns.filter(
      (c) =>
        !moderation.approvedCoords.has(c.aTag) &&
        !moderation.hiddenCoords.has(c.aTag),
    );
  }, [allKnownCampaigns, moderation]);

  // Hidden: latest label on the hide axis is `hidden`. Independent of
  // approval status — hide always wins.
  const hiddenCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!moderation) return [];
    return allKnownCampaigns.filter((c) => moderation.hiddenCoords.has(c.aTag));
  }, [allKnownCampaigns, moderation]);

  // The grids share the same readiness gate: moderation labels resolved
  // AND at least one of the two campaign queries returned. We don't wait
  // for both because each can fail or take a while; whichever arrives
  // first starts populating the page.
  const gridsLoading =
    moderatorsLoading || !moderationReady || (recentLoading && labeledLoading);

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

        {/* Community Campaigns — moderator-approved, minus hidden, minus
            featured (featured rides above). The grid is fed by the union
            of the recent-stream query and a coord-targeted query keyed
            on every approved coord, so approved campaigns older than
            the 200-event window still surface.

            For moderators the grid is wrapped in `ReorderableCampaignGrid`
            which adds drag-and-drop on desktop and Move up / Move down
            kebab rows on mobile. Reordering republishes the campaign's
            `approved` label with a chosen `created_at`, which is the
            sort key for this grid (`approvedOrder` on the moderation
            rollup). */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
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

          {gridsLoading ? (
            <CampaignGridSkeleton />
          ) : communityCampaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <ReorderableCampaignGrid
              campaigns={communityCampaigns}
              axis="approval"
              gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            />
          )}

          {/* "Browse all campaigns" link — reveals the page with search,
              sort, country filters, and the censorship-resistant view
              of campaigns that haven't been approved or that mods have
              hidden. */}
          <div className="pt-2 text-center sm:text-left">
            <Button asChild variant="ghost" size="sm">
              <Link to="/campaigns">{t('campaigns.home.browseAll')}</Link>
            </Button>
          </div>
        </section>

        {/* Pending — moderator-only review queue. Campaigns the recent
            stream reported but that have no approval AND no hide label.
            Mods need to triage these so they show up on the public
            grid (or get filtered out). */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<Hourglass className="size-4" />}
            title={t('campaigns.home.pending')}
            description={t('campaigns.home.pendingDesc')}
            count={pendingCampaigns.length}
            isLoading={recentLoading && pendingCampaigns.length === 0}
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

        {/* Hidden — moderator-only, collapsed by default. The Campaigns
            page is where everyone can transparently flip a switch to
            view hidden campaigns; on the home page mods get a more
            structured collapsible review surface, kept closed so the
            page doesn't lead with suppressed content. */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('campaigns.home.hidden')}
            description={t('campaigns.home.hiddenDesc')}
            count={hiddenCampaigns.length}
            isLoading={labeledLoading && hiddenCampaigns.length === 0}
            emptyText={t('campaigns.home.hiddenEmpty')}
            skeleton={<CampaignGridSkeleton />}
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {hiddenCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </ModeratorCollapsibleSection>
        )}
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
    // The skeleton mirrors how many cards we expect, but bounded so a
    // moderator who's featured 50+ campaigns doesn't get a screenful
    // of grey placeholders before the real cards arrive.
    const skeletonCount = Math.max(1, Math.min(FEATURED_SKELETON_CAP, expectedCount || 2));
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

  // Moderators get drag-and-drop / kebab reorder on the featured
  // row; non-mods get a plain grid through the same component (it
  // branches internally). `axis="featured"` selects the
  // `featured` label as the order axis.
  return (
    <ReorderableCampaignGrid
      campaigns={campaigns}
      axis="featured"
      gridClassName={featuredGridClass(campaigns.length)}
      renderCard={(campaign) => (
        <CampaignCard
          campaign={campaign}
          variant={useFeaturedVariant ? 'featured' : 'compact'}
        />
      )}
    />
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
