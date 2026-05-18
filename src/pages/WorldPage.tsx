import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useGlobalActivity, useTopCountryHashtags } from '@/hooks/useGlobalActivity';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { WorldDiscoveryDrawer } from '@/components/world/WorldDiscoveryDrawer';
import { WorldDiscoveryPanel } from '@/components/world/WorldDiscoveryPanel';

// Lazy-load the map: react-leaflet + leaflet pull in ~150 KB of JS that we
// don't want to ship with the rest of the app shell.
const WorldMap = lazy(() => import('@/components/world/WorldMap'));

/**
 * Breakpoint at which the world page has room for a docked right column
 * (`WorldDiscoveryPanel`) alongside the left sidebar and a usable map.
 * Below this width we fall back to the floating discovery launcher +
 * modal so the map isn't crushed.
 *
 * Matches the `xl` Tailwind breakpoint (1280px) — the same threshold the
 * default `WidgetSidebar` uses. The earlier `sidebar` breakpoint (900px)
 * left only ~540px of map between the 300px left rail and the 360px
 * discovery panel, which was too cramped to be useful.
 */
const SIDEBAR_MEDIA_QUERY = '(min-width: 1280px)';

function useHasSidebar(): boolean {
  const [hasSidebar, setHasSidebar] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(SIDEBAR_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(SIDEBAR_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setHasSidebar(e.matches);
    mq.addEventListener('change', handler);
    setHasSidebar(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return hasSidebar;
}

export function WorldPage() {
  const { config } = useAppContext();
  const hasSidebar = useHasSidebar();

  useSeoMeta({
    title: `World | ${config.appName}`,
    description: 'Explore community activity around the world',
  });

  const { data: activities } = useGlobalActivity();
  const { data: topHashtags } = useTopCountryHashtags();

  // Memoise the activities/hashtags fallbacks too — `new Map()` literals
  // produce a fresh reference every render, which causes WorldMap's
  // `activityMarkers` useMemo (and downstream popover refs) to invalidate
  // even when the underlying data hasn't changed.
  const safeActivities = useMemo(() => activities ?? new Map<string, number>(), [activities]);
  const safeTopHashtags = useMemo(() => topHashtags ?? new Map<string, string>(), [topHashtags]);

  // `fullBleed: true` is the new reusable preset for edge-to-edge pages —
  // see `LayoutOptions.fullBleed` for the full list of flags it expands to.
  // We override `rightSidebar` with our discovery panel; the panel hides
  // itself below the sidebar breakpoint via Tailwind's `hidden sidebar:flex`,
  // and the bottom drawer takes over there.
  useLayoutOptions({
    fullBleed: true,
    rightSidebar: <WorldDiscoveryPanel activities={activities} />,
  });

  return (
    // h-dvh inside the column fills the full viewport on both mobile (where
    // the column's negative margin pulls content under the translucent top
    // bar) and desktop (where there's no top/bottom chrome). The floating
    // discovery button is absolutely positioned inside this wrapper so it
    // stays scoped to the column and doesn't overlap the docked desktop
    // discovery panel.
    <div className="relative w-full h-dvh overflow-hidden bg-muted/20">
      <Suspense
        fallback={
          <div className="absolute inset-0">
            <Skeleton className="h-full w-full rounded-none" />
          </div>
        }
      >
        <div className="absolute inset-0">
          <WorldMap
            activities={safeActivities}
            topHashtags={safeTopHashtags}
          />
        </div>
      </Suspense>

      {/* Below the sidebar breakpoint, surface the discovery experience as
          a floating button + modal. Above it, the docked
          `WorldDiscoveryPanel` (rendered as the layout's right sidebar)
          takes over and this component is unmounted. */}
      {!hasSidebar && <WorldDiscoveryDrawer activities={activities} />}
    </div>
  );
}
