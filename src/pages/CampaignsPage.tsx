import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import {
  CommunityMiniCard,
  CommunityMiniCardSkeleton,
} from '@/components/discovery/CommunityMiniCard';
import { CommunityGrid } from '@/components/discovery/CommunityGrid';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { PledgeCard } from '@/components/PledgeCard';
import { useActions, type Action } from '@/hooks/useActions';
import { useAppContext } from '@/hooks/useAppContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeaturedOrganizations } from '@/hooks/useFeaturedOrganizations';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';
import type { ParsedCampaign } from '@/lib/campaign';
import type { ParsedCommunity } from '@/lib/communityUtils';

/** Cap on how many featured campaigns we render in the home-page row. */
const MAX_FEATURED_CAMPAIGNS = 4;
/**
 * Cap on featured groups and featured pledges in their respective home-page
 * sections. The dedicated pages render unlimited featured items; the home
 * page is a launchpad, not the canonical list.
 */
const MAX_FEATURED_PER_SECTION = 8;

function getPledgeCoord(action: Action) {
  return `36639:${action.pubkey}:${action.id}`;
}

/**
 * Home page (`/`).
 *
 * A curated launchpad: hero on top, then three featured sections — campaigns,
 * groups, pledges — each capped to a digestible row and linking out to its
 * dedicated browse page (`/campaigns/all`, `/groups`, `/pledges`). The home
 * page intentionally does *not* show community/pending/hidden grids,
 * unmoderated streams, or per-viewer "your X" shelves — those live on the
 * dedicated pages so the home stays scannable on every visit.
 *
 * Each section's "featured" set is derived from the same moderation labels
 * used on its dedicated page, so what surfaces here matches what surfaces
 * there (just truncated). Sections with no featured items collapse silently
 * rather than render an empty card; the page can degrade to "hero + one
 * section" without looking broken.
 */
export function CampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  return (
    <main className="min-h-screen pb-16">
      <Hero loggedIn={!!user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="featured">
        <FeaturedCampaignsSection />
        <FeaturedGroupsSection />
        <FeaturedPledgesSection />
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
                <a href="#featured">{t('campaigns.home.exploreCampaigns')}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section header
// ═══════════════════════════════════════════════════════════════════════════════

function SectionHeader({
  title,
  description,
  browseLabel,
  browseHref,
}: {
  title: string;
  description: string;
  browseLabel: string;
  browseHref: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Button asChild variant="ghost" size="sm" className="shrink-0">
        <Link to={browseHref}>
          {browseLabel}
          <ArrowRight className="size-4 ms-1 rtl:rotate-180" />
        </Link>
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Featured Campaigns
// ═══════════════════════════════════════════════════════════════════════════════

function FeaturedCampaignsSection() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();

  // Featured slot list — derived from moderation labels. Sorted newest-
  // featured first, capped, and hidden coords removed so a
  // featured-then-hidden campaign disappears from the row.
  const featuredCoords = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.featuredCoords)
      .filter((c) => !moderation.hiddenCoords.has(c))
      .sort(
        (a, b) =>
          (moderation.featuredOrder.get(b) ?? 0) -
          (moderation.featuredOrder.get(a) ?? 0),
      )
      .slice(0, MAX_FEATURED_CAMPAIGNS);
  }, [moderation]);

  const { data: featuredCampaigns, isLoading: featuredLoading } = useCampaigns(
    moderationReady && featuredCoords.length > 0
      ? { coordinates: featuredCoords, limit: MAX_FEATURED_CAMPAIGNS }
      : { coordinates: [], limit: MAX_FEATURED_CAMPAIGNS },
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
      .slice(0, MAX_FEATURED_CAMPAIGNS);
  }, [featuredCampaigns, featuredCoords, moderation]);

  const isLoading = !moderationReady || featuredLoading;

  // Once moderation is ready and there's nothing featured, collapse the
  // section silently — the home page can degrade to "hero + the sections
  // that have content".
  if (moderationReady && featuredCoords.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('campaigns.home.featured')}
        description={t('campaigns.home.featuredDesc', { appName: config.appName })}
        browseLabel={t('campaigns.home.browseAll')}
        browseHref="/campaigns/all"
      />

      <FeaturedCampaignsRow
        campaigns={orderedFeatured}
        isLoading={isLoading}
        expectedCount={featuredCoords.length}
      />
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

