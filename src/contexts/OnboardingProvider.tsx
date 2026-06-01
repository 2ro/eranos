import { useCallback, useState, type ReactNode } from 'react';

import {
  OnboardingContext,
  type OnboardingProfileData,
  type OnboardingRole,
  type StartSignupOptions,
} from './onboardingContextDef';

/**
 * Provides captive-onboarding state to the whole tree.
 *
 * Designed for Ditto-style "fullscreen overlay wraps the router" usage: any
 * CTA in the app calls `useOnboarding().startSignup()` and a sibling
 * `<OnboardingGate>` renders the overlay on top of `<AppRouter />`.
 *
 * The provider component lives in a separate file from `OnboardingContext` /
 * `useOnboarding` so the file containing the component has *only* component
 * exports — required for React Fast Refresh to work cleanly on this file.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [role, setRoleState] = useState<OnboardingRole>(null);
  const [skipToProfile, setSkipToProfile] = useState(false);
  const [initialProfileData, setInitialProfileData] = useState<Partial<OnboardingProfileData>>({});

  const startSignup = useCallback((options?: StartSignupOptions) => {
    setRoleState(options?.role ?? null);
    setSkipToProfile(options?.skipToProfile ?? false);
    setInitialProfileData(options?.initialProfileData ?? {});
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
    <OnboardingContext.Provider value={{ active, role, skipToProfile, initialProfileData, startSignup, cancel, setRole }}>
      {children}
    </OnboardingContext.Provider>
  );
}
