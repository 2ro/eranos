import { useSeoMeta } from '@unhead/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  Globe,
  HandHeart,
  Megaphone,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';

import { useAppContext } from '@/hooks/useAppContext';
import { HelpFAQSection } from '@/components/HelpFAQSection';
import { TEAM_SOAPBOX_PACK } from '@/lib/helpContent';
import { cn } from '@/lib/utils';

/**
 * The /about page. A landing-style document modeled on the public
 * https://soapbox.pub/agora landing, brought in-app to explain how
 * the platform works. Four sections:
 *
 *   1. Hero (dark)
 *   2. How it works, in three steps (cream)
 *   3. Need help? FAQ in three chapters (cream)
 *   4. Pick the side you're on: Donor / Recipient guides (white)
 *
 * Typography follows the CampaignsPage hero recipe exactly: Bebas Neue
 * (`font-display`) is reserved for the hero H1 (italic, normal weight,
 * stroke-painted) and the step numerals. Every other heading uses
 * Inter Bold (`font-sans font-bold tracking-tight`), the project's
 * canonical section-heading idiom. Bebas Neue is never bolded; doing
 * so produces unreadable synthetic-bold smear.
 */
export function AboutPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  // Routed under the wide FundraiserLayout in AppRouter so sections can
  // span the viewport with their own backgrounds.

  useSeoMeta({
    title: `${t('about.seoTitle')} | ${config.appName}`,
    description: t('about.seoDescription', { appName: config.appName }),
  });

  const appName = config.appName;

  // In-app link to the Team Soapbox follow pack, via the addressable
  // /:nip19 route. Encoded once per render (cheap).
  const teamSoapboxNaddr = useMemo(
    () =>
      nip19.naddrEncode({
        kind: TEAM_SOAPBOX_PACK.kind,
        pubkey: TEAM_SOAPBOX_PACK.pubkey,
        identifier: TEAM_SOAPBOX_PACK.identifier,
      }),
    [],
  );

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
        {/* Map-tint overlay */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#0a0c14]/85 via-[#0a0c14]/70 to-[#0a0c14]/95"
        />
        {/* Soft orange halos */}
        <div
          aria-hidden
          className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-32 size-[24rem] rounded-full bg-primary/15 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            {/* Headline column */}
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-4">
                {t('about.hero.eyebrow', { appName })}
              </p>
              {/* Hero H1: verbatim CampaignsPage recipe. Bebas Neue at
                  italic, font-normal, with -webkit-text-stroke painting
                  the optical weight. Never font-bold. */}
              <h1
                className="font-display italic font-normal tracking-wide leading-none uppercase text-white text-4xl sm:text-7xl lg:text-8xl mb-8 whitespace-nowrap sm:whitespace-normal"
                style={{
                  WebkitTextStroke: '0.022em currentColor',
                }}
              >
                {t('about.hero.headlinePart1')}{' '}
                {/* Orange highlighter span: same negative-margin trick
                    as CampaignsPage so the inner letter aligns with the
                    column edge despite the box padding. */}
                <span className="inline-block w-fit pl-0 pr-3 pt-1 pb-0 -mt-1 -mb-3 bg-primary text-white leading-[0.8] align-baseline">
                  <span className="-ml-1 inline-block">{appName}</span>
                </span>
                {/* Line break only on sm+ — on mobile the whole
                    headline fits on one line. */}
                <br className="hidden sm:inline" />
                {' '}{t('about.hero.headlinePart2')}
              </h1>
              <p className="text-lg lg:text-xl text-gray-300 max-w-2xl leading-relaxed mb-8">
                {t('about.hero.body', { appName })}
              </p>

              {/* Trust chips */}
              <ul className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
                {[
                  t('about.hero.trustChips.decentralized'),
                  t('about.hero.trustChips.openSource'),
                  t('about.hero.trustChips.censorshipResistant'),
                ].map((label) => (
                  <li key={label} className="flex items-center gap-2">
                    <CircleCheck className="size-4 text-primary" />
                    {label}
                  </li>
                ))}
              </ul>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/about/donors"
                  className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-6 text-base shadow-lg shadow-primary/25 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <HandHeart className="size-5" />
                  {t('about.hero.ctaDonor')}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </Link>
                <Link
                  to="/about/recipients"
                  className="group inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white/5 text-white hover:bg-white/10 font-medium h-12 px-6 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <Megaphone className="size-5" />
                  {t('about.hero.ctaRecipient')}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </Link>
              </div>
            </div>

            {/* Tilted preview card: sample campaign in the style of the
                Soapbox Agora landing. Hidden on mobile so the hero
                stays focused on the headline + CTAs. */}
            <div className="hidden lg:block lg:col-span-5 relative">
              <div className="relative max-w-md mx-auto">
                {/* Orange halo behind the card */}
                <div
                  aria-hidden
                  className="absolute inset-0 -m-8 rounded-3xl opacity-50 blur-3xl"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(255,102,0,0.4), transparent 65%)',
                  }}
                />
                <div className="relative rounded-lg border border-white/10 bg-[#1a1d24] overflow-hidden shadow-2xl rotate-[1.5deg] hover:rotate-0 transition-transform duration-500">
                  {/* Image header */}
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-orange-900 via-red-900 to-orange-800">
                    <img
                      src="/about/venezuela-libertad-presos-politicos.png"
                      alt={t('about.hero.sampleCard.imageAlt')}
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    {/* Country pill */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-xs font-medium flex items-center gap-1.5">
                      <span className="text-sm leading-none" aria-hidden>
                        🇻🇪
                      </span>
                      <span>{t('about.hero.sampleCard.countryName')}</span>
                    </div>
                    {/* Public pill */}
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-[11px] font-semibold flex items-center gap-1.5">
                      <Globe className="size-3" />
                      <span>{t('about.hero.sampleCard.public')}</span>
                    </div>
                  </div>
                  {/* Card body */}
                  <div className="p-5 text-white">
                    {/* Org row */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="size-7 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-red-700 flex items-center justify-center text-white text-xs font-bold">
                        V
                      </div>
                      <span className="text-xs text-gray-400">
                        {t('about.hero.sampleCard.orgName')}
                      </span>
                      <BadgeCheck className="size-3.5 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-white leading-snug mb-3">
                      {t('about.hero.sampleCard.title')}
                    </h3>
                    <p className="text-xs text-gray-400 leading-snug mb-4 line-clamp-2">
                      {t('about.hero.sampleCard.description')}
                    </p>
                    {/* Progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mb-2">
                      <div className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full w-[78%]" />
                    </div>
                    {/* Amount row */}
                    <div className="flex items-baseline justify-between mb-1">
                      <div>
                        <span className="font-bold text-white text-base">
                          $8,420
                        </span>
                        <span className="text-gray-400 text-xs"> {t('about.hero.sampleCard.raised')}</span>
                      </div>
                      <span className="text-gray-500 text-xs">{t('about.hero.sampleCard.ofGoal')}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-4">
                      {t('about.hero.sampleCard.donorsLine')}
                    </p>
                    {/* Donate button */}
                    <Link
                      to="/"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm h-10 rounded-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <HandHeart className="size-4" />
                      {t('about.hero.sampleCard.donate')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. How it works, in three steps (light cream / dark navy) ──── */}
      <section
        id="how-it-works"
        className="relative bg-[#faf8f4] dark:bg-[#0a0c14] py-20 md:py-28 overflow-hidden"
      >
        {/* Subtle world-map texture in dark mode only */}
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
            eyebrow={t('about.howItWorks.eyebrow')}
            title={t('about.howItWorks.title')}
            lede={t('about.howItWorks.lede')}
          />

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <StepCard
              number="01"
              image="/help/step-1-account.jpg"
              imageAlt={t('about.howItWorks.step1.imageAlt')}
              title={t('about.howItWorks.step1.title')}
              body={t('about.howItWorks.step1.body', { appName })}
            />
            <StepCard
              number="02"
              image="/help/step-2-send.jpg"
              imageAlt={t('about.howItWorks.step2.imageAlt')}
              title={t('about.howItWorks.step2.title')}
              body={t('about.howItWorks.step2.body', { appName })}
            />
            <StepCard
              number="03"
              image="/help/step-3-spend.jpg"
              imageAlt={t('about.howItWorks.step3.imageAlt')}
              title={t('about.howItWorks.step3.title')}
              body={t('about.howItWorks.step3.body')}
            />
          </div>
        </div>
      </section>

      {/* ── 3. Need help? FAQ (cream / dark navy, integrated as three chapters) ───── */}
      <section
        id="faq"
        className="bg-[#f5f1eb] dark:bg-[#0a0c14] py-20 md:py-28 scroll-mt-16"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('about.faq.eyebrow')}
            title={t('about.faq.title')}
          />

          {/* Three chapter mini-sections, rendered inline in page flow */}
          <div className="max-w-3xl mx-auto space-y-16">
            {FAQ_CHAPTERS.map((chapter) => (
              <FAQChapter
                key={chapter.id}
                number={chapter.number}
                title={t(chapter.labelKey)}
                description={t(chapter.descriptionKey)}
                categoryId={chapter.id}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Pick the side you're on (white / dark navy variant) ────────── */}
      <section className="bg-white dark:bg-[#13181f] py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('about.guides.eyebrow')}
            title={t('about.guides.title')}
            lede={t('about.guides.lede')}
          />

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            <GuideCard
              to="/about/donors"
              image="/about/donor-guide-freedom-libertad.jpeg"
              imageAlt={t('about.guides.donor.imageAlt')}
              role={t('about.guides.donor.role')}
              icon={<HandHeart className="size-5" />}
              accent="blue"
              title={t('about.guides.donor.title')}
              description={t('about.guides.donor.description')}
              bullets={[
                t('about.guides.donor.bullet1'),
                t('about.guides.donor.bullet2'),
              ]}
              cta={t('about.guides.donor.cta')}
            />
            <GuideCard
              to="/about/recipients"
              image="/about/activist-guide-unity.png"
              imageAlt={t('about.guides.recipient.imageAlt')}
              role={t('about.guides.recipient.role')}
              icon={<Megaphone className="size-5" />}
              accent="orange"
              title={t('about.guides.recipient.title')}
              description={t('about.guides.recipient.description')}
              bullets={[
                t('about.guides.recipient.bullet1'),
              ]}
              cta={t('about.guides.recipient.cta')}
            />
          </div>

          {/* Page-closing 'Still stuck?' line: quiet pointer to the
              Team Soapbox follow pack via the in-app /:nip19 route. */}
          <p className="mt-16 text-center text-sm text-muted-foreground">
            {t('about.guides.stillStuck')}{' '}
            <Link
              to={`/${teamSoapboxNaddr}`}
              className="font-medium text-primary hover:underline"
            >
              {t('about.guides.followTeam')}
            </Link>
            {t('about.guides.stillStuckSuffix')}
          </p>
        </div>
      </section>
    </main>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────

/**
 * Three FAQ chapters rendered in page flow. Category IDs match
 * `helpContent.ts` so we can hand them to `HelpFAQSection` for
 * rendering. Labels and descriptions are page-side copy, not the
 * helpContent.ts labels (kept here so the chapter chrome stays
 * editorial without coupling helpContent to the About page.
 */
const FAQ_CHAPTERS: Array<{
  id: string;
  number: string;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    id: 'getting-started',
    number: '01',
    labelKey: 'about.faq.chapter1.label',
    descriptionKey: 'about.faq.chapter1.description',
  },
  {
    id: 'payments',
    number: '02',
    labelKey: 'about.faq.chapter2.label',
    descriptionKey: 'about.faq.chapter2.description',
  },
  {
    id: 'about-nostr',
    number: '03',
    labelKey: 'about.faq.chapter3.label',
    descriptionKey: 'about.faq.chapter3.description',
  },
];

interface FAQChapterProps {
  number: string;
  title: string;
  description: string;
  categoryId: string;
}

/**
 * A single chapter within the FAQ section: chapter numeral on the
 * left, chapter heading + description, then the accordion items for
 * the matching helpContent category underneath. Inline in page flow.
 * no tabs, no JS state. Anchored via `id="faq-<id>"` so the chapter
 * quick-jump strip can link directly to it.
 */
function FAQChapter({ number, title, description, categoryId }: FAQChapterProps) {
  return (
    <div id={`faq-${categoryId}`} className="scroll-mt-20">
      <div className="flex items-baseline gap-4 sm:gap-5 mb-6">
        <span
          aria-hidden
          className="font-display italic font-normal text-4xl sm:text-5xl text-primary leading-none tabular-nums"
        >
          {number}
        </span>
        <div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white leading-snug">
            {title}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <HelpFAQSection
        categories={[categoryId]}
        hideHeadings
        listTone="reference"
      />
    </div>
  );
}

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  lede?: string;
  /** Light backgrounds use dark text; dark backgrounds invert. */
  theme?: 'light' | 'dark';
}

function SectionHeader({
  eyebrow,
  title,
  lede,
  theme = 'light',
}: SectionHeaderProps) {
  return (
    <div className="text-center max-w-3xl mx-auto mb-14">
      <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">
        {eyebrow}
      </p>
      {/* Inter Bold, NOT Bebas Neue. The codebase's canonical section H2. */}
      <h2
        className={cn(
          'text-2xl sm:text-3xl font-bold tracking-tight mb-4',
          theme === 'dark'
            ? 'text-white'
            : 'text-gray-900 dark:text-white',
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'text-base sm:text-lg leading-relaxed',
            theme === 'dark'
              ? 'text-gray-400'
              : 'text-gray-600 dark:text-gray-400',
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

interface StepCardProps {
  number: string;
  image: string;
  imageAlt: string;
  title: string;
  body: string;
}

function StepCard({ number, image, imageAlt, title, body }: StepCardProps) {
  return (
    <div className="relative bg-white dark:bg-[#1c2230] rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-md dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      <div className="aspect-[4/3] bg-[#0a0c14] relative overflow-hidden">
        <img
          src={image}
          alt={imageAlt}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        {/* Step numeral: Bebas Neue is appropriate here as designed
            signage, not a heading. font-normal, not bold. */}
        <div className="absolute top-4 left-4 font-display font-normal text-white text-5xl leading-none drop-shadow-lg">
          {number}
        </div>
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3 leading-snug">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[15px]">{body}</p>
      </div>
    </div>
  );
}

interface GuideCardProps {
  to: string;
  image: string;
  imageAlt: string;
  role: string;
  icon: React.ReactNode;
  accent: 'blue' | 'orange';
  title: string;
  description: string;
  bullets: string[];
  cta: string;
}

function GuideCard({
  to,
  image,
  imageAlt,
  role,
  icon,
  accent,
  title,
  description,
  bullets,
  cta,
}: GuideCardProps) {
  const accentText = accent === 'blue' ? 'text-blue-600' : 'text-primary';
  const accentBg =
    accent === 'blue'
      ? 'bg-blue-600 hover:bg-blue-700'
      : 'bg-primary hover:bg-primary/90';
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-sm overflow-hidden flex flex-col transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Image header */}
      <div className="aspect-[16/9] bg-gray-100 dark:bg-[#0a0c14] relative overflow-hidden">
        <img
          src={image}
          alt={imageAlt}
          className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute bottom-4 left-5 flex items-center gap-3">
          <div
            className={cn(
              'size-10 rounded-xl bg-white/95 backdrop-blur flex items-center justify-center shadow',
              accentText,
            )}
          >
            {icon}
          </div>
          <span className="text-white text-xs font-semibold uppercase tracking-widest drop-shadow">
            {role}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-7 sm:p-8 flex flex-col flex-1">
        <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2 leading-snug">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">{description}</p>
        <ul className="space-y-2.5 mb-7">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CircleCheck className={cn('size-4 shrink-0 mt-0.5', accentText)} />
              <span className="text-gray-700 dark:text-gray-300 text-sm leading-snug">{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <span
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md text-white font-semibold text-sm h-10 px-5 transition-colors w-full sm:w-auto',
              accentBg,
            )}
          >
            {cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
