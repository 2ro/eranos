import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  HandHeart,
  PlusCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { CampaignListsStrip } from '@/components/campaign-lists/CampaignListsStrip';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { AppDownloadNudge } from '@/components/AppDownloadNudge';
import { VenezuelaReliefBanner } from '@/components/VenezuelaReliefBanner';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignList } from '@/hooks/useCampaignLists';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * Maximum number of skeleton cards to render in the featured hero row
 * while the campaigns are loading. The list itself can hold an
 * arbitrary number of members; the home row caps the visual count.
 */
const FEATURED_SKELETON_CAP = 8;

/**
 * Slug of the curated list that powers the home-page hero row.
 * Matches the curator-published kind-30003 event with
 * `d=featured-campaigns` and `t=agora.campaign-list`. The list's own
 * detail page lives at `/campaigns/lists/featured-campaigns`.
 */
const FEATURED_LIST_SLUG = 'featured-campaigns';

/**
 * Home page (`/`).
 *
 * Two public sections:
 *
 *  1. **Featured hero row** — every campaign inside the curated
 *     `featured-campaigns` list (a curator-published kind 30003
 *     NIP-51 bookmark set), in list order. The hero layout gives the
 *     first two cards extra visual weight (column-spanning) and flows
 *     the rest in a 4-up grid, so the row scales to however many
 *     campaigns the curator has added. The list's own detail page at
 *     `/campaigns/lists/featured-campaigns` shows the same membership.
 *     Replaces the previous `featured`-label-based row — featuring is
 *     no longer a campaign-level concept; lists are.
 *  2. **Topic-list strip + Browse all** — the curated
 *     {@link CampaignListsStrip} (moderator-managed topic pills) plus
 *     a single CTA to `/campaigns`, the full discoverable set with
 *     search / sort / country filters.
 *
 * Hidden-campaign moderation lives entirely on `/campaigns` — the
 * Show-hidden toggle there is available to every viewer, and the
 * moderator-only Hidden collapsible there is the structured review
 * surface. The home page applies no label-based filtering of its own:
 * the featured hero row renders exactly what the curated list declares,
 * in list order. Curation here is the list's membership, nothing more.
 *
 * Campaigns are the home page's sole focus. Groups and Pledges each
 * have their own dedicated browse pages (`/groups`, `/pledges`).
 */
