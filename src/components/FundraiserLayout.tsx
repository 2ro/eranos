import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

import { FloatingComposeButton } from '@/components/FloatingComposeButton';
import { TopNav } from '@/components/TopNav';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CenterColumnContext,
  DrawerContext,
  LayoutStore,
  LayoutStoreContext,
  NavHiddenContext,
  useLayoutSnapshot,
} from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';

/**
 * Persistent app shell for the fundraising-platform overhaul.
 *
 * Replaces the previous Twitter-style three-column `MainLayout` with a
 * GoFundMe-style top-nav-only chrome. Routes render in a single full-width
 * content area below the {@link TopNav}.
 *
 * Compatibility surface:
 * - We still provide `LayoutStoreContext`, so pages that call
 *   `useLayoutOptions(...)` keep working. Most options (FAB, sidebars,
 *   mobile arc) are intentionally ignored here because the new shell has
 *   no FAB and no sidebars. The store drives two width-related escape
 *   hatches: `wrapperClassName` (extra classes on the center column) and
 *   `noMaxWidth` (drops the default `max-w-3xl` cap). The `fullBleed`
 *   preset expands to both, so edge-to-edge pages keep working.
 * - `CenterColumnContext` exposes the content `<div>` so legacy components
 *   (e.g. nsite preview overlay) can still portal into it.
 * - `DrawerContext` and `NavHiddenContext` are kept as no-op providers so
 *   pages that read them don't crash.
 */

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function FundraiserLayoutInner() {
  const centerColumnRef = useRef<HTMLDivElement>(null);
  const [centerColumnEl, setCenterColumnEl] = useState<HTMLElement | null>(null);
  const { noMaxWidth, wrapperClassName, showFAB = false, fabKind = 1, fabHref, onFabClick, fabIcon, fabMenu } = useLayoutSnapshot();

  // Mobile drawer is owned by TopNav now, so consumers of `useOpenDrawer`
  // become no-ops. Keeping the context shape avoids touching every page that
  // pulls the hook.
  const openDrawer = useCallback(() => {}, []);

  return (
    <CenterColumnContext.Provider value={centerColumnEl}>
      <DrawerContext.Provider value={openDrawer}>
        <NavHiddenContext.Provider value={false}>
          <div className="min-h-dvh flex flex-col bg-background">
            <TopNav />

            <Suspense fallback={<PageSkeleton />}>
              <div
                ref={(el) => {
                  centerColumnRef.current = el;
                  setCenterColumnEl(el);
                }}
                className={cn(
                  'flex-1 min-w-0 w-full mx-auto',
                  // App-wide cap on the center column so pages like /help
                  // don't stretch across widescreen monitors. Pages that
                  // need a wider canvas opt out via `noMaxWidth: true` (or
                  // the `fullBleed` preset), which expands to `!max-w-none`
                  // through `wrapperClassName`.
                  !noMaxWidth && 'max-w-3xl',
                  wrapperClassName,
                )}
              >
                <Outlet />
              </div>
            </Suspense>

            {showFAB && (
              <div className="fixed bottom-fab right-6 z-30 pointer-events-none sidebar:right-[max(1.5rem,calc((100vw-48rem)/2-7rem))]">
                <div className="pointer-events-auto">
                  <FloatingComposeButton kind={fabKind} href={fabHref} onFabClick={onFabClick} icon={fabIcon} menu={fabMenu} />
                </div>
              </div>
            )}

            <SiteFooter />
          </div>
        </NavHiddenContext.Provider>
      </DrawerContext.Provider>
    </CenterColumnContext.Provider>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-background mt-auto pt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} Agora. Fundraisers on Nostr.</span>
        <nav className="flex items-center gap-5">
          <Link to="/help" className="hover:text-foreground motion-safe:transition-colors">Help</Link>
          <Link to="/privacy" className="hover:text-foreground motion-safe:transition-colors">Privacy</Link>
          <Link to="/safety" className="hover:text-foreground motion-safe:transition-colors">Safety</Link>
          <Link to="/changelog" className="hover:text-foreground motion-safe:transition-colors">Changelog</Link>
        </nav>
      </div>
    </footer>
  );
}

export function FundraiserLayout() {
  const store = useMemo(() => new LayoutStore(), []);
  return (
    <LayoutStoreContext.Provider value={store}>
      <FundraiserLayoutInner />
    </LayoutStoreContext.Provider>
  );
}

export default FundraiserLayout;
