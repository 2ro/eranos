import { useEffect, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  MoreHorizontal,
  MousePointer2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * An animated, interactive tutorial shown on /organizations once an
 * organization has published its verifier statement. It demonstrates the
 * exact gesture a verifier uses to vouch for a campaign: tapping the
 * three-dots (kebab) button on a campaign card and choosing
 * "Verify this campaign".
 *
 * The component renders a faithful mock campaign card and drives a small
 * three-step state machine that mimics a cursor opening the kebab menu and
 * clicking the verify item. It auto-advances on a timer, loops, and exposes
 * clickable step dots so users can scrub. Motion is fully gated behind
 * `motion-safe:` / a `prefers-reduced-motion` check — with reduced motion the
 * cursor and looping are disabled and the final state is shown statically.
 */

type Phase = 'idle' | 'menuOpen' | 'verified';

const PHASE_ORDER: Phase[] = ['idle', 'menuOpen', 'verified'];

// How long each phase is held before auto-advancing (ms).
const PHASE_DURATION: Record<Phase, number> = {
  idle: 2200,
  menuOpen: 2600,
  verified: 3000,
};

interface State {
  phase: Phase;
  /** Bumps on every manual interaction to pause autoplay briefly. */
  paused: boolean;
}

type Action =
  | { type: 'advance' }
  | { type: 'goto'; phase: Phase };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'advance': {
      const idx = PHASE_ORDER.indexOf(state.phase);
      const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
      return { phase: next, paused: false };
    }
    case 'goto':
      return { phase: action.phase, paused: true };
    default:
      return state;
  }
}

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
  /** Stack the demo full-width above the step list instead of the
   *  side-by-side two-column layout. */
  stacked?: boolean;
  /**
   * When provided, the demo card's verified badge shows this organization's
   * avatar + name (the preview a verifier just configured) instead of the
   * generic "Verified by you" label — so the onboarding flow previews how the
   * org's own badge will surface on a campaign.
   */
  verifierName?: string;
  verifierPicture?: string;
}

