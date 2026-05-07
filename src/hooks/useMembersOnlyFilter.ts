import { useCallback, useSyncExternalStore } from 'react';

/**
 * LocalStorage key for the "members only" filter toggle.
 * Shared across all community surfaces so the preference is global.
 */
const STORAGE_KEY = 'community:members-only';

/**
 * Controls whether community views filter content down to posts authored by
 * validated members, or show everything scoped to the community.
 *
 * Defaults to `false` (show everything). The flat-communities spec treats
 * members-only as a MAY feature (see NIP.md §Community-Scoped Content) —
 * the protocol makes no recommendation, so the default is the broader view
 * and users opt in via the shield-icon toggle.
 *
 * Implementation: a module-level singleton store (Set of subscribers +
 * cached boolean). Every component mounting `useMembersOnlyFilter` shares
 * the same state instance, so toggling the shield in one subtree
 * immediately rerenders every other consumer in the same tab. Changes
 * are also persisted to localStorage and synchronised with other tabs
 * via the browser's `storage` event.
 */

/** Read the persisted boolean, defaulting to `false` when absent or malformed. */
function readFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

// ── Module-level singleton store ────────────────────────────────────────────
// Module initialisation accesses `localStorage` which is unavailable in some
// SSR-ish environments. Guard so the module can still be imported.
let cached: boolean = typeof localStorage !== 'undefined' ? readFromStorage() : false;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function setMembersOnly(next: boolean) {
  if (cached === next) return;
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage quota / private mode — swallow; state still updates in-memory.
  }
  notify();
}

/** Subscribe the singleton to cross-tab `storage` events once per module load. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readFromStorage();
    if (next !== cached) {
      cached = next;
      notify();
    }
  });
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getSnapshot() {
  return cached;
}

/**
 * React hook that reads and writes the members-only filter preference.
 *
 * All instances share the same underlying state — toggling via one
 * call immediately rerenders every component consuming this hook.
 */
export function useMembersOnlyFilter() {
  const membersOnly = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback(() => {
    setMembersOnly(!cached);
  }, []);

  return { membersOnly, setMembersOnly, toggle };
}
