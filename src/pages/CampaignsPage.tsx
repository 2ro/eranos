import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, HandHeart, PlusCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { CampaignListsStrip } from '@/components/campaign-lists/CampaignListsStrip';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { useAuthor } from '@/hooks/useAuthor';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignList } from '@/hooks/useCampaignLists';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';
import { useAppContext } from '@/hooks/useAppContext';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * Maximum number of skeleton cards to render in the WLC hero row
 * while the campaigns are loading. The list itself can hold an
 * arbitrary number of members; the home row caps the visual count.
 */
const WLC_SKELETON_CAP = 8;

/**
 * Maximum number of campaigns shown in the WLC hero row on the home
 * page. The layout is two large hero cards on top followed by a
 * single 4-up row, so 6 is the visual cap. List members beyond the
 * cap are accessible from the dedicated list detail page.
 */
const WLC_HERO_CAP = 6;

/**
 * Slug of the curated list that powers the home-page hero row.
 * Matches the moderator-published kind-30003 event with
 * `d=world-liberty-congress` and `t=agora.campaign-list`.
 */
const WLC_LIST_SLUG = 'world-liberty-congress';

/**
 * World Liberty Congress — the partner organization whose curated
 * list powers the home-page hero row. Their pubkey and npub are
 * hard-coded here so the heading can link to their profile and
 * pull their avatar from kind 0 metadata via `useAuthor`,
 * regardless of which moderator pubkey actually authored the list
 * event.
 */
const WLC_PUBKEY = '56b3abb9baed20b6ab81617aa519c8634e920ef0351d2962ec2951a9b233ab2f';
const WLC_NPUB = 'npub126e6hwd6a5std2upv9a22xwgvd8fyrhsx5wjjchv99g6nv3n4vhs5fr9g3';

/**
 * Home page (`/`).
 *
 * Two public sections:
 *
 *  1. **WLC hero row** — the campaigns inside the curated
 *     `world-liberty-congress` list (a moderator-published kind
 *     30003 NIP-51 bookmark set), in list order, capped at
 *     {@link WLC_HERO_CAP} for visual weight. The list's own detail
 *     page at `/campaigns/lists/world-liberty-congress` exposes the
 *     full membership without a cap. Replaces the previous
 *     `featured`-label-based row — featuring is no longer a
 *     campaign-level concept; lists are.
 *  2. **Topic-list strip + Browse all** — the curated
 *     {@link CampaignListsStrip} (moderator-managed topic pills) plus
 *     a single CTA to `/campaigns`, the full discoverable set with
 *     search / sort / country filters.
 *
 * Hidden-campaign moderation lives entirely on `/campaigns` — the
 * Show-hidden toggle there is available to every viewer, and the
 * moderator-only Hidden collapsible there is the structured review
 * surface. The home page deliberately carries no Hidden affordance
 * so it never leads with suppressed content for anyone, moderators
 * included.
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

  // The curated list that backs the hero row. The slug is fixed in
  // code so the home page's editorial framing doesn't drift if a
  // moderator renames or reorders other lists. The list itself can
  // still be edited freely — its title isn't read here, only its
  // membership.
  const { list: wlcList, isLoading: listLoading } = useCampaignList(WLC_LIST_SLUG);

  // Cap the displayed coords. Beyond the cap, members are still
  // visible from the dedicated list detail page; the home row
  // shows the top {@link WLC_HERO_CAP}.
  const cappedCoords = useMemo(
    () => (wlcList?.coords ?? []).slice(0, WLC_HERO_CAP),
    [wlcList],
  );

  // `useCampaigns` ignores `limit` when `coordinates` is set, so
  // we don't pass one. The query is short-circuited to an empty
  // result when the list isn't loaded yet (so we don't fire a
  // useless fan-out before the list event arrives).
  const { data: heroCampaigns, isLoading: heroLoading } = useCampaigns(
    cappedCoords.length > 0
      ? { coordinates: cappedCoords }
      : { coordinates: [] },
  );

  // Filter out hidden campaigns and reorder to match the list's
  // declared order. `useCampaigns` returns events in network order
  // which we override here so the hero row always reflects the
  // moderator's intent.
  const { data: moderation } = useCampaignModeration();
  const orderedCampaigns = useMemo<ParsedCampaign[]>(() => {
    if (!heroCampaigns || cappedCoords.length === 0) return [];
    const hidden = moderation?.hiddenCoords ?? new Set<string>();
    const byCoord = new Map(heroCampaigns.map((c) => [c.aTag, c]));
    const out: ParsedCampaign[] = [];
    for (const coord of cappedCoords) {
      if (hidden.has(coord)) continue;
      const found = byCoord.get(coord);
      if (found) out.push(found);
    }
    return out;
  }, [heroCampaigns, cappedCoords, moderation]);

  useSeoMeta({
    title: `${t('campaigns.home.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.seoDescription'),
  });

  // Show the WLC section as long as there's something to show OR
  // the list is still loading on first paint (avoids a flash of
  // empty space for visitors who hit the page before the list
  // event arrives).
  const listEmpty = !listLoading && (!wlcList || wlcList.coords.length === 0);
  const showWlcSection =
    (wlcList && wlcList.coords.length > 0) ||
    listLoading ||
    (heroLoading && cappedCoords.length > 0);

  return (
    <main className="min-h-screen pb-16">
      <Hero loggedIn={!!user} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="campaigns">
        {showWlcSection && (
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
                  <BadgeCheck className="size-5 sm:size-6 text-primary shrink-0" aria-hidden="true" />
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('campaigns.home.wlcDesc', { appName: config.appName })}
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
                expectedCount={cappedCoords.length || 2}
              />
            )}

            {wlcList && wlcList.coords.length > WLC_HERO_CAP && (
              <div className="pt-1">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/campaigns/lists/${WLC_LIST_SLUG}`}>
                    {t('campaigns.home.viewFullList')}
                    <ArrowRight className="ml-1.5 size-4 rtl:rotate-180" />
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Curated topic-list strip + CTA to the full /campaigns
            browse surface. The canonical breadth-view is /campaigns,
            which already carries search, sort, and country filters.
            Keeping the home page to one tightly curated row above
            the strip (WLC) plus the strip itself makes the
            editorial hierarchy obvious: WLC's chosen heroes →
            moderator topics → click through for the full
            catalogue. */}
        <section className="space-y-5">
          <CampaignListsStrip />

          <div className="pt-2 flex justify-center sm:justify-start">
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/campaigns">
                {t('campaigns.home.browseAll')}
                <ArrowRight className="ml-2 size-4 rtl:rotate-180" />
              </Link>
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

/** Renders the WLC hero row with two large cards on top + 4-up tail. */
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
    const skeletonCount = Math.max(1, Math.min(WLC_SKELETON_CAP, expectedCount));
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

export default CampaignsPage;