export function VerifyTutorial({
  className,
  hideHeader = false,
  bare = false,
  stacked = false,
  verifierName,
  verifierPicture,
}: VerifyTutorialProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const [state, dispatch] = useReducer(reducer, {
    phase: (reducedMotion ? 'verified' : 'idle') as Phase,
    paused: false,
  });

  // Autoplay timer. Disabled under reduced motion, or while paused after a
  // manual interaction (resumes on the next phase change).
  useEffect(() => {
    if (reducedMotion || state.paused) return;
    const id = window.setTimeout(
      () => dispatch({ type: 'advance' }),
      PHASE_DURATION[state.phase],
    );
    return () => window.clearTimeout(id);
  }, [state.phase, state.paused, reducedMotion]);

  // When a user scrubs (paused), resume autoplay after a grace period.
  useEffect(() => {
    if (!state.paused || reducedMotion) return;
    const id = window.setTimeout(
      () => dispatch({ type: 'advance' }),
      PHASE_DURATION[state.phase] + 1500,
    );
    return () => window.clearTimeout(id);
  }, [state.paused, state.phase, reducedMotion]);

  const phaseIndex = PHASE_ORDER.indexOf(state.phase);
  const menuVisible = state.phase === 'menuOpen' || state.phase === 'verified';
  const verified = state.phase === 'verified';

  const stepCopy = [
    {
      title: t('organizations.tutorial.steps.open.title'),
      body: t('organizations.tutorial.steps.open.body'),
    },
    {
      title: t('organizations.tutorial.steps.verify.title'),
      body: t('organizations.tutorial.steps.verify.body'),
    },
    {
      title: t('organizations.tutorial.steps.confirm.title'),
      body: t('organizations.tutorial.steps.confirm.body'),
    },
  ];

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

      <div
        className={cn(
          stacked
            ? 'space-y-6'
            : 'grid gap-8 lg:grid-cols-2 lg:items-center',
        )}
      >
        {/* ── Animated mock campaign card ──────────────────────────────── */}
        <DemoStage
          phaseIndex={phaseIndex}
          menuVisible={menuVisible}
          verified={verified}
          reducedMotion={reducedMotion}
          fullWidth={stacked}
          verifierName={verifierName}
          verifierPicture={verifierPicture}
        />

        {/* ── Step list, synced to the animation ──────────────────────── */}
        <ol className="space-y-3">
          {stepCopy.map((step, i) => {
            const active = i === phaseIndex;
            const done = i < phaseIndex;
            return (
              <li key={step.title}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'goto', phase: PHASE_ORDER[i] })}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'group flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    active
                      ? 'border-primary/40 bg-primary/5 shadow-sm'
                      : 'border-border/60 bg-background hover:border-primary/30 hover:bg-muted/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
                      done
                        ? 'bg-primary text-primary-foreground'
                        : active
                          ? 'bg-primary/15 text-primary ring-2 ring-primary/40'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <BadgeCheck className="size-4" /> : i + 1}
                  </span>
                  <span className="space-y-1">
                    <span
                      className={cn(
                        'block text-sm font-semibold leading-snug',
                        active ? 'text-foreground' : 'text-foreground/90',
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="block text-sm text-muted-foreground leading-relaxed">
                      {step.body}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ── The animated mock card ───────────────────────────────────────────────

interface DemoStageProps {
  phaseIndex: number;
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
  phaseIndex,
  menuVisible,
  verified,
  reducedMotion,
  fullWidth = false,
  verifierName,
  verifierPicture,
}: DemoStageProps) {
  const { t } = useTranslation();

  // When a verifier identity is supplied, the badge mirrors the live
  // verification badge (org avatar + name); otherwise it falls back to the
  // generic "Verified by you" label.
  const hasVerifier = !!verifierName?.trim();
  const verifierInitial = verifierName?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div
      className={cn(
        'relative w-full select-none',
        fullWidth ? 'mx-0' : 'mx-auto max-w-sm',
      )}
      aria-hidden="true"
    >
      {/* Mock campaign card */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md">
        {/* Banner */}
        <div className="relative h-40 bg-gradient-to-br from-sky-500/80 via-cyan-500/70 to-emerald-500/80">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 mix-blend-overlay"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 45%)',
            }}
          />

          {/* Verified badge (top-left) — appears in the final phase. When a
              verifier identity is supplied it previews that org's avatar +
              name; otherwise a generic "Verified by you" label. */}
          <div
            className={cn(
              'absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-all duration-500',
              hasVerifier ? 'py-1 pl-1.5 pr-2.5' : 'px-2.5 py-1',
              verified
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none',
            )}
          >
            {hasVerifier ? (
              <>
                <Avatar className="size-5 shrink-0 ring-2 ring-background">
                  <AvatarImage
                    src={verifierPicture || undefined}
                    alt={verifierName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-secondary text-[9px] font-semibold text-secondary-foreground">
                    {verifierInitial}
                  </AvatarFallback>
                </Avatar>
                <BadgeCheck className="size-4 text-primary" />
                <span className="max-w-[10rem] truncate">{verifierName}</span>
              </>
            ) : (
              <>
                <BadgeCheck className="size-4 text-primary" />
                {t('organizations.tutorial.demo.verifiedBadge')}
              </>
            )}
          </div>

          {/* Three-dots button (top-right) */}
          <div className="absolute right-3 top-3">
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur transition-all duration-300',
                phaseIndex === 0 &&
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
                  phaseIndex >= 1
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
            <p className="font-semibold leading-snug">
              {t('organizations.tutorial.demo.campaignTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('organizations.tutorial.demo.campaignOrganizer')}
            </p>
          </div>
          {/* Fake progress bar */}
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.45 BTC</span>
              <span>67%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Animated cursor — hidden under reduced motion */}
      {!reducedMotion && (
        <div
          className={cn(
            'pointer-events-none absolute z-30 transition-all duration-700 ease-out',
            // idle → hover the kebab (top-right); menuOpen/verified → hover the verify item
            phaseIndex === 0
              ? 'right-4 top-5'
              : 'right-8 top-[4.5rem]',
          )}
        >
          <MousePointer2
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
