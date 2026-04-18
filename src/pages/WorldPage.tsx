import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useGlobalActivity, useTopCountryHashtags } from '@/hooks/useGlobalActivity';
import { useEphemeralEvents } from '@/hooks/useEphemeralEvents';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { WorldDiscoveryDrawer } from '@/components/world/WorldDiscoveryDrawer';
import { WorldDiscoveryPanel } from '@/components/world/WorldDiscoveryPanel';
import { ChatDialog } from '@/components/chat/ChatDialog';

// Lazy-load the map: react-leaflet + leaflet pull in ~150 KB of JS that we
// don't want to ship with the rest of the app shell.
const WorldMap = lazy(() => import('@/components/world/WorldMap'));

/**
 * Match the `sidebar` Tailwind breakpoint (900px). At this width and above
 * the layout has room for a docked right column (`WorldDiscoveryPanel`);
 * below it we fall back to the bottom drawer (`WorldDiscoveryDrawer`).
 *
 * Hardcoded to avoid pulling Tailwind config into the client bundle, same
 * approach as `useIsMobile`.
 */
const SIDEBAR_MEDIA_QUERY = '(min-width: 900px)';

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
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const hasSidebar = useHasSidebar();

  useSeoMeta({
    title: `World | ${config.appName}`,
    description: 'Explore community activity around the world',
  });

  const { data: activities } = useGlobalActivity();
  const { data: topHashtags } = useTopCountryHashtags();
  const { data: ephemeralEvents } = useEphemeralEvents();
  const [activeChatGeohash, setActiveChatGeohash] = useState<string | null>(null);

  // Memoise the per-geohash slice so `ChatDialog` (and its `useChatSession`
  // effects) get a stable array reference across renders — without this,
  // every WorldPage re-render would feed a fresh array into ChatDialog,
  // re-firing every dependent effect and risking ref-callback storms.
  const chatInitialEvents = useMemo(
    () =>
      activeChatGeohash
        ? ephemeralEvents?.filter((e) => e.geohash === activeChatGeohash) ?? []
        : [],
    [activeChatGeohash, ephemeralEvents],
  );

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
    // bar) and desktop (where there's no top/bottom chrome). The drawer is
    // portaled inside this wrapper so it inherits the column's horizontal
    // bounds — no overlap with the docked desktop discovery panel.
    <div ref={setPageEl} className="relative w-full h-dvh overflow-hidden bg-muted/20">
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
            ephemeralEvents={ephemeralEvents}
            onOpenChat={setActiveChatGeohash}
          />
        </div>
      </Suspense>

      {/* Bottom discovery drawer — only mounted below the sidebar breakpoint.
          Above it, the docked `WorldDiscoveryPanel` (rendered as the layout's
          right sidebar) takes over and the drawer is unnecessary. We mount
          conditionally rather than CSS-hiding so vaul's drag handlers and
          listeners aren't running on desktop where the drawer is invisible. */}
      {!hasSidebar && <WorldDiscoveryDrawer container={pageEl} activities={activities} />}

      {/* Per-geohash realtime chat. Only mounted while open so the relay
          subscription tears down cleanly when the dialog closes. */}
      {activeChatGeohash && (
        <ChatDialog
          isOpen={!!activeChatGeohash}
          onClose={() => setActiveChatGeohash(null)}
          geohash={activeChatGeohash}
          initialEvents={chatInitialEvents}
        />
      )}
    </div>
  );
}
