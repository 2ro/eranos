import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { HeartHandshake, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroBanner } from '@/components/HeroBanner';
import { VenezuelaReliefGoal } from '@/components/VenezuelaReliefGoal';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import {
  VENEZUELA_DONATE_PATH,
  VENEZUELA_RELIEF_IMAGES,
  VENEZUELA_RELIEF_PATH,
} from '@/lib/venezuelaRelief';
import { cn } from '@/lib/utils';

/**
 * Ordered set of news photographs from the Venezuela earthquake that
 * rotate behind the relief banner. Sourced from the shared
 * {@link VENEZUELA_RELIEF_IMAGES} constant so the hero, popup, and
 * dedicated page stay in sync. They live in `/public/hero/` and use the
 * shared {@link HeroBanner} crossfade + slow-pan treatment, the same
 * animation as the site's other page heroes. Photo attributions are
 * surfaced generically in the `credit` copy beneath the banner.
 */
const VENEZUELA_RELIEF_BANNER_IMAGES = VENEZUELA_RELIEF_IMAGES;

/**
 * Full-bleed emergency relief banner pinned to the very top of the
 * home page during the Venezuela earthquake response.
 *
 * This is deliberately loud — a disaster appeal, not a subtle promo:
 *
 *  - A full-bleed crossfading gallery of news photographs from the
 *    quake (via the shared {@link HeroBanner}: slow pan + crossfade,
 *    reduced-motion aware) sits behind the copy. A light dark gradient
 *    keeps the headline and CTAs readable while letting the photos stay
 *    the focus.
 *  - A large display headline ("Venezuela needs you") with the final
 *    word painted inside a solid brand-orange highlighter block — the
 *    same idiom as the home hero's "unstoppable".
 *  - A primary call to action — **Donate to relief** — deep-links
 *    straight to the baked-in relief campaign (its naddr) so donors land
 *    on the campaign's detail page, plus a **Share** action.
 *
 * Not dismissible by design — while the appeal is active it stays put
 * for every visitor (product decision). When the response winds down,
 * remove `<VenezuelaReliefBanner />` from {@link CampaignsPage}.
 *
 * All copy lives under `campaigns.home.venezuelaRelief.*` in the
 * locale files so every shipped language stays in sync.
 */
