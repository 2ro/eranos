import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  MoreHorizontal,
  MousePointer2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * An animated, interactive tutorial shown on /verify once an
 * organization has published its verifier statement. It demonstrates the
 * exact gesture a verifier uses to vouch for a campaign: tapping the
 * three-dots (kebab) button on a campaign card and choosing
 * "Verify this campaign".
 *
 * The component renders a faithful mock campaign card and drives a small
 * three-step state machine that mimics a cursor opening the kebab menu and
 * clicking the verify item. It auto-advances on a timer and loops forever so
 * users learn the gesture purely by watching. The cursor is gated behind a
 * `prefers-reduced-motion` check; the UI state replay itself is a simple
 * visibility sequence so the instruction still works without cursor motion.
 */

type Phase = 'idle' | 'menuOpen' | 'verified';

const NEXT_PHASE: Record<Phase, Phase> = {
  idle: 'menuOpen',
  menuOpen: 'verified',
  verified: 'idle',
};

const PHASE_DELAY: Record<Phase, number> = {
  idle: 2000,
  menuOpen: 2000,
  verified: 1200,
};

function usePrefersReducedMotion(): boolean {
  const ref = useRef(false);
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    ref.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return ref.current;
}

interface VerifyTutorialProps {
  className?: string;
  /** Hide the component's internal eyebrow/title/lede header (when the host
   *  already provides one). */
  hideHeader?: boolean;
  /** Drop the bordered card chrome so it blends into the surrounding page. */
  bare?: boolean;
  /** Let the demo span the full available width in stacked onboarding flows. */
  stacked?: boolean;
  /**
   * When provided, the demo card's verified badge shows this organization's
   * avatar + name (the preview a verifier just configured) instead of the
   * generic "Verified by you" label — so the onboarding flow previews how the
   * org's own badge will surface on a campaign.
   */
  verifierName?: string;
  verifierPicture?: string;
  /** Fired after the first full replay cycle completes and resets. */
  onLoopComplete?: () => void;
}

export function VerifyTutorial({
  className,
  hideHeader = false,
  bare = false,
  stacked = false,
  verifierName,
  verifierPicture,
  onLoopComplete,
}: VerifyTutorialProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>('idle');

  // Simple visibility loop: start with the card, reveal the menu after 2s,
  // reveal the badge after another 2s, then pause briefly and reset.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (phase === 'verified') {
        onLoopComplete?.();
      }
      setPhase((prev) => NEXT_PHASE[prev]);
    }, PHASE_DELAY[phase]);
    return () => window.clearTimeout(id);
  }, [phase, onLoopComplete]);

  const menuVisible = phase === 'menuOpen';
  const verified = phase === 'verified';

  return (
    <section
      className={cn(
        !bare &&
          'rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background p-6 sm:p-8 shadow-sm',
        className,
      )}
      aria-labelledby="verify-tutorial-title"
    >
      {/* Header */}
      {!hideHeader && (
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="max-w-md">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase text-primary mb-2">
              <BadgeCheck className="size-4" />
              {t('organizations.tutorial.eyebrow')}
            </p>
            <h3
              id="verify-tutorial-title"
              className="text-xl sm:text-2xl font-bold tracking-tight mb-2"
            >
              {t('organizations.tutorial.title')}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('organizations.tutorial.lede')}
            </p>
          </div>
        </div>
      )}

      <DemoStage
        phase={phase}
        menuVisible={menuVisible}
        verified={verified}
        reducedMotion={reducedMotion}
        fullWidth={stacked}
        verifierName={verifierName}
        verifierPicture={verifierPicture}
      />
    </section>
  );
}

// ── The animated mock card ───────────────────────────────────────────────

/**
 * A real published campaign (kind 33863) used as the demo subject so the
 * tutorial mirrors an actual card rather than invented placeholder copy.
 * Static by design — the tutorial is purely illustrative, so we read the
 * fields directly instead of fetching the event.
 */
const DEMO_CAMPAIGN = {
  title: 'Eranos App Development Fund',
  organizer: 'Team Soapbox',
  organizerPicture:
    'https://blossom.primal.net/e93f617f8331509acdddde3df0c1cd23cda1803d92c70815fc96e2d5f8d48ac8.png',
  story: 'Help fund the development of Eranos!',
  banner:
    'https://blossom.primal.net/aade02e86584a7ab269550992d0266bae31059a34e6e08fddba1f6f5acb6e7d6.jpg',
  goalLabel: '$1,000',
  raisedLabel: '$670',
  pct: 67,
} as const;

interface DemoStageProps {
  phase: Phase;
  menuVisible: boolean;
  verified: boolean;
  reducedMotion: boolean;
  /** Span the full container width instead of the narrow `max-w-sm` card. */
  fullWidth?: boolean;
  /** Optional verifier identity to preview in the badge (see VerifyTutorial). */
  verifierName?: string;
  verifierPicture?: string;
}

