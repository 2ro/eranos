import { createContext, useContext } from 'react';

/**
 * The top-level roles a new user can pick during onboarding. Drives
 * downstream copy (creator vs. donor vs. verifier framing) and the
 * role-pick behavior:
 *   - `creator` → navigate to /campaigns/new
 *   - `donor`   → navigate to /campaigns
 *   - `verifier`→ stay captive and branch into the verifier sub-flow
 *     (org identity → org bio → publish statement → how-to-verify)
 *
 * `null` before the user has answered the role-picker step.
 */
export type OnboardingRole = 'creator' | 'donor' | 'verifier' | null;

/** Options to pre-seed when invoking the captive flow from a specific CTA. */
export interface StartSignupOptions {
  /**
   * Pre-fill the role picker. CTAs that semantically already imply a role
   * (e.g. "Start a campaign") can skip the role step by passing this.
   */
  role?: 'creator' | 'donor' | 'verifier';
}

export interface OnboardingContextValue {
  /** Is the captive onboarding overlay currently active? */
  active: boolean;
  /** Selected role, or `null` if the picker hasn't run / been skipped. */
  role: OnboardingRole;
  /** Begin the captive signup flow. Optionally pre-seed the role. */
  startSignup: (options?: StartSignupOptions) => void;
  /** Cancel and dismiss the overlay. Called from the gate when the user
   *  finishes or explicitly bails out. */
  cancel: () => void;
  /** Update the selected role from inside the flow (role-picker step). */
  setRole: (role: 'creator' | 'donor' | 'verifier') => void;
}

export const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

/**
 * Access the captive onboarding controller. Used by both consumers (CTAs
 * that trigger signup) and the gate itself.
 *
 * Throws if used outside `<OnboardingProvider>` so misuse fails loudly.
 */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
