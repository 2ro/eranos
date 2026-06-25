import { useSeoMeta } from '@unhead/react';
import { useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { HeartHandshake, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HeroBanner } from '@/components/HeroBanner';
import { VenezuelaReliefGoal } from '@/components/VenezuelaReliefGoal';
import { CampaignDetailPage } from '@/pages/CampaignDetailPage';
import { useAppContext } from '@/hooks/useAppContext';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { shareOrCopy } from '@/lib/share';
import {
  VENEZUELA_RELIEF_CAMPAIGN_IDENTIFIER,
  VENEZUELA_RELIEF_CAMPAIGN_PUBKEY,
  VENEZUELA_RELIEF_IMAGES,
  VENEZUELA_RELIEF_PATH,
} from '@/lib/venezuelaRelief';

/**
 * Dedicated, shareable Venezuela earthquake relief page (`/venezuela-relief`).
 *
 * The loud appeal hero (headline, body, live goal progress, donate /
 * fundraise / share CTAs) sits on top, sourced from the shared
 * `campaigns.home.venezuelaRelief.*` locale keys. Beneath it, the baked-in
 * relief campaign (`terremoto-venezuela`, kind 33863) is embedded in full
 * via {@link CampaignDetailPage} — the same story, donate panel, ledger,
 * and comments a donor sees at the campaign's naddr — so this URL is a
 * self-contained info + donation page that can be shared directly (social
 * posts, messages, QR).
 *
 * Routed under the wide FundraiserLayout so the hero spans the viewport
 * like /about. Remove the route in AppRouter when the relief response
 * winds down.
 *
 * Note: the embedded {@link CampaignDetailPage} sets its own SEO meta from
 * the campaign event, so it intentionally wins over the appeal copy here —
 * shared links surface the live campaign's title and cover.
 */
export function VenezuelaReliefPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const shareOrigin = useShareOrigin();
  const { toast } = useToast();

  // Timer for clearing the transient donate-panel highlight (see
  // handleScrollToCampaign).
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // "Donate to relief" scrolls down to the embedded campaign rather than
  // navigating away — this page *is* the campaign. The donate panel (QR +
  // pay buttons) is rendered twice inside CampaignDetailPage: an inline
  // card at the top of the body on mobile (`#campaign-donate`) and a
  // sticky sidebar on desktop (`#campaign-donate-desktop`). We scroll to
  // and flash whichever one is actually laid out, so the real donate
  // controls come into focus on both breakpoints.
  //
  // The donate panel lives inside the embedded CampaignDetailPage, so we
  // can't drive its highlight through this component's React state; we
  // toggle a utility class on the DOM node directly instead. The ring
  // classes (and their reduced-motion fallback) live in index.css under
  // `.relief-donate-flash`.
  const handleScrollToCampaign = () => {
    const isVisible = (el: HTMLElement | null) => !!el && el.getClientRects().length > 0;
    const mobile = document.getElementById('campaign-donate');
    const desktop = document.getElementById('campaign-donate-desktop');
    const target =
      (isVisible(mobile) && mobile) ||
      (isVisible(desktop) && desktop) ||
      document.getElementById('venezuela-relief-campaign');
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    target.classList.add('relief-donate-flash');
    highlightTimer.current = setTimeout(() => {
      target.classList.remove('relief-donate-flash');
    }, 2000);
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

            {/* Live fundraising progress for the baked-in relief campaign. */}
            <VenezuelaReliefGoal variant="overlay" className="mt-7" />

            <div className="mt-7 flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                size="lg"
                onClick={handleScrollToCampaign}
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

      {/* The actual relief campaign, baked in: story, donate panel,
          ledger, and comments — the full detail UI for the campaign at
          VENEZUELA_DONATE_PATH. The "Donate to relief" CTA flashes a
          highlight ring on the donate panel (mobile) or this section
          (desktop) via the `.relief-donate-flash` class — see
          handleScrollToCampaign. */}
      <div id="venezuela-relief-campaign" className="scroll-mt-4 rounded-2xl">
        <CampaignDetailPage
          pubkey={VENEZUELA_RELIEF_CAMPAIGN_PUBKEY}
          identifier={VENEZUELA_RELIEF_CAMPAIGN_IDENTIFIER}
        />
      </div>
    </main>
  );
}

export default VenezuelaReliefPage;
