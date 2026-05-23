import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/** Options that pages can set to configure the persistent FundraiserLayout. */
export interface LayoutOptions {
  /**
   * If true, removes the max-width constraint on the center column so it
   * expands to fill available space.
   */
  noMaxWidth?: boolean;
  /** Additional classes for the wrapper div. */
  wrapperClassName?: string;
}

/** Own-property keys of LayoutOptions used for shallow comparison. */
const LAYOUT_KEYS: (keyof LayoutOptions)[] = ['noMaxWidth', 'wrapperClassName'];

/** Shallow-compare two LayoutOptions objects. */
function shallowEqualOptions(a: LayoutOptions | null, b: LayoutOptions): boolean {
  if (a === null) return false;
  if (a === b) return true;
  for (const key of LAYOUT_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

type Listener = () => void;

const EMPTY: LayoutOptions = {};

/**
 * A mutable store that holds the current layout options.
 * Pages call `setOptions` to update, and FundraiserLayout subscribes via useSyncExternalStore.
 */
export class LayoutStore {
  private options: LayoutOptions = EMPTY;
  private listeners = new Set<Listener>();

  getSnapshot = (): LayoutOptions => this.options;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setOptions = (next: LayoutOptions): void => {
    if (this.options === next) return;
    this.options = next;
    this.listeners.forEach((l) => l());
  };

  reset = (): void => {
    if (this.options === EMPTY) return;
    this.options = EMPTY;
    this.listeners.forEach((l) => l());
  };
}

export const LayoutStoreContext = createContext<LayoutStore | null>(null);

/**
 * Provides the center column DOM element so components deep in the tree can
 * portal overlays into it (e.g. the nsite preview panel).
 */
export const CenterColumnContext = createContext<HTMLElement | null>(null);

/** Hook to get the center column DOM element. Returns null until the layout has mounted. */
export function useCenterColumn(): HTMLElement | null {
  return useContext(CenterColumnContext);
}

function useLayoutStore(): LayoutStore {
  const store = useContext(LayoutStoreContext);
  if (!store) throw new Error('useLayoutOptions must be used within LayoutStoreContext');
  return store;
}

/**
 * Hook for pages to declare their layout options.
 * Call this at the top of a page component to configure the surrounding FundraiserLayout.
 *
 * Three effects collaborate:
 *
 * 1. **useLayoutEffect (no deps)** — runs after every commit, before paint.
 *    Writes the latest options to the store so FundraiserLayout never paints
 *    stale values. Has no cleanup — the write is idempotent and runs every
 *    render.
 *
 * 2. **useEffect ([] deps), setup phase** — clears the `unmounting` ref each
 *    time the effect re-attaches. This distinguishes a real unmount from a
 *    Suspense / StrictMode-driven cleanup-then-rerun cycle.
 *
 * 3. **useEffect ([] deps), cleanup phase** — flags `unmounting = true` and
 *    schedules a `requestAnimationFrame`. The rAF only resets the store if
 *    (a) the hook is still flagged as unmounting (no re-setup happened in
 *    between, which is what Suspense / StrictMode produce), and (b) the
 *    store still holds this hook's snapshot (i.e. no other page has written
 *    over it). Both checks must pass — the snapshot check alone is not
 *    enough because Suspense unmount + re-setup leaves the store
 *    unchanged, which the old code would mistake for "no one else wrote"
 *    and reset.
 *
 *    The frame defer is for navigation transitions: lazy pages unmount
 *    (cleanup fires) before the new page mounts, and we want the incoming
 *    page's `useLayoutEffect` to overwrite the store before the reset
 *    decision is made.
 */
export function useLayoutOptions(options: LayoutOptions): void {
  const store = useLayoutStore();
  const prev = useRef<LayoutOptions | null>(null);
  // Per-instance mount sentinel. Flipped to `true` only during a real
  // unmount cleanup. Cleared back to `false` whenever the effect setup
  // re-runs (Suspense / StrictMode dev-mode double-invoke), so the
  // deferred rAF below can tell the two cases apart.
  const unmounting = useRef(false);

  // Synchronous write — runs after every commit, before paint.
  // No cleanup; the write is idempotent across re-renders.
  useLayoutEffect(() => {
    if (!shallowEqualOptions(prev.current, options)) {
      prev.current = options;
      store.setOptions(options);
    }
  });

  // Mount/unmount cleanup. The deferred reset only fires when the hook
  // is genuinely unmounting (Suspense and StrictMode trigger cleanup
  // followed by a fresh setup — we want to no-op in that case).
  useEffect(() => {
    // Setup: cancel any in-flight unmount flagged by a previous cleanup.
    unmounting.current = false;
    return () => {
      unmounting.current = true;
      const snapshot = prev.current;
      requestAnimationFrame(() => {
        // Bail if a re-setup re-mounted us in the meantime (Suspense
        // / StrictMode), or if another page has overwritten the store.
        if (!unmounting.current) return;
        if (store.getSnapshot() === snapshot) {
          store.reset();
        }
      });
    };
  }, [store]);
}

/** Hook for FundraiserLayout to read the current layout options reactively. */
export function useLayoutSnapshot(): LayoutOptions {
  const store = useLayoutStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
