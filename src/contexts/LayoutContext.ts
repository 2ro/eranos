import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/** A single entry inside the FAB action menu. */
export interface FabMenuItem {
  /** Stable identifier, used as React key. */
  id: string;
  /** Visible label shown next to the icon. */
  label: string;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Invoked when the item is selected; the menu closes automatically. */
  onSelect: () => void;
}

/** Options that pages can set to configure the persistent MainLayout. */
export interface LayoutOptions {
  /** Optional custom right sidebar to replace the default one */
  rightSidebar?: React.ReactNode;
  /** Whether to show the floating compose button (default: false) */
  showFAB?: boolean;
  /** The Nostr event kind the FAB creates (default: 1). Only used when showFAB is true. */
  fabKind?: number;
  /** If set, the FAB navigates to this URL instead of opening a compose dialog. */
  fabHref?: string;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** If set, overrides the default FAB icon (Plus). */
  fabIcon?: React.ReactNode;
  /**
   * If set, the FAB renders as a Popover trigger; tapping it reveals this
   * stack of menu items anchored to the FAB. Selecting an item closes the
   * menu and fires its `onSelect`. Mutually exclusive with `onFabClick` —
   * if both are set, the menu wins.
   */
  fabMenu?: FabMenuItem[];
  /** Additional classes for the wrapper div */
  wrapperClassName?: string;
  /**
   * Optional scroll container element for the MobileBottomNav hide-on-scroll
   * behavior. Pages that scroll an internal container (e.g. Vines snap-scroll)
   * should set this so the bottom nav detects scroll direction correctly.
   */
  scrollContainer?: HTMLElement | null;
  /**
   * If true, disables the bottom overscroll padding on the center column.
   * Use for pages with fixed-height layouts (chat, vines, livestream, etc.)
   * that manage their own scroll containers.
   */
  noOverscroll?: boolean;
  /**
   * If true, removes the max-width constraint on the center column so it
   * expands to fill available space. Use with `rightSidebar: null` for
   * full-width page layouts (e.g. messaging).
   */
  noMaxWidth?: boolean;
  /**
   * If true, indicates the page renders its own sub-header with a decorative
   * arc (e.g. tab bars). The mobile top bar will skip its own arc to avoid
   * doubling up.
   */
  hasSubHeader?: boolean;
  /**
   * If true, all decorative arcs are replaced with plain rectangles on the
   * mobile top bar, bottom nav, and sub-header. Use for immersive pages
   * (e.g. vines) where curved chrome interferes with full-bleed content.
   */
  noArcs?: boolean;
  /**
   * If true, hides the mobile top bar entirely for a fully immersive
   * experience. The page is responsible for its own navigation chrome.
   * Use for full-screen media pages like vines/reels.
   */
  hideTopBar?: boolean;
  /**
   * If true, hides the mobile bottom nav entirely. The page is responsible
   * for providing its own navigation affordances (e.g. embedded back button).
   * Use for full-screen media pages like vines/reels.
   */
  hideBottomNav?: boolean;
  /**
   * Convenience preset for edge-to-edge pages (e.g. /world map). When true,
   * applies the four flags needed to make the center column extend to the
   * viewport's right edge:
   *   - `noMaxWidth: true`              — drop the 600px column cap
   *   - `noOverscroll: true`            — drop the bottom-overscroll padding
   *   - `rightSidebar: null`            — remove the default widget sidebar
   *   - `wrapperClassName: '!max-w-none'` — drop the 1200px outer cap
   *
   * Pages can still override any of these by setting them explicitly in the
   * same `useLayoutOptions` call (e.g. `{ fullBleed: true, rightSidebar: <X /> }`
   * keeps full-bleed behavior but supplies a custom right column).
   *
   * The desktop left sidebar is intentionally *kept* — it's primary
   * navigation. Use `hideTopBar`/`hideBottomNav` separately if you also
   * want to hide mobile chrome.
   */
  fullBleed?: boolean;
}

