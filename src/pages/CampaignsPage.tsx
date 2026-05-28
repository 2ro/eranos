import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { CampaignsDiscoverySection } from '@/components/discovery/CampaignsDiscoverySection';
import { GroupsDiscoverySection } from '@/components/discovery/GroupsDiscoverySection';
import { PledgesDiscoverySection } from '@/components/discovery/PledgesDiscoverySection';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Home page (`/`).
 *
 * Hero on top, then the three discovery sections back-to-back —
 * Campaigns, Groups, Pledges — each with the same title, tagline,
 * and search/sort/country toolbar as its dedicated page. Filter
 * state is purely local here (`filterPersistence="local"`):
 * persisting three sets of `?q=&sort=&country=` would either
 * collide (three sections want `?q=`) or pollute the URL with
 * prefixed variants on every keystroke. Refreshing `/` always
 * lands on the curated idle view, which matches what we want
 * anyway. Users who want shareable / persistent filters go to
 * `/campaigns/all`, `/groups`, or `/pledges`.
 *
 * The home page intentionally omits the moderator-only Hidden
 * collapsibles and per-viewer "My X" shelves — those live on the
 * dedicated pages so the home stays scannable on every visit.
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

      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12"
        id="discover"
      >
        <CampaignsDiscoverySection filterPersistence="local" />
        <GroupsDiscoverySection filterPersistence="local" />
        <PledgesDiscoverySection filterPersistence="local" />
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
                <a href="#discover">{t('campaigns.home.exploreCampaigns')}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CampaignsPage;
