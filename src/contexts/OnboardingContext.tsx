import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * The two top-level roles a new user can pick during onboarding. Drives
 * downstream copy (creator gets stronger nsec-wallet warnings; donor sees
 * lighter copy) and the outro CTA target (creator → /campaigns/new, donor → /).
 *
 * `null` before the user has answered the role-picker step.
 */
export type OnboardingRole = 'creator' | 'donor' | null;

/** Options to pre-seed when invoking the captive flow from a specific CTA. */
export interface StartSignupOptions {
  /**
   * Pre-fill the role picker. CTAs that semantically already imply a role
   * (e.g. "Start a campaign" in the home hero) can skip the role step by
   * passing this. Without a role the flow asks on the second step.
   */
  role?: 'creator' | 'donor';
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
  setRole: (role: 'creator' | 'donor') => void;
}

export const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

/**
 * Provides captive-onboarding state to the whole tree.
 *
 * Designed for Ditto-style "fullscreen overlay wraps the router" usage: any
 * CTA in the app calls `useOnboarding().startSignup()` and a sibling
 * `<OnboardingGate>` renders the overlay on top of `<AppRouter />`.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [role, setRoleState] = useState<OnboardingRole>(null);

  const startSignup = useCallback((options?: StartSignupOptions) => {
    setRoleState(options?.role ?? null);
    setActive(true);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    // Don't reset role here — let the consumer keep it through the close
    // animation. We re-seed on the next startSignup().
  }, []);

  const setRole = useCallback((next: 'creator' | 'donor') => {
    setRoleState(next);
  }, []);

  return (
    <OnboardingContext.Provider value={{ active, role, startSignup, cancel, setRole }}>
      {children}
    </OnboardingContext.Provider>
  );
}

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
