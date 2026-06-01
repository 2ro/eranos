import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, EyeOff, HandHeart, PlusCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { ModeratorCollapsibleSection, ReorderableCampaignGrid } from '@/components/moderation';
import { useAuthor } from '@/hooks/useAuthor';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';
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
 * World Liberty Congress — the partner organization that hand-picks
 * the Featured row. Their pubkey and npub are hard-coded here so the
 * Featured heading can link to their profile and pull their avatar
 * from kind 0 metadata via `useAuthor`.
 */
const WLC_PUBKEY = '56b3abb9baed20b6ab81617aa519c8634e920ef0351d2962ec2951a9b233ab2f';
const WLC_NPUB = 'npub126e6hwd6a5std2upv9a22xwgvd8fyrhsx5wjjchv99g6nv3n4vhs5fr9g3';

/**
 * Home page (`/`).
 *
 * Two public sections plus one moderator-only section:
 *
 *  1. **Featured** — moderator-curated, ordered by the moderator's
 *     chosen rank (newest-by-rank first). No cap. Visible to
 *     everyone. The empty state replaces the section when no
 *     campaign is currently featured.
 *  2. **Browse all** — a single link to `/campaigns`, the full
 *     discoverable set with search / sort / country filters.
 *  3. **Hidden** — moderator-only, collapsed by default so the page
 *     doesn't lead with suppressed content for the people
 *     responsible for it.
 *
 * The previous Community / Pending sections were retired alongside
 * the approval axis: featuring is now the single positive-curation
 * mechanism, and `/campaigns` is the censorship-resistant browse
 * surface.
 *
 * Hidden-campaign coverage: a hidden campaign older than the recent
 * stream window would drop off a `limit:` query, so we issue a
 * targeted coord-keyed fetch over every hidden coord and feed the
 * Hidden section from the union of that query and the recent
 * stream. The Featured row uses the same coord-targeted pattern
 * keyed on its own coords.
 *
 * Campaigns are the home page's sole focus. Groups and Pledges each
 * have their own dedicated browse pages (`/groups`, `/pledges`).
 */
