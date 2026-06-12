import { useSeoMeta } from '@unhead/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CircleCheck,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import { MilkdownEditor } from '@/components/markdown/MilkdownEditor';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  useSetVerifierStatement,
  useVerifierStatement,
} from '@/hooks/useVerifierStatement';

/**
 * The /organizations page. A landing-style document modeled on the
 * /about page that doubles as a functional onboarding tool. Sections:
 *
 *   1. Hero (dark) — pitch + CTA that scrolls to the form
 *   2. How it works, in three steps (cream)
 *   3. Get started (cream) — the functional verifier-statement editor.
 *      Logged out: prompt to log in with / create the org's Nostr profile.
 *      Logged in: the full publish / update / withdraw editor.
 *
 * Typography follows the AboutPage recipe: Bebas Neue (`font-display`)
 * is reserved for the hero H1 and step numerals; every other heading
 * uses Inter Bold (`font-sans font-bold tracking-tight`).
 */
export function OrganizationsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const appName = config.appName;

  useSeoMeta({
    title: `${t('organizations.seoTitle')} | ${appName}`,
    description: t('organizations.seoDescription', { appName }),
  });

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
              {t('organizations.hero.eyebrow')}
            </p>
            <h1
              className="font-display italic font-normal tracking-wide leading-none uppercase text-white text-4xl sm:text-7xl lg:text-8xl mb-8"
              style={{ WebkitTextStroke: '0.022em currentColor' }}
            >
              {t('organizations.hero.headlinePart1')}{' '}
              <span className="inline-block w-fit pl-0 pr-3 pt-1 pb-0 -mt-1 -mb-3 bg-primary text-white leading-[0.8] align-baseline">
                <span className="-ml-1 inline-block">
                  {t('organizations.hero.headlineHighlight')}
                </span>
              </span>
            </h1>
            <p className="text-lg lg:text-xl text-gray-300 max-w-2xl leading-relaxed mb-8">
              {t('organizations.hero.body', { appName })}
            </p>

            <ul className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
              {[
                t('organizations.hero.trustChips.noPermission'),
                t('organizations.hero.trustChips.ownIdentity'),
                t('organizations.hero.trustChips.public'),
              ].map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <CircleCheck className="size-4 text-primary" />
                  {label}
                </li>
              ))}
            </ul>

            <a
              href="#get-started"
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-6 text-base shadow-lg shadow-primary/25 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <BadgeCheck className="size-5" />
              {t('organizations.hero.cta')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </a>
          </div>
        </div>
      </section>

      {/* ── 2. How it works, in three steps (cream / navy) ──────────────── */}
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
            eyebrow={t('organizations.steps.eyebrow')}
            title={t('organizations.steps.title')}
            lede={t('organizations.steps.lede', { appName })}
          />

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <StepCard
              number="01"
              icon={<Building2 className="size-6" />}
              title={t('organizations.steps.step1.title')}
              body={t('organizations.steps.step1.body', { appName })}
            />
            <StepCard
              number="02"
              icon={<ShieldCheck className="size-6" />}
              title={t('organizations.steps.step2.title')}
              body={t('organizations.steps.step2.body')}
            />
            <StepCard
              number="03"
              icon={<BadgeCheck className="size-6" />}
              title={t('organizations.steps.step3.title')}
              body={t('organizations.steps.step3.body')}
            />
          </div>
        </div>
      </section>

      {/* ── 3. Get started — the functional editor ──────────────────────── */}
      <section
        id="get-started"
        className="bg-[#f5f1eb] dark:bg-[#0a0c14] py-20 md:py-28 scroll-mt-16"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('organizations.getStarted.eyebrow')}
            title={t('organizations.getStarted.title')}
            lede={t('organizations.getStarted.lede')}
          />
          <div className="max-w-2xl mx-auto">
            <VerifierEditor />
          </div>
        </div>
      </section>
    </main>
  );
}

// ── The functional verifier-statement editor ──────────────────────────────

/**
 * The interactive part of the page. Logged out, it prompts the visitor to
 * sign in with — or create — their organization's Nostr profile. Logged in,
 * it presents the full publish / update / withdraw editor (kind 14672), with
 * a live Markdown preview.
 */
function VerifierEditor() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const { statement, isLoading } = useVerifierStatement(user?.pubkey);
  const { mutateAsync: setStatement, isPending } = useSetVerifierStatement();

  const [value, setValue] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && !isLoading) {
      setValue(statement ?? '');
      setHydrated(true);
    }
  }, [hydrated, isLoading, statement]);

  // Logged out: instruct the visitor to log in with — or create — their
  // organization's Nostr profile before they can publish a statement.
  if (!user) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardContent className="py-12 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Building2 className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h3 className="text-xl font-bold tracking-tight">
              {t('organizations.loginGateTitle')}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t('organizations.loginGateBody')}
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </CardContent>
      </Card>
    );
  }

  const trimmed = value.trim();
  const isPublished = !!statement;
  const unchanged = trimmed === (statement ?? '');

  const handlePublish = async () => {
    try {
      await setStatement(trimmed);
      toast({
        title: trimmed
          ? t('verifier.publishedToast')
          : t('verifier.withdrawnToast'),
      });
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleWithdraw = async () => {
    try {
      await setStatement('');
      setValue('');
      toast({ title: t('verifier.withdrawnToast') });
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Prompt */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {t('verifier.promptLabel')}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('verifier.prompt')}
          </p>
        </div>

        {isLoading && !hydrated ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('verifier.loading')}
          </div>
        ) : (
          <>
            {/* WYSIWYG markdown editor: formatting toolbar + rich-text
                editing surface, value flows back out as markdown. */}
            <div className="rounded-lg border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
              <MilkdownEditor
                value={value}
                onChange={setValue}
                placeholder={t('verifier.placeholder')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handlePublish}
                disabled={isPending || !trimmed || unchanged}
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                {isPublished ? t('verifier.update') : t('verifier.publish')}
              </Button>

              {isPublished && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleWithdraw}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {t('verifier.withdraw')}
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('verifier.disclaimer')}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Building blocks (mirror AboutPage's design language) ───────────────────

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
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-gray-900 dark:text-white">
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

interface StepCardProps {
  number: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}

function StepCard({ number, icon, title, body }: StepCardProps) {
  return (
    <div className="relative bg-white dark:bg-[#1c2230] rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-md dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] p-6 sm:p-7">
      <div className="flex items-center justify-between mb-5">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        {/* Step numeral: Bebas Neue as designed signage, font-normal. */}
        <span
          aria-hidden
          className="font-display font-normal text-5xl leading-none text-gray-200 dark:text-white/15 tabular-nums"
        >
          {number}
        </span>
      </div>
      <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3 leading-snug">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[15px]">
        {body}
      </p>
    </div>
  );
}

export default OrganizationsPage;