export function VenezuelaReliefBanner({ className }: { className?: string }) {
  const { t } = useTranslation();
  const shareOrigin = useShareOrigin();
  const { toast } = useToast();

  const handleShare = async () => {
    const result = await shareOrCopy(
      `${shareOrigin}${VENEZUELA_RELIEF_PATH}`,
      t('campaigns.home.venezuelaRelief.shareTitle'),
    );
    if (result === 'copied') {
      toast({ title: t('campaigns.home.venezuelaRelief.linkCopied') });
    }
  };

  return (
    <section
      aria-labelledby="venezuela-relief-title"
      role="region"
      className={cn(
        'relative overflow-hidden border-b border-border bg-[hsl(220_25%_6%)] text-white',
        className,
      )}
    >
      {/* Layer 1 — full-bleed crossfading photo gallery. A long
          interval gives a slow, contemplative pacing; HeroBanner's
          built-in 1.5s crossfade + slow pan handles the dissolve. */}
      <HeroBanner images={VENEZUELA_RELIEF_BANNER_IMAGES} intervalMs={9000} />

      {/* Layer 2 — readability gradient. Lighter than a typical hero
          overlay so the photograph stays the focus: a gentle vertical
          darken plus a horizontal start-edge darken. The horizontal
          stops are pinned with explicit percentages (rather than the
          default even thirds) so the dark backing reliably reaches the
          end of the centred content column on ultrawide screens and
          fades to a clean transparent on the trailing half. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.5)_35%,rgba(0,0,0,0)_70%)] rtl:bg-[linear-gradient(to_left,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.5)_35%,rgba(0,0,0,0)_70%)]"
      />

      {/* Layer 2a — side shadowbox / vignette. Darkens only the outermost
          edges so the banner frames cleanly on ultrawide displays instead
          of the photo bleeding flat to the screen edges. The dark stops
          sit at 0% and 100% and fall off fast (by ~12%), so on normal
          widths the readable centre is untouched while wide monitors get
          a soft letterbox-style frame on both sides. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0)_12%,rgba(0,0,0,0)_88%,rgba(0,0,0,0.55)_100%)]"
      />

      {/* Layer 2b — film-grain noise. A tiny inline SVG fractal-noise
          texture tiled across the banner at low opacity, with
          `mix-blend-overlay` so it reads as grain over the photo rather
          than a flat grey wash. Adds depth and ties the warm photo tones
          to the dark UI. Pure CSS/SVG, negligible cost, `pointer-events-
          none` so it never intercepts clicks. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '160px 160px',
        }}
      />

      {/* Layer 3 — content. Fills ~85% of the initial viewport so it
          reads as the headline of the day rather than a sibling band,
          with a sensible minimum on very short / very tall screens.
          `dvh` so mobile browser chrome (collapsing address bar) doesn't
          jump the height. */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 h-[85dvh] min-h-[520px] max-h-[1200px] flex flex-col justify-center">
        <div className="max-w-3xl">
          <h2
            id="venezuela-relief-title"
            className="font-display italic font-normal uppercase tracking-wide leading-[0.92] text-5xl sm:text-7xl lg:text-8xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
            style={{ WebkitTextStroke: '0.018em currentColor' }}
          >
            <Trans
              i18nKey="campaigns.home.venezuelaRelief.title"
              components={[
                // Index 0: the emphasised word, painted inside a solid
                // brand-orange highlighter block that hugs the text, the
                // same idiom as the home hero's "unstoppable". `text-indent`
                // compensates for Bebas Neue's italic skew so the orange
                // sits flush against the first letter. `leading-[0.95]`
                // keeps the block hugging the cap height (matching the
                // home hero) instead of ballooning to the line box.
                <span
                  key="hl"
                  className="inline-block w-fit ps-0 pe-3 bg-primary text-white leading-[0.95] align-baseline"
                  style={{ textIndent: '-0.06em' }}
                />,
              ]}
            />
          </h2>

          {/* Body sits lower, with generous breathing room above it. A
              soft shadow keeps it legible now that the overlay is light. */}
          <p className="mt-7 text-base sm:text-lg lg:text-xl text-white max-w-xl leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
            {t('campaigns.home.venezuelaRelief.body')}
          </p>

          {/* Live fundraising progress for the baked-in relief campaign —
              the info half of this info + donation hybrid. */}
          <VenezuelaReliefGoal variant="overlay" className="mt-7" />

          <div className="mt-7 flex flex-col sm:flex-row flex-wrap gap-3">
            {/* Primary CTA — donate to Venezuela-filtered relief campaigns */}
            <Button
              size="lg"
              asChild
              className="rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px] motion-safe:transition-colors"
            >
              <Link to={VENEZUELA_DONATE_PATH}>
                <HeartHandshake className="mr-2" />
                {t('campaigns.home.venezuelaRelief.donate')}
              </Link>
            </Button>

            {/* Secondary CTA — share: native share sheet or copy link */}
            <Button
              variant="outline"
              size="lg"
              onClick={handleShare}
              className="rounded-full h-12 px-6 text-base border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white hover:border-white/60 [&_svg]:size-[18px]"
            >
              <Share2 className="mr-2" />
              {t('campaigns.home.venezuelaRelief.share')}
            </Button>
          </div>

          {/* Photo credit — accuracy + attribution */}
          <p className="text-xs text-white/50 pt-1">
            {t('campaigns.home.venezuelaRelief.credit')}
          </p>

          {/* Quiet link to the dedicated, shareable relief page */}
          <Link
            to={VENEZUELA_RELIEF_PATH}
            className="mt-2 inline-block text-sm font-medium text-white/80 underline underline-offset-4 hover:text-white motion-safe:transition-colors"
          >
            {t('campaigns.home.venezuelaRelief.learnMore')}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default VenezuelaReliefBanner;
