import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface WizardStep {
  /** Centered heading at the top of the step. Concise — one short phrase. */
  title: string;
  /** Muted single-line subtitle beneath the heading. Optional. */
  subtitle?: string;
  /** The form fields for this step. */
  body: ReactNode;
}

export interface WizardProps {
  /**
   * Accessibility label for the wizard's dialog role. Should describe
   * what the user is creating — e.g. "Create a campaign", "Create a
   * group". Used as the `aria-label` on the outer `role="dialog"`.
   */
  headingAriaLabel: string;
  /** 1-indexed list of steps. Length determines the total. */
  steps: WizardStep[];
  /**
   * Optional lead content rendered above the first step's body. The
   * campaign wizard uses this for the "publishing under <org>" chip so
   * the publishing-context is the very first thing the user sees on
   * step 1. Hidden on every other step.
   */
  step1Lead?: ReactNode;
  /** Error alert rendered beneath each step's body. Pass null when no error. */
  errorAlert?: ReactNode;
  /**
   * Content rendered inside the terminal step's submit button — typically
   * "Launch campaign" / "Create group" with a leading icon, and a spinner +
   * "Publishing…" copy while submitting.
   */
  submitButtonContent: ReactNode;
  /** True while the parent mutation is in flight; disables all forward actions. */
  submitting: boolean;
  /**
   * Predicate gating forward progress from a given (1-indexed) step.
   * Return `false` to disable Next on that step. Steps not gated by
   * this fn are always allowed to advance.
   */
  canAdvanceFromStep: (step: number) => boolean;
  /**
   * 1-indexed step from which the "Skip Next & Launch" shortcut may
   * appear. The shortcut is *only* rendered when `launchNowLabel` is
   * also provided — pass `Infinity` (or omit `launchNowLabel`) to
   * disable the shortcut entirely. Earlier steps render only the Next
   * button.
   */
  launchAvailableFromStep?: number;
  /**
   * Label for the optional ghost shortcut that submits the form
   * mid-wizard without finishing the remaining (optional) steps. Pass
   * `undefined` to hide the shortcut.
   */
  launchNowLabel?: string;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

/**
 * Multi-step layout used by Agora's creation flows (campaigns,
 * groups, …).
 *
 * Rendered as a **fullscreen captive overlay** (`fixed inset-0 z-50`)
 * so it sits above the persistent TopNav — the same treatment Chad's
 * onboarding flow uses for signup. From the user's perspective each
 * creation flow is a focused, distraction-free task, not "another
 * page in the app."
 *
 * Visually: a sticky single-bar progress fill across the top, a
 * top-right X to escape, a top-left back arrow from step 2 onward, a
 * centered narrow column for each step, and a big rounded-full
 * primary CTA at the bottom.
 *
 * Earlier required steps are gated by {@link WizardProps.canAdvanceFromStep};
 * an optional "Skip Next & Launch" ghost shortcut appears from
 * {@link WizardProps.launchAvailableFromStep} onward when a
 * {@link WizardProps.launchNowLabel} is provided. The last step is
 * terminal — its only forward action is the primary submit button.
 *
 * The `<form>` lives inside this wrapper (not the parent) so the
 * submit button — wherever it ends up in the wizard — submits the
 * same form and reuses the parent's `onSubmit`.
 */
export function Wizard({
  headingAriaLabel,
  steps,
  step1Lead,
  errorAlert,
  submitButtonContent,
  submitting,
  canAdvanceFromStep,
  launchAvailableFromStep = Infinity,
  launchNowLabel,
  onSubmit,
  onClose,
}: WizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const totalSteps = steps.length;
  const current = steps[step - 1];
  const isTerminal = step === totalSteps;
  const progress = (step / totalSteps) * 100;

  const launchVisible = !!launchNowLabel && step >= launchAvailableFromStep;
  const canAdvance = canAdvanceFromStep(step);
  // The terminal step's own submit honors only `submitting` — its
  // required fields have already been cleared by the gates on
  // previous steps. The mid-wizard shortcut, on the other hand,
  // sits *on* a potentially-gated step, so it must respect the
  // same `canAdvance` check the Next button does — otherwise a
  // user could click "Skip Next & Launch" with a still-empty
  // required field and trip a server-side validation error.
  const canSubmit = isTerminal
    ? !submitting
    : launchVisible && canAdvance && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={headingAriaLabel}
    >
      {/* Sticky single-bar progress indicator, mirroring the captive
          onboarding flow. */}
      <div className="sticky top-0 z-10 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top-right close. Lets users escape if they truly don't want to
          continue — deliberately unobtrusive so casual taps don't drop
          them out of the flow. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.goBack')}
        className="absolute right-4 top-4 sm:right-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Top-left back. Mirrors the close button so the user can step
          back through the wizard without scrolling to the footer. Only
          rendered from step 2 onward — step 1's escape route is the X. */}
      {step > 1 && (
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(s - 1, 1))}
          disabled={submitting}
          aria-label={t('common.back')}
          className="absolute left-4 top-4 sm:left-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}

      <form
        className="flex-1 flex items-start sm:items-center justify-center px-6 pt-16 pb-12"
        onSubmit={onSubmit}
        // Hitting Enter inside an <input> normally triggers the
        // form's default submit — and on a non-terminal wizard step
        // that would silently publish the entity. Intercept Enter on
        // non-terminal steps and treat it as "advance" instead, so
        // keyboard users get the same flow as clicking Next.
        //
        // Textarea Enter is left alone — that's a legitimate newline
        // character inside the field.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (isTerminal) return;
          const target = e.target as HTMLElement;
          if (target.tagName === 'TEXTAREA') return;
          // IME composition still in progress — don't hijack.
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (submitting || !canAdvance) return;
          setStep((s) => Math.min(s + 1, totalSteps));
        }}
      >
        <div
          key={step}
          className="w-full max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          {/* Centered title block — captive-onboarding cadence: large
              heading + muted subtitle, no progress eyebrow (the
              top-of-page bar carries that signal). */}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold tracking-tight">{current.title}</h2>
            {current.subtitle && (
              <p className="text-sm text-muted-foreground">{current.subtitle}</p>
            )}
          </div>

          {/* Step body. Step 1's optional lead (e.g. the campaign
              wizard's org chip) rides along here so the
              "publishing-as" context is the first thing the user
              sees. No card chrome — onboarding keeps the content
              area visually quiet so the focus stays on the fields. */}
          <div className="space-y-3">
            {step === 1 && step1Lead}
            {current.body}
          </div>

          {errorAlert}

          {/* Footer.
              - Non-terminal steps: primary "Next" advances the wizard.
                When `launchNowLabel` is provided and the user has
                cleared `launchAvailableFromStep`, a ghost shortcut sits
                beneath Next so the remaining steps are opt-in.
              - Terminal step: the primary submit button is the only
                forward action.
              - Back navigation lives in the top-left header chrome,
                not here. */}
          <div className="space-y-3 pt-1">
            {isTerminal ? (
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full h-12 text-base rounded-full"
              >
                {submitButtonContent}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => setStep((s) => Math.min(s + 1, totalSteps))}
                  disabled={submitting || !canAdvance}
                  className="w-full h-12 text-base rounded-full"
                >
                  {t('common.next')}
                </Button>
                {launchVisible && (
                  <Button
                    type="submit"
                    variant="ghost"
                    disabled={!canSubmit}
                    className="w-full"
                  >
                    {submitting ? submitButtonContent : launchNowLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
