import { type ReactNode } from 'react';
import { CountryFeedContext } from '@/contexts/CountryFeedContext';

interface CountryFeedProviderProps {
  countryCode: string;
  children: ReactNode;
}

/** Marks the subtree as belonging to a specific ISO 3166 country/subdivision feed. */
export function CountryFeedProvider({ countryCode, children }: CountryFeedProviderProps) {
  return (
    <CountryFeedContext.Provider value={{ countryCode: countryCode.toUpperCase() }}>
      {children}
    </CountryFeedContext.Provider>
  );
}