export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  // The curated list that backs the hero row. The slug is fixed in
  // code so the home page's editorial framing doesn't drift if a
  // moderator renames or reorders other lists. The list itself can
  // still be edited freely — its title isn't read here, only its
  // membership.
  const { list: featuredList, isLoading: listLoading } = useCampaignList(FEATURED_LIST_SLUG);

  // All coords declared by the list, in order. The hero row shows
  // every featured campaign — the layout (two large cards + 4-up
  // tail) scales to whatever the curator has added, so we don't cap.
  const coords = useMemo(
    () => featuredList?.coords ?? [],
    [featuredList],
  );

  // `useCampaigns` ignores `limit` when `coordinates` is set, so
  // we don't pass one. The query is short-circuited to an empty
  // result when the list isn't loaded yet (so we don't fire a
  // useless fan-out before the list event arrives).
  const { data: heroCampaigns, isLoading: heroLoading } = useCampaigns(
    coords.length > 0
      ? { coordinates: coords }
      : { coordinates: [] },
  );

  // Reorder to match the list's declared order. `useCampaigns` returns
  // events in network order which we override here so the hero row
  // always reflects the curator's intent.
  const orderedCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!heroCampaigns || coords.length === 0) return [];
    const byCoord = new Map(heroCampaigns.map((c) => [c.aTag, c]));
    const out: ParsedCampaign[] = [];
    for (const coord of coords) {
      const found = byCoord.get(coord);
      if (found) out.push(found);
    }
    return out;
  }, [heroCampaigns, coords]);

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Show the featured section as long as there's something to show OR
  // the list is still loading on first paint (avoids a flash of
  // empty space for visitors who hit the page before the list
  // event arrives).
  const listEmpty = !listLoading && (!featuredList || featuredList.coords.length === 0);
  const showFeaturedSection =
    (featuredList && featuredList.coords.length > 0) ||
    listLoading ||
    (heroLoading && coords.length > 0);

  return (
    <main className="min-h-screen">
      <VenezuelaReliefBanner />
      <Hero />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="campaigns">
        {showFeaturedSection && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/campaigns/lists/${FEATURED_LIST_SLUG}`}
                    className="inline-flex items-center gap-2 hover:underline underline-offset-4"
                  >
                    <span>{t('campaigns.home.featuredTitle')}</span>
                  </Link>
                  <BadgeCheck className="size-5 sm:size-6 text-primary shrink-0" aria-hidden="true" />
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('campaigns.home.featuredDesc', { appName: config.appName })}
                </p>
              </div>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <StartCampaignLink>
                  <PlusCircle className="size-4 mr-2" />
                  {t('campaigns.home.startCampaign')}
                </StartCampaignLink>
              </Button>
            </div>

            {listEmpty ? (
              <EmptyState />
            ) : (
              <HeroRow
                campaigns={orderedCampaigns}
                isLoading={heroLoading || listLoading}
                expectedCount={coords.length || 2}
              />
            )}
          </section>
        )}

        {/* Curated topic-list strip + CTA to the full /campaigns
            browse surface. The canonical breadth-view is /campaigns,
            which already carries search, sort, and country filters.
            Keeping the home page to one tightly curated row above
            the strip (featured) plus the strip itself makes the
            editorial hierarchy obvious: the featured heroes →
            moderator topics → click through for the full
            catalogue. */}
        <section className="space-y-5">
          <CampaignListsStrip />

          <div className="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-center sm:justify-start">
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/campaigns">
                {t('campaigns.home.browseAll')}
                <ArrowRight className="ml-2 size-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/verify">
                <BadgeCheck className="mr-2 size-4" />
                {t('campaigns.home.verifyCampaigns')}
              </Link>
            </Button>
            <Button asChild size="lg" className="rounded-full">
              <StartCampaignLink>
                <PlusCircle className="mr-2 size-4" />
                {t('campaigns.home.startCampaign')}
              </StartCampaignLink>
            </Button>
          </div>
        </section>
      </div>

      <WhyDifferentSection />

      <AppDownloadNudge className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-8 pb-0" />
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

function Hero() {
  const { t } = useTranslation();

  return (
    /* Hero.

       Dark, brand-driven, type-led. Three layers:
         1. Near-black backdrop (`bg-[hsl(220_25%_6%)]`) — the canvas
            every other element sits on. No campaign photo, no random
            hue cycling: the hero looks the same on every visit, so
            quality doesn't depend on which campaign is on top.
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
              <StartCampaignLink>
                <PlusCircle className="mr-2" />
                {t('campaigns.home.startCampaign')}
              </StartCampaignLink>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="rounded-full h-12 px-6 text-base border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white hover:border-white/50 [&_svg]:size-[18px]"
            >
              <Link to="/verify">
                <BadgeCheck className="mr-2" />
                {t('campaigns.home.verifyCampaigns')}
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
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Tailwind class for the wrapper around an individual hero card.
 *
 * The hero row is a single CSS grid that scales from 1 col on
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
function heroItemClass(index: number, total: number): string {
  // With ≤2 campaigns the layout is just the natural grid; no spans
  // needed. With 3+, only the first two get the span.
  if (total < 3) return '';
  if (index < 2) return 'sm:col-span-2 lg:col-span-2';
  return '';
}

function heroGridContainerClass(total: number): string {
  if (total <= 1) return 'grid grid-cols-1 gap-5';
  if (total === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-5';
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5';
}

/** Renders the featured hero row with two large cards on top + 4-up tail. */
function HeroRow({
  campaigns,
  isLoading,
  expectedCount,
}: {
  campaigns: ParsedCampaign[];
  isLoading: boolean;
  /** How many slots we expect once data resolves. Drives the skeleton column count. */
  expectedCount: number;
}) {
  if (isLoading && campaigns.length === 0) {
    // The skeleton mirrors the real layout: top two large, rest 4-up.
    // Bounded so a list with 50+ members doesn't render a screenful
    // of grey placeholders before the real cards arrive.
    const skeletonCount = Math.max(1, Math.min(FEATURED_SKELETON_CAP, expectedCount));
    return (
      <div className={heroGridContainerClass(skeletonCount)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className={heroItemClass(i, skeletonCount)}>
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

  // 1 campaign keeps the hero `variant="featured"` treatment
  // (image-left / text-right rectangular layout). With 2+ we use the
  // standard compact card; the top two earn their visual weight from
  // the column-spanning grid layout above, not the card variant.
  const useHeroVariant = campaigns.length === 1;

  return (
    <div className={heroGridContainerClass(campaigns.length)}>
      {campaigns.map((campaign, idx) => (
        <div key={campaign.aTag} className={heroItemClass(idx, campaigns.length)}>
          <CampaignCard
            campaign={campaign}
            variant={useHeroVariant ? 'featured' : 'compact'}
          />
        </div>
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
          <StartCampaignLink>
            <PlusCircle className="size-4 mr-2" />
            {t('campaigns.home.startCampaign')}
          </StartCampaignLink>
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Why Ágora is different — manifesto-style info section at the bottom of /
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mission-and-vision manifesto at the bottom of the home page.
 * Sits on the site's default `bg-background` so it reads as a
 * continuation of the page rather than a separate marketing band,
 * and so dark mode inherits the canonical dark surface without
 * any locally-chosen "slate" or "navy" tones.
 *
 * Visual structure (top to bottom):
 *
 *  1. **Eyebrow + display headline.** Tracking-wider "MANIFESTO"
 *     overline with a brand-orange leader line, then a giant
 *     Bebas Neue display headline that takes the project's hero
 *     typography (uppercase, italic, stroke-painted, with one
 *     word inverted into a brand-orange highlight block — the
 *     same idiom used by `campaigns.home.heroTagline`). A short
 *     strapline beneath in Inter.
 *
 *  2. **Three numbered chapters.** Massive `font-display` italic
 *     numerals (01 / 02 / 03) in brand orange anchor each
 *     chapter. Each chapter has a tight heading, a one-paragraph
 *     mission body, and a short "✓ this is how it works"
 *     checklist. Block 3 swaps the checklist for a horizontal
 *     public/private split-card that visualizes the "your
 *     choice" framing.
 *
 *  3. **Closing line.** A two-clause manifesto in Bebas Neue at
 *     scale ("POWER BACK. MIDDLEMEN OUT.") followed by a quiet
 *     text-link CTA to `/about#how-it-works`.
 *
 * All strings live under `campaigns.home.whyDifferent.*` — no new
 * translation keys vs. the original implementation. The redesign
 * is purely visual.
 */
function WhyDifferentSection() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const appName = config.appName;

  return (
    <section
      aria-labelledby="why-different-title"
      className="relative bg-background pt-20 pb-12 md:pt-28 md:pb-16 overflow-hidden"
    >
      {/* Decorative spine: a soft vertical brand-orange line on
          the far left, evoking the manifesto / editorial feel.
          Hidden under `md` where the layout becomes single-column
          and the spine would just be visual noise. */}
      <div
        aria-hidden
        className="hidden md:block absolute left-0 top-24 bottom-24 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent"
      />
      {/* Soft brand-orange halo behind the headline — adds depth
          without changing the page's base surface color. Pure CSS,
          no images, respects color theme. */}
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 size-[36rem] rounded-full bg-primary/[0.06] blur-3xl pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Headline block ──────────────────────────────────── */}
        <div className="max-w-4xl mx-auto text-center mb-16 md:mb-20">
          <div className="inline-flex items-center gap-3 mb-6">
            <span aria-hidden className="h-px w-8 bg-primary" />
            <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary">
              {t('campaigns.home.whyDifferent.eyebrow', { appName })}
            </span>
            <span aria-hidden className="h-px w-8 bg-primary" />
          </div>

          {/* Bebas Neue display headline. Uses the same stroke-paint
              trick as the page's hero (font weight 400 only ships)
              so the letterforms read fat without synthetic-bold
              fuzz. The title is rendered plainly here — the visual
              interest comes from the typography itself, the
              brand-orange eyebrow framing, and the numbered
              chapters below, not from per-word highlight blocks. */}
          <h2
            id="why-different-title"
            className="font-display italic font-normal uppercase tracking-wide leading-[0.95] text-foreground text-5xl sm:text-6xl lg:text-7xl"
            style={{ WebkitTextStroke: '0.018em currentColor' }}
          >
            {t('campaigns.home.whyDifferent.title')}
          </h2>

          <p className="mt-6 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto">
            {t('campaigns.home.whyDifferent.lede')}
          </p>
        </div>

        {/* ── Three numbered chapters ────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-10 md:gap-8 lg:gap-12 relative">
          <ManifestoChapter
            number="01"
            heading={t('campaigns.home.whyDifferent.block1.heading')}
            body={t('campaigns.home.whyDifferent.block1.body')}
            bullets={[
              t('campaigns.home.whyDifferent.block1.bullet1'),
              t('campaigns.home.whyDifferent.block1.bullet2'),
              t('campaigns.home.whyDifferent.block1.bullet3'),
            ]}
          />
          <ManifestoChapter
            number="02"
            heading={t('campaigns.home.whyDifferent.block2.heading')}
            body={t('campaigns.home.whyDifferent.block2.body', { appName })}
            bullets={[
              t('campaigns.home.whyDifferent.block2.bullet1'),
              t('campaigns.home.whyDifferent.block2.bullet2'),
              t('campaigns.home.whyDifferent.block2.bullet3', { appName }),
            ]}
          />
          <ManifestoChapter
            number="03"
            heading={t('campaigns.home.whyDifferent.block3.heading')}
            body={t('campaigns.home.whyDifferent.block3.body')}
          >
            <div className="mt-5 grid grid-cols-2 rounded-xl border border-border overflow-hidden">
              <ChoiceCell
                tone="public"
                label={t('campaigns.home.whyDifferent.block3.publicLabel')}
                summary={t('campaigns.home.whyDifferent.block3.publicSummary')}
              />
              <ChoiceCell
                tone="private"
                label={t('campaigns.home.whyDifferent.block3.privateLabel')}
                summary={t('campaigns.home.whyDifferent.block3.privateSummary')}
              />
            </div>
          </ManifestoChapter>
        </div>

        {/* ── Closing CTA ────────────────────────────────────── */}
        <div className="mt-16 md:mt-20 flex flex-col items-center gap-4">
          <Link
            to="/about#how-it-works"
            className="group inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-primary hover:text-primary/80 transition-colors"
          >
            <span className="border-b border-primary/40 group-hover:border-primary pb-0.5">
              {t('campaigns.home.whyDifferent.readMore')}
            </span>
            <ArrowRight className="size-4 rtl:rotate-180 transition-transform motion-safe:group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

interface ManifestoChapterProps {
  number: string;
  heading: string;
  body: string;
  bullets?: string[];
  children?: React.ReactNode;
}

/**
 * One numbered chapter inside the WhyDifferentSection. Renders a
 * massive italic Bebas Neue numeral followed by a tight heading,
 * a mission paragraph, and either a "✓ we do this" checklist or
 * arbitrary `children` (used for Block 3's public/private split).
 *
 * The numeral has a thin brand-orange underline that doubles as
 * a visual seam connecting the numeral to the heading without a
 * heavy divider. No card chrome — the chapter sits on the page
 * background so the section reads as continuous editorial copy
 * rather than three boxed-off marketing tiles.
 */
function ManifestoChapter({ number, heading, body, bullets, children }: ManifestoChapterProps) {
  return (
    <article className="relative motion-safe:transition-transform">
      {/* Massive italic numeral. Bebas Neue is used here as
          designed signage, not a heading — matches the StepCard
          numeral idiom on /about. */}
      <div className="flex items-baseline gap-3 mb-5">
        <span
          aria-hidden
          className="font-display italic font-normal text-primary leading-none text-7xl sm:text-8xl tabular-nums"
          style={{ WebkitTextStroke: '0.015em currentColor' }}
        >
          {number}
        </span>
        <span aria-hidden className="flex-1 h-px bg-primary/30" />
      </div>

      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3 leading-snug">
        {heading}
      </h3>

      <p className="text-[15px] sm:text-base text-muted-foreground leading-relaxed">
        {body}
      </p>

      {bullets && bullets.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
              <span
                aria-hidden
                className="inline-flex items-center justify-center size-5 shrink-0 mt-0.5 rounded-full bg-primary/10 text-primary"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>
      )}

      {children}
    </article>
  );
}

interface ChoiceCellProps {
  tone: 'public' | 'private';
  label: string;
  summary: string;
}

/**
 * One half of Block 3's split-card. `public` cell is tinted with
 * brand-orange; `private` cell is a neutral muted tone, so the
 * pair reads as a binary choice without using off-brand colors.
 * Both cells share a single border via the parent grid + overflow-
 * hidden rounded wrapper.
 */
function ChoiceCell({ tone, label, summary }: ChoiceCellProps) {
  return (
    <div
      className={cn(
        'p-4 sm:p-5',
        tone === 'public'
          ? 'bg-primary/[0.07] border-r border-border last:border-r-0'
          : 'bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center size-6 rounded-md',
            tone === 'public'
              ? 'bg-primary/15 text-primary'
              : 'bg-foreground/10 text-foreground/80',
          )}
        >
          {tone === 'public' ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </span>
        <p
          className={cn(
            'text-[11px] font-bold tracking-[0.15em] uppercase',
            tone === 'public' ? 'text-primary' : 'text-foreground/70',
          )}
        >
          {label}
        </p>
      </div>
      <p className="text-sm text-muted-foreground leading-snug">
        {summary}
      </p>
    </div>
  );
}

export default CampaignsPage;