function FeaturedCampaignsRow({
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
    const skeletonCount = Math.max(
      1,
      Math.min(MAX_FEATURED_CAMPAIGNS, expectedCount || 2),
    );
    return (
      <div className={featuredGridClass(skeletonCount)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <CampaignCardSkeleton
            key={i}
            variant={skeletonCount === 1 ? 'featured' : 'compact'}
          />
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

// ═══════════════════════════════════════════════════════════════════════════════
// Featured Groups
// ═══════════════════════════════════════════════════════════════════════════════

function FeaturedGroupsSection() {
  const { t } = useTranslation();
  const { data: orgModeration, isReady: orgModerationReady } =
    useOrganizationModeration();
  const { data: featuredOrgs, isLoading: featuredOrgsLoading } =
    useFeaturedOrganizations();

  const featuredGroups = useMemo<ParsedCommunity[]>(() => {
    if (!featuredOrgs) return [];
    const hiddenCoords = orgModeration?.hiddenCoords ?? new Set<string>();
    return featuredOrgs
      .map((entry) => entry.community)
      .filter((c) => !hiddenCoords.has(c.aTag))
      .slice(0, MAX_FEATURED_PER_SECTION);
  }, [featuredOrgs, orgModeration]);

  // `useFeaturedOrganizations` is internally gated on moderation readiness,
  // so while moderation labels are still resolving the underlying query is
  // disabled and reports `isLoading: false` / `data: undefined`. Treat any
  // of "moderation not ready / featured query in flight / featured data
  // not yet defined" as loading so the skeleton stays on screen until we
  // know what's featured.
  const isLoading =
    !orgModerationReady || featuredOrgsLoading || featuredOrgs === undefined;

  if (!isLoading && featuredGroups.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('groups.list.featuredGroups')}
        description={t('groups.list.featuredGroupsTagline')}
        browseLabel={t('campaigns.home.browseAllGroups')}
        browseHref="/groups"
      />

      {isLoading ? (
        <CommunityGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <CommunityMiniCardSkeleton key={i} className="w-full" />
          ))}
        </CommunityGrid>
      ) : (
        <CommunityGrid>
          {featuredGroups.map((community) => (
            <CommunityMiniCard
              key={community.aTag}
              community={community}
              className="w-full"
            />
          ))}
        </CommunityGrid>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Featured Pledges
// ═══════════════════════════════════════════════════════════════════════════════

function FeaturedPledgesSection() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { data: btcPrice } = useBtcPrice();
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
      )
      .slice(0, MAX_FEATURED_PER_SECTION);
  }, [pledgeModeration, pledgeModerationReady]);

  const { data: featuredPledges, isLoading: featuredPledgesLoading } = useActions({
    coordinates: featuredPledgeCoords,
    limit: featuredPledgeCoords.length || 1,
    enabled: pledgeModerationReady && featuredPledgeCoords.length > 0,
  });

  const orderedFeaturedPledges = useMemo<Action[]>(() => {
    if (!featuredPledges || !pledgeModerationReady) return [];
    const order = pledgeModeration.featuredOrder;
    return [...featuredPledges]
      .sort((a, b) => {
        const aCoord = getPledgeCoord(a);
        const bCoord = getPledgeCoord(b);
        return (order.get(bCoord) ?? 0) - (order.get(aCoord) ?? 0);
      })
      .slice(0, MAX_FEATURED_PER_SECTION);
  }, [featuredPledges, pledgeModeration, pledgeModerationReady]);

  const isLoading =
    !pledgeModerationReady ||
    (featuredPledgeCoords.length > 0 && featuredPledgesLoading);

  // Same silent-collapse rule as the other two sections: once we know
  // there's nothing featured, drop the heading rather than render an
  // empty container.
  if (pledgeModerationReady && featuredPledgeCoords.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('pledges.list.featuredPledges')}
        description={t('pledges.list.featuredPledgesTagline', {
          appName: config.appName,
        })}
        browseLabel={t('campaigns.home.browseAllPledges')}
        browseHref="/pledges"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({
            length: Math.max(
              1,
              Math.min(MAX_FEATURED_PER_SECTION, featuredPledgeCoords.length || 4),
            ),
          }).map((_, i) => (
            <PledgeSkeleton key={i} />
          ))}
        </div>
      ) : orderedFeaturedPledges.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {orderedFeaturedPledges.map((action) => (
            <PledgeCard
              key={`${action.pubkey}:${action.id}`}
              action={action}
              btcPrice={btcPrice}
              showAuthor
              showTranslate
            />
          ))}
        </div>
      ) : (
        // Defensive — featured coords resolved to a non-empty set but the
        // events didn't come back (e.g. relay miss). Collapse silently.
        null
      )}
    </section>
  );
}

function PledgeSkeleton() {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm h-full flex flex-col">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex-1 p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}

// Re-exported so AppRouter's lazy import shape stays identical.
export default CampaignsPage;