function DemoStage({
  phase,
  menuVisible,
  verified,
  reducedMotion,
  fullWidth = false,
  verifierName,
  verifierPicture,
}: DemoStageProps) {
  const { t } = useTranslation();

  // The badge replicates the live overlay `CampaignVerificationBadge`
  // (dark translucent pill, single ring-bordered avatar, sky check) so the
  // preview matches exactly how a verification surfaces on a real card.
  const badgePicture = sanitizeUrl(verifierPicture);
  const verifierInitials =
    (verifierName?.trim() || '')
      .slice(0, 2)
      .toUpperCase() || '?';

  const bannerUrl = sanitizeUrl(DEMO_CAMPAIGN.banner);
  const organizerPicture = sanitizeUrl(DEMO_CAMPAIGN.organizerPicture);

  return (
    <div
      className={cn(
        'relative w-full select-none',
        fullWidth ? 'mx-0' : 'mx-auto max-w-md',
      )}
      aria-hidden="true"
    >
      {/* Mock campaign card — mirrors CampaignCard's structure. */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md">
        {/* Banner */}
        <div
          className="relative h-40 bg-gradient-to-br from-sky-500/80 via-cyan-500/70 to-emerald-500/80 bg-cover bg-center"
          style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}
        >
          {/* Top scrim for badge legibility — as on the real card. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
          />

          {/* Verified badge (top-left) — appears in the final phase. A faithful
              copy of the live overlay CampaignVerificationBadge for a single
              verifier: the org's avatar + sky check, no count text. */}
          <div
            className={cn(
              'absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-1 text-white backdrop-blur-md transition-all duration-500',
              verified
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none',
            )}
          >
            <span className="flex items-center -space-x-2">
              <Avatar className="size-6 ring-2 ring-background">
                {badgePicture && <AvatarImage src={badgePicture} alt="" className="object-cover" />}
                <AvatarFallback className="bg-secondary text-[9px] text-secondary-foreground">
                  {verifierInitials}
                </AvatarFallback>
              </Avatar>
            </span>
            <span className="ml-0.5 inline-flex items-center gap-1 pr-1 text-xs font-semibold">
              <BadgeCheck className="size-4 text-sky-300" />
            </span>
          </div>

          {/* Three-dots button (top-right) */}
          <div className="absolute right-3 top-3">
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur transition-all duration-300',
                phase === 'idle' &&
                  !reducedMotion &&
                  'motion-safe:animate-pulse ring-2 ring-primary/60',
                menuVisible && 'bg-background text-foreground ring-2 ring-primary/50',
              )}
            >
              <MoreHorizontal className="size-4" />
            </div>

            {/* Dropdown menu */}
            <div
              className={cn(
                'absolute right-0 top-10 z-20 w-52 origin-top-right rounded-md border bg-popover p-1 text-popover-foreground shadow-lg transition-all duration-200',
                menuVisible
                  ? 'scale-100 opacity-100'
                  : 'pointer-events-none scale-95 opacity-0',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium transition-colors',
                  menuVisible
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground',
                )}
              >
                <BadgeCheck className="size-4 shrink-0" />
                {t('organizations.tutorial.demo.menuVerify')}
              </div>
            </div>
          </div>
        </div>

        {/* Card body */}
        <div className="space-y-3 p-4">
          <div>
            <p className="font-semibold leading-snug truncate">
              {DEMO_CAMPAIGN.title}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {DEMO_CAMPAIGN.story}
            </p>
          </div>
          {/* Progress — mirrors CampaignProgress (bar + raised / goal). */}
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/15">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${DEMO_CAMPAIGN.pct}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{DEMO_CAMPAIGN.raisedLabel}</span>
              <span className="text-muted-foreground">{t('campaignsDetail.ofGoal', { amount: DEMO_CAMPAIGN.goalLabel })}</span>
            </div>
          </div>

          {/* Organizer footer — mirrors CampaignCard's AuthorByline row. */}
          <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <Avatar className="size-5">
              {organizerPicture && <AvatarImage src={organizerPicture} alt="" className="object-cover" />}
              <AvatarFallback className="bg-secondary text-[9px] text-secondary-foreground">
                {DEMO_CAMPAIGN.organizer.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium text-foreground/80">
              {DEMO_CAMPAIGN.organizer}
            </span>
          </div>
        </div>
      </div>

      {/* Animated cursor — hidden under reduced motion */}
      {!reducedMotion && (
        <div
          className={cn(
            'pointer-events-none absolute z-30 transition-all duration-700 ease-out',
            // idle → hover the kebab (top-right); menuOpen/verified → hover the verify item
            phase === 'idle'
              ? 'right-4 top-5'
              : 'right-8 top-[4.5rem]',
          )}
        >
          <MousePointer2
            key={phase}
            className={cn(
              'size-6 fill-foreground text-background drop-shadow-md transition-transform',
              'motion-safe:animate-tutorial-tap',
            )}
          />
        </div>
      )}
    </div>
  );
}

export default VerifyTutorial;
