import { createContext, useContext } from 'react';

/**
 * Context that lets nested components (e.g. NoteMoreMenu) discover which
 * country feed they are rendered inside, so they can offer organizer/admin
 * actions like Pin/Unpin scoped to that country. `null` outside any country
 * feed.
 */
export const CountryFeedContext = createContext<{ countryCode: string } | null>(null);

/** Returns the current country feed's ISO 3166 code, or `null` outside one. */
export function useCountryFeed(): { countryCode: string } | null {
  return useContext(CountryFeedContext);
}