export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const wlcAuthor = useAuthor(WLC_PUBKEY);
  const wlcName = wlcAuthor.data?.metadata?.display_name
    || wlcAuthor.data?.metadata?.name
    || 'World Liberty Congress';
  const wlcPicture = wlcAuthor.data?.metadata?.picture;
  const wlcFallback = genUserName(WLC_PUBKEY).slice(0, 2).toUpperCase();

  // Moderation pack + label rollups. We gate the Featured and Hidden
  // sections on `moderationReady` so we never flash an unmoderated
  // grid.
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  // Featured slot list — derived from moderation labels. Sorted by
  // the moderator-controlled rank (descending); hidden coords
  // removed so a featured-then-hidden campaign disappears from the
  // row. No cap: every campaign a moderator features renders.
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

  // Sort the fetched featured campaigns to match the rank order.
  // `useCampaigns` returns them in network order; we want the row to
  // match the moderation-rank ordering.
  const orderedFeatured = useMemo<ParsedCampaign[]>(() => {
    if (!moderation || !featuredCampaigns) return [];
    const order = moderation.featuredOrder;
    return [...featuredCampaigns]
      .filter((c) => featuredCoords.includes(c.aTag))
      .sort((a, b) => (order.get(b.aTag) ?? 0) - (order.get(a.aTag) ?? 0));
  }, [featuredCampaigns, featuredCoords, moderation]);

  // Recent stream — the latest 200 campaign events on the network.
  // Source for the Hidden section (which can also pull from the
  // targeted hidden-coord query below).
  const { data: recentCampaigns, isLoading: recentLoading } = useCampaigns({
    limit: 200,
  });

  // Targeted query for every hidden coord. Guarantees the Hidden
  // section renders correctly even when the hidden campaign is
  // older than the recent-200 window.
  const hiddenCoordList = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.hiddenCoords);
  }, [moderation]);

  const { data: hiddenCampaignsRaw, isLoading: hiddenLoading } = useCampaigns(
    moderationReady && hiddenCoordList.length > 0
      ? { coordinates: hiddenCoordList }
      : { coordinates: [] },
  );

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Hidden section: union of the recent stream and the targeted
  // query, deduped by aTag, filtered to coords currently labeled
  // hidden. Newest-first for stable ordering.
  const hiddenCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!moderation) return [];
    const byCoord = new Map<string, ParsedCampaign>();
    for (const c of recentCampaigns ?? []) byCoord.set(c.aTag, c);
    for (const c of hiddenCampaignsRaw ?? []) {
      const prev = byCoord.get(c.aTag);
      if (!prev || c.createdAt > prev.createdAt) byCoord.set(c.aTag, c);
    }
    return Array.from(byCoord.values())
      .filter((c) => moderation.hiddenCoords.has(c.aTag))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [recentCampaigns, hiddenCampaignsRaw, moderation]);

  const featuredEmpty =
    moderationReady && featuredCoords.length === 0 && !featuredLoading;

  // Show the Featured section as long as there's something to show
  // OR we're still loading the moderation labels on first paint
  // (avoids a flash of the empty state for first-time visitors).
  const showFeaturedSection =
    featuredCoords.length > 0 ||
    (!moderationReady && (moderatorsLoading || featuredLoading)) ||
    featuredEmpty;

  return (
    <main className="min-h-screen pb-16">
      <Hero loggedIn={!!user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="campaigns">
        {showFeaturedSection && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/${WLC_NPUB}`}
                    className="inline-flex items-center gap-2 hover:underline underline-offset-4"
                    aria-label={wlcName}
                  >
                    <Avatar className="size-8 sm:size-9 ring-1 ring-border">
                      <AvatarImage src={wlcPicture} alt="" />
                      <AvatarFallback>{wlcFallback}</AvatarFallback>
                    </Avatar>
                    <span>{wlcName}</span>
                  </Link>
                  <span>{t('campaigns.home.featured')}</span>
                  <BadgeCheck className="size-5 sm:size-6 text-primary shrink-0" aria-hidden="true" />
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('campaigns.home.featuredDesc', { appName: config.appName })}
                </p>
              </div>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link to="/campaigns/new">
                  <PlusCircle className="size-4 mr-2" />
                  {t('campaigns.home.startCampaign')}
                </Link>
              </Button>
            </div>

            {featuredEmpty ? (
              <EmptyState />
            ) : (
              <FeaturedRow
                campaigns={orderedFeatured}
                isLoading={featuredLoading || !moderationReady}
                expectedCount={featuredCoords.length}
              />
            )}

            {/* "Browse all campaigns" link — the gateway to the full,
                censorship-resistant set on /campaigns. Kept inside
                the Featured section so the home page hierarchy is
                Featured → Browse all → (mod-only) Hidden. */}
            <div className="pt-2 text-center sm:text-left">
              <Button asChild variant="ghost" size="sm">
                <Link to="/campaigns">{t('campaigns.home.browseAll')}</Link>
              </Button>
            </div>
          </section>
        )}

        {/* Hidden — moderator-only, collapsed by default. The
            Campaigns page is where everyone can transparently flip
            a switch to view hidden campaigns; on the home page mods
            get a more structured collapsible review surface, kept
            closed so the page doesn't lead with suppressed content. */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('campaigns.home.hidden')}
            description={t('campaigns.home.hiddenDesc')}
            count={hiddenCampaigns.length}
            isLoading={(recentLoading || hiddenLoading) && hiddenCampaigns.length === 0}
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
 * Tailwind class for the wrapper around an individual featured card.
 *
 * The Featured row is a single CSS grid that scales from 1 col on
 * mobile → 2 col on `sm` → 4 col on `lg`. The first two cards span
 * 2 columns on `sm+` so they read as larger "hero" placements; the
 * remainder fills the rest of the grid in rows of four on `lg+`.
 *
 * - Mobile (1 col): every card is full width.
 * - `sm` (2 col): top two are full width (col-span-2 = full row each);
 *   the rest are half width.
 * - `lg` (4 col): top two are half width side-by-side; the rest are
 *   quarter width, four per row.
 *
 * Returning a literal Tailwind string (rather than building it) keeps
 * the JIT happy — `col-span-2` etc. are seen by the scanner.
 */
function featuredItemClass(index: number, total: number): string {
  // With ≤2 campaigns the layout is just the natural grid; no spans
  // needed. With 3+, only the first two get the span.
  if (total < 3) return '';
  if (index < 2) return 'sm:col-span-2 lg:col-span-2';
  return '';
}

function featuredGridContainerClass(total: number): string {
  if (total <= 1) return 'grid grid-cols-1 gap-5';
  if (total === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-5';
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5';
}

/** Renders the featured row with two large cards on top + 4-up tail. */
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
    // The skeleton mirrors the real layout: top two large, rest 4-up.
    // Bounded so a moderator who's featured 50+ campaigns doesn't get
    // a screenful of grey placeholders before the real cards arrive.
    const skeletonCount = Math.max(1, Math.min(FEATURED_SKELETON_CAP, expectedCount || 2));
    return (
      <div className={featuredGridContainerClass(skeletonCount)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className={featuredItemClass(i, skeletonCount)}>
            <CampaignCardSkeleton variant={skeletonCount === 1 ? 'featured' : 'compact'} />
          </div>
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    // Defensive — caller decides whether to render this component
    // when there are no campaigns; if we get here regardless, fail
    // quiet rather than show an empty row.
    return null;
  }

  // 1 featured campaign keeps the hero `variant="featured"` treatment
  // (image-left / text-right rectangular layout). With 2+ we use the
  // standard compact card; the top two earn their visual weight from
  // the column-spanning grid layout above, not the card variant.
  const useFeaturedVariant = campaigns.length === 1;

  // Moderators get drag-and-drop / kebab reorder on the featured
  // row; non-mods get a plain grid through the same component (it
  // branches internally).
  return (
    <ReorderableCampaignGrid
      campaigns={campaigns}
      gridClassName={featuredGridContainerClass(campaigns.length)}
      itemClassName={(idx) => featuredItemClass(idx, campaigns.length)}
      renderCard={(campaign) => (
        <CampaignCard
          campaign={campaign}
          variant={useFeaturedVariant ? 'featured' : 'compact'}
          verifiedBy={{
            pubkey: WLC_PUBKEY,
            npub: WLC_NPUB,
            defaultName: 'World Liberty Congress',
            shortLabel: 'WLC',
          }}
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
