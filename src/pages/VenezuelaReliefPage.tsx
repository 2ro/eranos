import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Bitcoin, HandHeart, HeartHandshake, PlusCircle, ShieldCheck, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroBanner } from '@/components/HeroBanner';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { useAppContext } from '@/hooks/useAppContext';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import {
  VENEZUELA_DONATE_PATH,
  VENEZUELA_RELIEF_IMAGES,
  VENEZUELA_RELIEF_PATH,
} from '@/lib/venezuelaRelief';

/**
 * Dedicated, shareable Venezuela earthquake relief page (`/venezuela-relief`).
 *
 * Carries the same appeal as the home-page hero
 * ({@link VenezuelaReliefBanner}) and the session popup
 * ({@link VenezuelaReliefPopup}): same photo gallery, headline, body, and
 * donate / fundraise CTAs, all sourced from the shared
 * `campaigns.home.venezuelaRelief.*` locale keys. Existing as its own URL
 * lets the appeal be shared directly (social posts, messages, QR) and
 * gives the popup / hero a "Learn more" destination.
 *
 * Routed under the wide FundraiserLayout so the hero spans the viewport
 * like /about. Remove the route in AppRouter when the relief response
 * winds down.
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

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 min-h-[70dvh] flex flex-col justify-center">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/90 mb-4">
              {t('campaigns.home.venezuelaRelief.pageEyebrow')}
            </p>
            <h1
              id="venezuela-relief-page-title"
              className="font-display italic font-normal uppercase tracking-wide leading-[0.92] text-5xl sm:text-7xl lg:text-8xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
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

            <p className="mt-7 text-base sm:text-lg lg:text-xl text-white max-w-xl leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
              {t('campaigns.home.venezuelaRelief.body')}
            </p>

            <div className="mt-7 flex flex-col sm:flex-row flex-wrap gap-3">
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

              <Button
                variant="outline"
                size="lg"
                asChild
                className="rounded-full h-12 px-6 text-base border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white hover:border-white/60 [&_svg]:size-[18px]"
              >
                <StartCampaignLink>
                  <PlusCircle className="mr-2" />
                  {t('campaigns.home.venezuelaRelief.startCampaign')}
                </StartCampaignLink>
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

      {/* How your donation helps: the non-custodial pitch. */}
      <section className="bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t('campaigns.home.venezuelaRelief.pageHow')}
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            {t('campaigns.home.venezuelaRelief.pageHowBody')}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <Bitcoin className="size-6 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                <Trans i18nKey="campaigns.home.whyDifferent.lede">
                  Direct Bitcoin from donor to recipient.
                </Trans>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t('campaigns.home.venezuelaRelief.pageHowBody')}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <HandHeart className="size-6 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t('campaigns.home.venezuelaRelief.body')}
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full font-semibold [&_svg]:size-[18px]">
              <Link to={VENEZUELA_DONATE_PATH}>
                <HeartHandshake className="mr-2" />
                {t('campaigns.home.venezuelaRelief.donate')}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleShare}
              className="rounded-full [&_svg]:size-[18px]"
            >
              <Share2 className="mr-2" />
              {t('campaigns.home.venezuelaRelief.share')}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default VenezuelaReliefPage;
