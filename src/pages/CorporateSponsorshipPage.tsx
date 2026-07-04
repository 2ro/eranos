import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CircleCheck,
  HandCoins,
  Gavel,
  HandHeart,
  Handshake,
  HeartHandshake,
  ListChecks,
  Megaphone,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAppContext } from '@/hooks/useAppContext';
import { ERANOS_NPUB, TEAM_URL } from '@/lib/agoraDefaults';
import { openUrl } from '@/lib/downloadFile';

/**
 * The /sponsors page. A landing-style document for companies that want to
 * partner with the platform. Modeled on AboutPage's section recipe — a dark
 * hero, alternating cream/white section backgrounds, hand-rolled card
 * sub-components, and the canonical Inter-Bold section headings.
 *
 * Three ways to get involved (matching the partnership pitch):
 *   1. Donate to the Seed Fund (GRIN or USD)
 *   2. Match donations — individual campaigns, featured campaigns, or a
 *      curated list (e.g. political prisoners, women's sovereignty in Africa)
 *   3. Promote donations to your customer base as a philanthropic initiative
 *
 * Routed under the wide FundraiserLayout so sections can span the viewport
 * with their own backgrounds.
 */
export function CorporateSponsorshipPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('corporateSponsorship.seoTitle')} | ${config.appName}`,
    description: t('corporateSponsorship.seoDescription', { appName: config.appName }),
  });

  const appName = config.appName;

  // Corporate "get in touch" CTAs route to the team page.
  const contactTeam = () => void openUrl(TEAM_URL);

  return (
    <main className="min-h-screen bg-background">
      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-[#0a0c14] text-white"
        style={{
          backgroundImage: "url('/about/world-map-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#0a0c14]/85 via-[#0a0c14]/70 to-[#0a0c14]/95"
        />
        <div
          aria-hidden
          className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-32 size-[24rem] rounded-full bg-primary/15 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-4">
              {t('corporateSponsorship.hero.eyebrow', { appName })}
            </p>
            <h1 className="font-sans font-bold tracking-tight leading-[1.05] text-white text-4xl sm:text-6xl lg:text-7xl mb-8">
              {t('corporateSponsorship.hero.headlinePart1')}{' '}
              <span className="text-primary">
                {t('corporateSponsorship.hero.headlineHighlight')}
              </span>
            </h1>
            <p className="text-lg lg:text-xl text-gray-300 max-w-2xl leading-relaxed mb-8">
              {t('corporateSponsorship.hero.body', { appName })}
            </p>

            {/* Trust chips */}
            <ul className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
              {[
                t('corporateSponsorship.hero.trustChips.nonCustodial'),
                t('corporateSponsorship.hero.trustChips.transparent'),
                t('corporateSponsorship.hero.trustChips.noFees'),
              ].map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <CircleCheck className="size-4 text-primary" />
                  {label}
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={contactTeam}
                className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-6 text-base shadow-lg shadow-primary/25 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Handshake className="size-5" />
                {t('corporateSponsorship.hero.ctaPrimary')}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
              </button>
              <a
                href="#ways"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white/5 text-white hover:bg-white/10 font-medium h-12 px-6 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {t('corporateSponsorship.hero.ctaSecondary')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Why partner (cream / dark navy) ───────────────────────────── */}
      <section className="relative bg-[#faf8f4] dark:bg-[#0a0c14] py-20 md:py-28 overflow-hidden">
        <div
          aria-hidden
          className="hidden dark:block absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: "url('/about/world-map-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('corporateSponsorship.intro.eyebrow')}
            title={t('corporateSponsorship.intro.title')}
            lede={t('corporateSponsorship.intro.lede')}
          />

          <ul className="grid sm:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            <StatCard
              value={t('corporateSponsorship.intro.stats.feesValue')}
              label={t('corporateSponsorship.intro.stats.feesLabel')}
            />
            <StatCard
              value={t('corporateSponsorship.intro.stats.custodyValue')}
              label={t('corporateSponsorship.intro.stats.custodyLabel')}
            />
            <StatCard
              value={t('corporateSponsorship.intro.stats.reachValue')}
              label={t('corporateSponsorship.intro.stats.reachLabel')}
            />
          </ul>
        </div>
      </section>

      {/* ── 3. Three ways to partner (white / dark navy) ─────────────────── */}
      <section
        id="ways"
        className="relative bg-white dark:bg-[#13181f] py-20 md:py-28 scroll-mt-16 overflow-hidden"
      >
        <div
          aria-hidden
          className="hidden dark:block absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "url('/about/world-map-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('corporateSponsorship.ways.eyebrow')}
            title={t('corporateSponsorship.ways.title')}
            lede={t('corporateSponsorship.ways.lede')}
          />

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto items-start">
            <WayCard
              icon={<HandCoins className="size-5" />}
              kicker={t('corporateSponsorship.ways.seedFund.kicker')}
              title={t('corporateSponsorship.ways.seedFund.title')}
              description={t('corporateSponsorship.ways.seedFund.description', { appName })}
              bullets={[
                t('corporateSponsorship.ways.seedFund.bullet1'),
                t('corporateSponsorship.ways.seedFund.bullet2'),
                t('corporateSponsorship.ways.seedFund.bullet3'),
              ]}
              cta={t('corporateSponsorship.ways.seedFund.cta')}
              onCta={contactTeam}
            />
            <WayCard
              icon={<HeartHandshake className="size-5" />}
              kicker={t('corporateSponsorship.ways.matching.kicker')}
              title={t('corporateSponsorship.ways.matching.title')}
              description={t('corporateSponsorship.ways.matching.description')}
              bullets={[
                t('corporateSponsorship.ways.matching.bullet1'),
                t('corporateSponsorship.ways.matching.bullet2'),
                t('corporateSponsorship.ways.matching.bullet3'),
              ]}
              cta={t('corporateSponsorship.ways.matching.cta')}
              onCta={contactTeam}
            />
            <WayCard
              icon={<Megaphone className="size-5" />}
              kicker={t('corporateSponsorship.ways.promote.kicker')}
              title={t('corporateSponsorship.ways.promote.title', { appName })}
              description={t('corporateSponsorship.ways.promote.description', { appName })}
              bullets={[
                t('corporateSponsorship.ways.promote.bullet1'),
                t('corporateSponsorship.ways.promote.bullet2'),
                t('corporateSponsorship.ways.promote.bullet3'),
              ]}
              cta={t('corporateSponsorship.ways.promote.cta')}
              onCta={contactTeam}
            />
          </div>
        </div>
      </section>

      {/* ── 4. Matching in action (cream / dark navy) ────────────────────── */}
      <section className="bg-[#f5f1eb] dark:bg-[#0a0c14] py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('corporateSponsorship.matchingExamples.eyebrow')}
            title={t('corporateSponsorship.matchingExamples.title')}
            lede={t('corporateSponsorship.matchingExamples.lede')}
          />

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            <ExampleCard
              icon={<Gavel className="size-5" />}
              title={t('corporateSponsorship.matchingExamples.example1.title')}
              body={t('corporateSponsorship.matchingExamples.example1.body')}
            />
            <ExampleCard
              icon={<Users className="size-5" />}
              title={t('corporateSponsorship.matchingExamples.example2.title')}
              body={t('corporateSponsorship.matchingExamples.example2.body')}
            />
            <ExampleCard
              icon={<ListChecks className="size-5" />}
              title={t('corporateSponsorship.matchingExamples.example3.title')}
              body={t('corporateSponsorship.matchingExamples.example3.body')}
            />
          </div>
        </div>
      </section>

      {/* ── 5. Contact CTA (white / dark navy) ───────────────────────────── */}
      <section className="bg-white dark:bg-[#13181f] py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto mb-6 size-14 rounded-2xl bg-primary/10 dark:bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="size-7 text-primary" />
          </div>
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">
            {t('corporateSponsorship.cta.eyebrow')}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            {t('corporateSponsorship.cta.title')}
          </h2>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
            {t('corporateSponsorship.cta.body')}
          </p>
          <button
            type="button"
            onClick={contactTeam}
            className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-6 text-base shadow-lg shadow-primary/25 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <HandHeart className="size-5" />
            {t('corporateSponsorship.cta.button', { appName })}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </button>

          <p className="mt-8 text-sm text-muted-foreground">
            {t('corporateSponsorship.cta.followLine')}{' '}
            <Link
              to={`/${ERANOS_NPUB}`}
              className="font-medium text-primary hover:underline"
            >
              {t('corporateSponsorship.cta.followLink')}
            </Link>
            {t('corporateSponsorship.cta.followSuffix')}
          </p>
        </div>
      </section>
    </main>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  lede?: string;
}

function SectionHeader({ eyebrow, title, lede }: SectionHeaderProps) {
  return (
    <div className="text-center max-w-3xl mx-auto mb-14">
      <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">
        {eyebrow}
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
        {title}
      </h2>
      {lede && (
        <p className="text-base sm:text-lg leading-relaxed text-gray-600 dark:text-gray-400">
          {lede}
        </p>
      )}
    </div>
  );
}

interface StatCardProps {
  value: string;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  return (
    <li className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-sm p-7 text-center">
      <p className="text-4xl sm:text-5xl font-bold tracking-tight text-primary mb-2 tabular-nums">
        {value}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{label}</p>
    </li>
  );
}

interface WayCardProps {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  onCta: () => void;
}

function WayCard({ icon, kicker, title, description, bullets, cta, onCta }: WayCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-5 text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15">
            {icon}
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest">{kicker}</span>
        </div>
      </div>

      <div className="p-6 space-y-5 flex-1 flex flex-col">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2 leading-snug">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[15px]">
            {description}
          </p>
        </div>

        <ul className="space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CircleCheck className="size-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="text-gray-700 dark:text-gray-300 text-sm leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={onCta}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm h-10 px-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExampleCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
}

function ExampleCard({ icon, title, body }: ExampleCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-sm p-7">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/30 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-2 leading-snug">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[15px]">{body}</p>
    </div>
  );
}
