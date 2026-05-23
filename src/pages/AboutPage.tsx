import { useSeoMeta } from '@unhead/react';
import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bitcoin,
  CircleCheck,
  Globe,
  HandHeart,
  Megaphone,
  ShieldCheck,
  ShieldOff,
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
 * the platform works. Five sections:
 *
 *   1. Hero (dark)
 *   2. How it works, in three steps (cream)
 *   3. Two ways to get paid: compare cards (dark)
 *   4. Need help? FAQ in three chapters (cream)
 *   5. Pick the side you're on: Donor / Activist guides (white)
 *
 * Typography follows the CampaignsPage hero recipe exactly: Bebas Neue
 * (`font-display`) is reserved for the hero H1 (italic, normal weight,
 * stroke-painted) and the step numerals. Every other heading uses
 * Inter Bold (`font-sans font-bold tracking-tight`), the project's
 * canonical section-heading idiom. Bebas Neue is never bolded; doing
 * so produces unreadable synthetic-bold smear.
 */
export function AboutPage() {
  const { config } = useAppContext();
  // Routed under the wide FundraiserLayout in AppRouter so sections can
  // span the viewport with their own backgrounds.

  useSeoMeta({
    title: `About | ${config.appName}`,
    description: `How ${config.appName} works: connecting activists to unstoppable funding through Bitcoin and Nostr.`,
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
                About {appName}
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
                How{' '}
                {/* Orange highlighter span: same negative-margin trick
                    as CampaignsPage so the inner letter aligns with the
                    column edge despite the box padding. */}
                <span className="inline-block w-fit pl-0 pr-3 pt-1 pb-0 -mt-1 -mb-3 bg-primary text-white leading-[0.8] align-baseline">
                  <span className="-ml-1 inline-block">{appName}</span>
                </span>
                {/* Line break only on sm+ — on mobile the whole
                    headline fits on one line. */}
                <br className="hidden sm:inline" />
                {' '}works.
              </h1>
              <p className="text-lg lg:text-xl text-gray-300 max-w-2xl leading-relaxed mb-8">
                {appName} is a censorship-resistant donation platform built on
                Nostr and Bitcoin. No frozen bank accounts. No corporate
                shut-downs. Just direct support from people who believe in your
                cause.
              </p>

              {/* Trust chips */}
              <ul className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
                {['Decentralized', 'Open source', 'Censorship resistant'].map(
                  (label) => (
                    <li key={label} className="flex items-center gap-2">
                      <CircleCheck className="size-4 text-primary" />
                      {label}
                    </li>
                  ),
                )}
              </ul>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/about/donors"
                  className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-6 text-base shadow-lg shadow-primary/25 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <HandHeart className="size-5" />
                  Read the Donor Guide
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/about/activists"
                  className="group inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white/5 text-white hover:bg-white/10 font-medium h-12 px-6 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <Megaphone className="size-5" />
                  Read the Activist Guide
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
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
                      alt="Venezuelan activists at a candlelight vigil holding a sign reading 'Liberen a todos los presos políticos · ¡Cese la represión!'"
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    {/* Country pill */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-xs font-medium flex items-center gap-1.5">
                      <span className="text-sm leading-none" aria-hidden>
                        🇻🇪
                      </span>
                      <span>Venezuela</span>
                    </div>
                    {/* Public pill */}
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-[11px] font-semibold flex items-center gap-1.5">
                      <Globe className="size-3" />
                      <span>Public</span>
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
                        Venezolanos Libres
                      </span>
                      <BadgeCheck className="size-3.5 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-white leading-snug mb-3">
                      Free Venezuela's Political Prisoners
                    </h3>
                    <p className="text-xs text-gray-400 leading-snug mb-4 line-clamp-2">
                      Legal defense and family support for 800+ political
                      prisoners detained by the Maduro regime.
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
                        <span className="text-gray-400 text-xs"> raised</span>
                      </div>
                      <span className="text-gray-500 text-xs">of $10,000</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-4">
                      247 donors · 12 countries
                    </p>
                    {/* Donate button */}
                    <Link
                      to="/"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm h-10 rounded-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <Bitcoin className="size-4" />
                      Donate Bitcoin
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. How it works, in three steps (light cream) ──────────────── */}
      <section
        id="how-it-works"
        className="relative bg-[#faf8f4] py-20 md:py-28 overflow-hidden"
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How it works"
            title="Three steps. No middleman."
            lede={`No banks, no borders, no permission.`}
          />

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <StepCard
              number="01"
              image="/help/step-1-account.jpg"
              imageAlt="A glowing orange cryptographic key floating in dark space, symbolizing self-sovereign identity"
              title="Activists sign up in seconds."
              body={`No bank. No paperwork. No approval. The moment an activist creates an account on ${appName}, they have a Bitcoin address ready to receive support, anywhere in the world.`}
            />
            <StepCard
              number="02"
              image="/help/step-2-send.jpg"
              imageAlt="A glowing Bitcoin coin flying through the air across a dark world map, symbolizing instant cross-border payment"
              title="Donors send Bitcoin directly."
              body={`Donors send Bitcoin from any wallet they already use (Cash App, Coinbase, Strike, a hardware wallet) straight to the activist. ${appName} never touches the money. No server in the middle, no custodian.`}
            />
            <StepCard
              number="03"
              image="/help/step-3-spend.jpg"
              imageAlt="An open hand with warm orange light radiating from the palm, symbolizing receiving and agency"
              title="Support lands where it matters."
              body="Funds arrive at the activist directly. They keep custody, they keep control. Move it, swap it, or spend it; the guides below explain how to do it privately and safely."
            />
          </div>
        </div>
      </section>

      {/* ── 3. Two ways to get paid (white) ─────────────────────────────── */}
      <section className="relative bg-white py-20 md:py-28 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Bitcoin · One QR, two options"
            title="Two ways to get paid."
            lede="Both options are Bitcoin. The difference is what you trade off for privacy. When an activist creates a campaign, they choose which options to accept. If both, the donation page shows a single QR code that works for any wallet."
          />

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto items-start">
            {/* Bitcoin Public Payments */}
            <RailCard
              accent="orange"
              kicker="Bitcoin Public Payments"
              tagline="Universal · Fast · Transparent"
              icon={<Bitcoin className="size-4" />}
              title="Works with every wallet on earth."
              description="Donations land at a regular Bitcoin address the activist controls. Anyone with any Bitcoin wallet can send. No new app, no new account, no learning curve."
              bullets={[
                'Works in every Bitcoin wallet: Cash App, Coinbase, Strike, hardware',
                'Fastest settlement: Bitcoin confirmations only',
                'Verifiable on-chain: anyone can see what an activist has received',
              ]}
              tradeoffEmphasized
              tradeoffTitle="Trade-off: Public on-chain."
              tradeoffIntro={
                <p>
                  Every donation is public on the Bitcoin blockchain and on
                  Nostr. {appName} is recommended only for above-ground
                  activism. If you or your donors require extreme privacy,
                  including from state actors, read the{' '}
                  <Link
                    to="/about/donors"
                    className="font-semibold text-primary hover:underline"
                  >
                    Donor Guide
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/about/activists"
                    className="font-semibold text-primary hover:underline"
                  >
                    Activist Guide
                  </Link>{' '}
                  before participating.
                </p>
              }
            />
            {/* Bitcoin Silent Payments */}
            <RailCard
              accent="indigo"
              kicker="Bitcoin Silent Payments"
              tagline="Unlinkable · Direct · BIP-352"
              icon={<ShieldOff className="size-4" />}
              title="Unlinkable, on-chain, direct."
              description="Donations are sent as BIP-352 silent payments. Each one lands at a fresh, unlinkable Bitcoin output that an observer staring at the blockchain can't tie back to the campaign."
              bullets={[
                "Donation trail can't be reconstructed on-chain",
                'Protects activists facing serious adversaries',
                "Lands directly in the activist's wallet, no server in the middle",
              ]}
              tradeoffTitle="Trade-off: Silent payments are early."
              tradeoffIntro={
                <p>
                  The most private way to receive Bitcoin on-chain, but the
                  ecosystem is young and rough today:
                </p>
              }
              tradeoffBullets={[
                <strong className="text-gray-800">Few wallets support it.</strong>,
                <strong className="text-gray-800">Receiving is slow.</strong>,
                <strong className="text-gray-800">No push notifications.</strong>,
                <strong className="text-gray-800">Wallets are still buggy.</strong>,
                <strong className="text-gray-800">
                  Donation counts aren't public.
                </strong>,
              ]}
            />
          </div>

          {/* No custody comparison block. The compare cards above show
              the two options; this block answers the obvious next
              question, "how is this actually different from existing
              crowdfunding sites?", by name-checking the failure modes
              of centralized and even other Bitcoin-based options. */}
          <div className="mt-10 max-w-5xl mx-auto rounded-2xl border border-primary/20 bg-gradient-to-br from-white to-primary/5 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start gap-5 mb-6">
              <div className="size-12 shrink-0 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                <ShieldCheck className="size-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-1.5">
                  No custody. No middleman.
                </h3>
                <p className="text-gray-600 leading-relaxed text-[15px]">
                  {appName} never holds funds. Donations move
                  wallet-to-wallet on Bitcoin. There's no server standing
                  between donor and activist on either option. If {appName}{' '}
                  disappeared tomorrow, every campaign would keep working.
                </p>
              </div>
            </div>

            {/* Comparison grid */}
            <ul className="grid sm:grid-cols-3 gap-5 sm:gap-6 pt-5 border-t border-primary/10">
              <ComparisonItem
                heading="Unlike GoFundMe"
                body="No platform can freeze your donations, demand refunds, or terminate your campaign over policy disagreements."
              />
              <ComparisonItem
                heading="Unlike GiveSendGo"
                body="No payment processor sits in the middle, so no Stripe, no Visa, no bank can cut you off mid-campaign."
              />
              <ComparisonItem
                heading="Unlike other &lsquo;Bitcoin&rsquo; platforms"
                body="No central Lightning node, custodian, or LSP to fail or go offline. Funds settle directly on-chain to a wallet you control."
              />
            </ul>
          </div>
        </div>
      </section>

      {/* ── 4. Need help? FAQ (cream, integrated as three chapters) ───── */}
      <section
        id="faq"
        className="bg-[#f5f1eb] py-20 md:py-28 scroll-mt-16"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Questions"
            title="Frequently asked."
          />

          {/* Three chapter mini-sections, rendered inline in page flow */}
          <div className="max-w-3xl mx-auto space-y-16">
            {FAQ_CHAPTERS.map((chapter) => (
              <FAQChapter
                key={chapter.id}
                number={chapter.number}
                title={chapter.label}
                description={chapter.description}
                categoryId={chapter.id}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Pick the side you're on (white) ──────────────────────────── */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Guides"
            title="Pick the side you're on."
            lede="Whether you're sending or receiving, learn how to do it safely and privately."
          />

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            <GuideCard
              to="/about/donors"
              image="/about/donor-guide-freedom-libertad.jpeg"
              imageAlt="Hooded protesters marching through a European city street at dusk, holding burning red flares and 'FREEDOM' and 'LIBERTAD' banners"
              role="For Donors"
              icon={<HandHeart className="size-5" />}
              accent="blue"
              title="Support causes the banks won't."
              description="Send Bitcoin directly to activists and movements anywhere in the world, without asking a payment processor for permission."
              bullets={[
                'Use any Bitcoin wallet you already have.',
                'Donations land directly with the activist. No custodian, no middleman.',
                'For privacy, use a wallet that supports silent payments.',
              ]}
              cta="Read the Donor Guide"
            />
            <GuideCard
              to="/about/activists"
              image="/about/activist-guide-unity.png"
              imageAlt="Aerial view of thousands of protesters gathered at night in a city square with burning red flares, beneath a 'UNITY IN DARKNESS' banner projected on the surrounding buildings"
              role="For Activists"
              icon={<Megaphone className="size-5" />}
              accent="orange"
              title="Get funded without permission."
              description="Receive support directly from people who believe in your cause. No bank account, no application form, no company in the middle."
              bullets={[
                'Start receiving donations as soon as you sign up.',
                'Pick which payment types to accept: public, silent payments, or both.',
                'For private cash-out, send to a silent-payments wallet first, then forward anywhere.',
              ]}
              cta="Read the Activist Guide"
            />
          </div>

          {/* Page-closing 'Still stuck?' line: quiet pointer to the
              Team Soapbox follow pack via the in-app /:nip19 route. */}
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Still stuck?{' '}
            <Link
              to={`/${teamSoapboxNaddr}`}
              className="font-medium text-primary hover:underline"
            >
              Follow Team Soapbox on Nostr
            </Link>
            . We triage questions there.
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
  label: string;
  description: string;
}> = [
  {
    id: 'getting-started',
    number: '01',
    label: 'Getting started',
    description: 'What Agora is, who built it, and what it costs.',
  },
  {
    id: 'payments',
    number: '02',
    label: 'Bitcoin donations',
    description: 'How payments work, why on-chain, why public, why these trade-offs.',
  },
  {
    id: 'about-nostr',
    number: '03',
    label: 'About Nostr',
    description: 'The open protocol Agora is built on, and how your account works.',
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
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 leading-snug">
            {title}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 mt-1 leading-relaxed">
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

interface ComparisonItemProps {
  heading: string;
  body: string;
  /** Defaults to light. On dark backgrounds, body copy switches to gray-300. */
  theme?: 'light' | 'dark';
}

/**
 * One cell in the "Unlike GoFundMe / GiveSendGo / Bitcoin" grid
 * inside the No-Custody banner. Small heading + short body, no
 * separating border (the parent grid gap is the separator).
 */
function ComparisonItem({ heading, body, theme = 'light' }: ComparisonItemProps) {
  return (
    <li>
      <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5">
        {heading}
      </p>
      <p
        className={cn(
          'text-sm leading-relaxed',
          theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
        )}
      >
        {body}
      </p>
    </li>
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
          theme === 'dark' ? 'text-white' : 'text-gray-900',
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'text-base sm:text-lg leading-relaxed',
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
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
    <div className="relative bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-md">
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
        <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-3 leading-snug">
          {title}
        </h3>
        <p className="text-gray-600 leading-relaxed text-[15px]">{body}</p>
      </div>
    </div>
  );
}

interface RailCardProps {
  accent: 'orange' | 'indigo';
  kicker: string;
  tagline: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  tradeoffTitle: string;
  tradeoffIntro: React.ReactNode;
  tradeoffBullets?: React.ReactNode[];
  /** When true, the trade-off block uses an amber alert-style title icon. */
  tradeoffEmphasized?: boolean;
}

function RailCard({
  accent,
  kicker,
  tagline,
  icon,
  title,
  description,
  bullets,
  tradeoffTitle,
  tradeoffIntro,
  tradeoffBullets,
  tradeoffEmphasized,
}: RailCardProps) {
  const headerGradient =
    accent === 'orange'
      ? 'from-primary to-primary/80'
      : 'from-indigo-600 to-indigo-700';
  const taglineColor =
    accent === 'orange' ? 'text-primary-foreground/85' : 'text-indigo-100';
  const checkColor =
    accent === 'orange' ? 'text-emerald-600' : 'text-indigo-600';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Gradient header strip */}
      <div className={cn('bg-gradient-to-r px-6 py-5 text-white', headerGradient)}>
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-widest">
            {kicker}
          </span>
        </div>
        <p className={cn('text-sm', taglineColor)}>{tagline}</p>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5 flex-1 flex flex-col">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 mb-2 leading-snug">
            {title}
          </h3>
          <p className="text-gray-600 leading-relaxed text-[15px]">
            {description}
          </p>
        </div>

        <ul className="space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CircleCheck className={cn('size-4 shrink-0 mt-0.5', checkColor)} />
              <span className="text-gray-700 text-sm leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        {/* Trade-off block */}
        <div className="mt-auto pt-5 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            {tradeoffEmphasized ? (
              <AlertTriangle className="size-4 text-amber-600" />
            ) : (
              <span aria-hidden className="size-2 rounded-full bg-amber-500" />
            )}
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700">
              {tradeoffTitle}
            </span>
          </div>
          <div className="text-sm text-gray-600 leading-relaxed space-y-2.5">
            {tradeoffIntro}
            {tradeoffBullets && tradeoffBullets.length > 0 && (
              <ul className="space-y-2 pt-1">
                {tradeoffBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
      className="group rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Image header */}
      <div className="aspect-[16/9] bg-gray-100 relative overflow-hidden">
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
        <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-2 leading-snug">
          {title}
        </h3>
        <p className="text-gray-600 mb-5 leading-relaxed">{description}</p>
        <ul className="space-y-2.5 mb-7">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CircleCheck className={cn('size-4 shrink-0 mt-0.5', accentText)} />
              <span className="text-gray-700 text-sm leading-snug">{b}</span>
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
