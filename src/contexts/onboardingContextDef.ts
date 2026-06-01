import { createContext, useContext } from 'react';

/**
 * The two top-level roles a new user can pick during onboarding. Drives
 * downstream copy (creator vs. donor framing) and the role-pick CTA target
 * (creator → /campaigns/new, donor → /campaigns).
 *
 * `null` before the user has answered the role-picker step.
 */
export type OnboardingRole = 'creator' | 'donor' | null;

export interface OnboardingProfileData {
  name: string;
  about: string;
  picture: string;
}

/** Options to pre-seed when invoking the captive flow from a specific CTA. */
export interface StartSignupOptions {
  /**
   * Pre-fill the role picker. CTAs that semantically already imply a role
   * (e.g. "Start a campaign") can skip the role step by passing this.
   */
  role?: 'creator' | 'donor';
  /**
   * When `true` and the user is already logged in, jump directly to the
   * profile step instead of the role picker. Used by surfaces like
   * `/campaigns/new` that want the user to set up a profile first.
   * After the profile step completes the flow navigates based on `role`.
   */
  skipToProfile?: boolean;
  /** Existing profile metadata used to prefill required campaign profile setup. */
  initialProfileData?: Partial<OnboardingProfileData>;
}

export interface OnboardingContextValue {
  /** Is the captive onboarding overlay currently active? */
  active: boolean;
  /** Selected role, or `null` if the picker hasn't run / been skipped. */
  role: OnboardingRole;
  /**
   * When `true`, the overlay was opened with `skipToProfile` so an
   * already-logged-in user sees the profile step first.
   */
  skipToProfile: boolean;
  /** Existing profile metadata passed in when the flow started. */
  initialProfileData: Partial<OnboardingProfileData>;
  /** Begin the captive signup flow. Optionally pre-seed the role. */
  startSignup: (options?: StartSignupOptions) => void;
  /** Cancel and dismiss the overlay. Called from the gate when the user
   *  finishes or explicitly bails out. */
  cancel: () => void;
  /** Update the selected role from inside the flow (role-picker step). */
  setRole: (role: 'creator' | 'donor') => void;
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
