import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'organization-feed:members-only';

function readFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

let cached = typeof localStorage !== 'undefined' ? readFromStorage() : false;
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
    // Keep the in-memory preference even when storage is unavailable.
  }
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = readFromStorage();
    if (next === cached) return;
    cached = next;
    notify();
  });
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot() {
  return cached;
}

/** Global preference for showing only founder/moderator comments in org feeds. */
export function useOrganizationMembersOnlyFilter() {
  const membersOnly = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggle = useCallback(() => setMembersOnly(!cached), []);

  return { membersOnly, setMembersOnly, toggle };
}
