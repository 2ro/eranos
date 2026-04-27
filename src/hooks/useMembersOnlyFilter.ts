import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

/**
 * LocalStorage key for the "members only" filter toggle.
 * Shared across all community surfaces so the preference is global.
 */
const STORAGE_KEY = 'community:members-only';

/**
 * Controls whether community views filter content down to posts authored by
 * chain-validated members, or show everything scoped to the community.
 *
 * Defaults to `true` (members-only), which aligns with the NIP's "canonical
 * community feeds SHOULD discard non-member content by default" guidance
 * (see NIP.md §Community-Scoped Content). Users can opt out per their
 * preference via a shield-icon toggle in the UI.
 *
 * The preference is persisted in localStorage and synchronised across tabs.
 */
export function useMembersOnlyFilter() {
  const [membersOnly, setMembersOnly] = useLocalStorage<boolean>(STORAGE_KEY, true);

  const toggle = useCallback(() => {
    setMembersOnly((prev) => !prev);
  }, [setMembersOnly]);

  return { membersOnly, setMembersOnly, toggle };
}
