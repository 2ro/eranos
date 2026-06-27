import { useSeoMeta } from '@unhead/react';
import { useTranslation, Trans } from 'react-i18next';
import { HeartHandshake, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroBanner } from '@/components/HeroBanner';
import { VenezuelaReliefGoal } from '@/components/VenezuelaReliefGoal';
import { VenezuelaReliefShowcase } from '@/components/VenezuelaReliefShowcase';
import { useAppContext } from '@/hooks/useAppContext';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import {
  VENEZUELA_RELIEF_IMAGES,
  VENEZUELA_RELIEF_PATH,
} from '@/lib/venezuelaRelief';

/** DOM id of the showcase section the hero "Donate" CTA scrolls to. */
const SHOWCASE_ID = 'venezuela-relief-campaigns';

/**
 * Dedicated, shareable Venezuela earthquake relief page (`/venezuela-relief`).
 *
 * The loud appeal hero (headline, body, live aggregate raised total,
 * donate / share CTAs) sits on top, sourced from the shared
 * `campaigns.home.venezuelaRelief.*` locale keys. Beneath it, a showcase
 * rail ({@link VenezuelaReliefShowcase}) lists every Venezuela-located
 * campaign tagged for relief (`humanitarian-aid` / `emergency-relief`),
 * resolved live — so this URL is a self-contained, shareable directory of
 * on-the-ground relief efforts a donor can give to directly.
 *
 * Remove the route in AppRouter when the relief response winds down.
 */
export function VenezuelaReliefPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const shareOrigin = useShareOrigin();
  const { toast } = useToast();

  useSeoMeta({
    title: `${t('campaigns.home.venezuelaRelief.seoTitle')} | ${config.appName}`,
    description: t('campaigns.home.venezuelaRelief.seoDescription'),
    ogImage: `${shareOrigin}${VENEZUELA_RELIEF_IMAGES[0]}`,
  });

  const handleShare = async () => {
    const result = await shareOrCopy(
      `${shareOrigin}${VENEZUELA_RELIEF_PATH}`,
      t('campaigns.home.venezuelaRelief.shareTitle'),
    );
    if (result === 'copied') {
      toast({ title: t('campaigns.home.venezuelaRelief.linkCopied') });
    }
  };

  // "Donate to relief" scrolls down to the campaign showcase rather than
  // navigating away — this page *is* the directory of relief campaigns.
  const handleScrollToCampaigns = () => {
    document
      .getElementById(SHOWCASE_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main>
      {/* Hero: same loud disaster-appeal treatment as the home banner. */}
      <section
        aria-labelledby="venezuela-relief-page-title"
        className="relative overflow-hidden bg-[hsl(220_25%_6%)] text-white"
      >
        <HeroBanner images={VENEZUELA_RELIEF_IMAGES} intervalMs={9000} />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.5)_35%,rgba(0,0,0,0)_70%)] rtl:bg-[linear-gradient(to_left,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.5)_35%,rgba(0,0,0,0)_70%)]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16 flex flex-col justify-center">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/90 mb-4">
              {t('campaigns.home.venezuelaRelief.pageEyebrow')}
            </p>
            <h1
              id="venezuela-relief-page-title"
              className="font-display italic font-normal uppercase tracking-wide leading-[0.92] text-4xl sm:text-7xl lg:text-8xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
              style={{ WebkitTextStroke: '0.018em currentColor' }}
            >
              <Trans
                i18nKey="campaigns.home.venezuelaRelief.title"
                components={[
                  <span
                    key="hl"
                    className="inline-block w-fit ps-0 pe-3 bg-primary text-white leading-[0.95] align-baseline"
                    style={{ textIndent: '-0.06em' }}
                  />,
                ]}
              />
            </h1>

            <p className="mt-7 text-sm sm:text-lg lg:text-xl text-white max-w-xl leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
              {t('campaigns.home.venezuelaRelief.body')}
            </p>

            {/* Live aggregate raised total across all matching campaigns. */}
            <VenezuelaReliefGoal variant="overlay" className="mt-7" />

            <div className="mt-7 flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                size="lg"
                onClick={handleScrollToCampaigns}
                className="rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px] motion-safe:transition-colors"
              >
                <HeartHandshake className="mr-2" />
                {t('campaigns.home.venezuelaRelief.donate')}
              </Button>

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

            <p className="text-xs text-white/50 pt-5">
              {t('campaigns.home.venezuelaRelief.credit')}
            </p>
          </div>
        </div>
      </section>

      {/* Body: how-it-works explainer + the live showcase of every matching
          Venezuela relief campaign. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-12">
        <section className="max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t('campaigns.home.venezuelaRelief.pageHow')}
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            {t('campaigns.home.venezuelaRelief.pageHowBody')}
          </p>
        </section>

        <VenezuelaReliefShowcase id={SHOWCASE_ID} />
      </div>
    </main>
  );
}

export default VenezuelaReliefPage;