/** All own-property keys of LayoutOptions used for shallow comparison. */
const LAYOUT_KEYS: (keyof LayoutOptions)[] = [
  'showFAB', 'fabKind', 'fabHref', 'onFabClick', 'fabIcon', 'fabMenu',
  'wrapperClassName', 'rightSidebar', 'scrollContainer',
  'noOverscroll', 'noMaxWidth', 'hasSubHeader', 'noArcs',
  'hideTopBar', 'hideBottomNav',
];

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
 * Pages call `setOptions` to update, and MainLayout subscribes via useSyncExternalStore.
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

/** Context for exposing the scroll-direction hidden state to child components (MobileTopBar, SubHeaderBar). */
export const NavHiddenContext = createContext<boolean>(false);

/** Hook to read whether the top nav should be hidden due to scroll direction. */
export function useNavHidden(): boolean {
  return useContext(NavHiddenContext);
}

/** Context for opening the mobile navigation drawer from any page. */
export const DrawerContext = createContext<() => void>(() => {});

/** Hook to get a function that opens the mobile drawer. */
export function useOpenDrawer(): () => void {
  return useContext(DrawerContext);
}

function useLayoutStore(): LayoutStore {
  const store = useContext(LayoutStoreContext);
  if (!store) throw new Error('useLayoutOptions must be used within LayoutStoreContext');
  return store;
}

/**
 * Hook for pages to declare their layout options.
 * Call this at the top of a page component to configure the surrounding MainLayout.
 *
 * Two effects collaborate:
 *
 * 1. **useLayoutEffect (no deps)** — runs after every commit, before paint.
 *    Writes the latest options to the store so MainLayout never paints stale
 *    values. Has no cleanup — the write is idempotent and runs every render.
 *
 * 2. **useEffect ([] deps)** — runs once on mount, returns a cleanup that
 *    fires only on unmount. The cleanup defers the reset to a
 *    requestAnimationFrame so it doesn't race with Suspense transitions:
 *    all pages are lazy-loaded, so the old page unmounts (cleanup fires)
 *    before the new page mounts. If the incoming page also calls
 *    useLayoutOptions, its useLayoutEffect overwrites the store
 *    synchronously before paint — by the time the rAF fires, the store
 *    no longer holds the old snapshot and the reset is skipped.
 *    If the incoming page does NOT call useLayoutOptions (e.g.
 *    PostDetailPage), the rAF fires on the next frame and clears stale
 *    options.
 */
export function useLayoutOptions(options: LayoutOptions): void {
  const store = useLayoutStore();
  const prev = useRef<LayoutOptions | null>(null);

  // Expand the `fullBleed` preset into its four constituent flags before
  // storing. We strip `fullBleed` itself from the stored object so MainLayout
  // (and the LAYOUT_KEYS shallow-comparison) only ever see the canonical
  // flags. Page-supplied values still win because they spread *after* the
  // preset defaults.
  const { fullBleed, ...rest } = options;
  const expanded: LayoutOptions = fullBleed
    ? {
        noMaxWidth: true,
        noOverscroll: true,
        rightSidebar: null,
        wrapperClassName: '!max-w-none',
        ...rest,
      }
    : rest;

  // Synchronous write — runs after every commit, before paint.
  // No cleanup; the write is idempotent across re-renders.
  useLayoutEffect(() => {
    if (!shallowEqualOptions(prev.current, expanded)) {
      prev.current = expanded;
      store.setOptions(expanded);
    }
  });

  // Unmount-only cleanup — deferred so incoming pages can overwrite first.
  useEffect(() => {
    return () => {
      const snapshot = prev.current;
      requestAnimationFrame(() => {
        if (store.getSnapshot() === snapshot) {
          store.reset();
        }
      });
    };
  }, [store]);
}

/** Hook for MainLayout to read the current layout options reactively. */
export function useLayoutSnapshot(): LayoutOptions {
  const store = useLayoutStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
