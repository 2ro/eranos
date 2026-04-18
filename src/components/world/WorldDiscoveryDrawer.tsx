import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer as Vaul } from 'vaul';
import { ChevronUp, Globe2, Flame } from 'lucide-react';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { COUNTRIES } from '@/lib/countries';
import { CountryBrowser } from './CountryBrowser';
import { cn } from '@/lib/utils';

const TOTAL_COUNTRIES = Object.keys(COUNTRIES).length;

type SnapPoint = string | number;

// Peek is intentionally generous (~160px) so the strip of trending country
// chips inside it is visible without dragging — that gives the bottom sheet
// real visual weight and an immediate reason to engage.
const SNAP_PEEK: SnapPoint = '168px';
const SNAP_MID: SnapPoint = 0.55;
const SNAP_FULL: SnapPoint = 0.92;
const SNAP_POINTS: SnapPoint[] = [SNAP_PEEK, SNAP_MID, SNAP_FULL];

interface WorldDiscoveryDrawerProps {
  /**
   * Element the drawer should portal into. The drawer renders as
   * `position: absolute` inside this container, so passing the page wrapper
   * keeps the drawer scoped to the center column on desktop instead of
   * stretching across the full viewport. Set to `null` to defer rendering
   * until the container ref is attached.
   */
  container: HTMLElement | null;
  /**
   * Per-country activity counts derived from the trusted global stats
   * snapshot. Used to surface the top-N hottest countries as instant-tap
   * chips in the peek state. Pass `undefined` while loading.
   */
  activities?: Map<string, number>;
}

/**
 * Persistent bottom sheet that surfaces the global stats snapshot, country
 * search, and the A–Z grid as a single discovery surface alongside the
 * full-bleed world map. The peek snap keeps the entry point visible at all
 * times so neither the stats nor the country list ever feels hidden.
 *
 * Built on vaul primitives (rather than the shared shadcn `Drawer` wrapper)
 * because we need a non-modal, non-dismissible, snap-point sheet — the
 * shared wrapper is hardcoded for modal dialogs with an overlay.
 */
export function WorldDiscoveryDrawer({ container, activities }: WorldDiscoveryDrawerProps) {
  const [snap, setSnap] = useState<SnapPoint | null>(SNAP_PEEK);

  // Top-N hottest countries for the peek strip. Subdivision codes (e.g.
  // `US-TX`) are folded into their parent country so the strip mirrors the
  // user's mental model of the world map. Sorted by activity count desc.
  const topCountries = useMemo(() => {
    if (!activities || activities.size === 0) return [];
    const byCountry = new Map<string, number>();
    activities.forEach((count, code) => {
      if (count <= 0) return;
      const parent = code.toUpperCase().split('-')[0];
      byCountry.set(parent, (byCountry.get(parent) ?? 0) + count);
    });
    return Array.from(byCountry.entries())
      .map(([code, count]) => ({
        code,
        count,
        name: COUNTRIES[code]?.name ?? code,
        flag: COUNTRIES[code]?.flag ?? '',
      }))
      .filter((c) => c.flag) // skip codes we don't recognise
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [activities]);

  const totalActiveCountries = topCountries.length === 0
    ? 0
    : Array.from(activities?.keys() ?? []).reduce((set, code) => {
        set.add(code.toUpperCase().split('-')[0]);
        return set;
      }, new Set<string>()).size;

  const isPeeking = snap === SNAP_PEEK;

  // Defer rendering until the container ref is attached so vaul can portal
  // into a known DOM node from the first render.
  if (!container) return null;

  return (
    <Vaul.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      container={container}
      shouldScaleBackground={false}
    >
      <Vaul.Portal>
        <Vaul.Content
          aria-describedby={undefined}
          className={cn(
            // Anchor inside the page wrapper. `world-drawer-anchor` handles
            // the bottom offset (clears the mobile bottom nav). The drawer
            // is `absolute` (not `fixed`) so it stays inside the column on
            // desktop instead of spanning the full viewport.
            'world-drawer-anchor absolute inset-x-0 z-30 flex flex-col rounded-t-2xl border border-border/60 bg-background/95 backdrop-blur shadow-[0_-8px_32px_rgba(0,0,0,0.12)]',
            // Snap-point sized: vaul translates this element via transform.
            'h-full max-h-[92dvh]',
          )}
        >
          {/* Drag handle — vaul ships its own [data-vaul-handle] CSS so this
              element is fully draggable to change snap points. */}
          <Vaul.Handle className="!mx-auto !mt-2.5 !h-1.5 !w-12 !rounded-full !bg-muted-foreground/40" />

          {/* Peek header — always visible. Tapping anywhere here toggles the
              drawer between peek and mid snap so users discover the expanded
              content without needing to drag. */}
          <button
            type="button"
            onClick={() => setSnap(isPeeking ? SNAP_MID : SNAP_PEEK)}
            className="flex items-center justify-between gap-3 px-4 pt-2 pb-2 text-left transition-colors hover:bg-secondary/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              {topCountries.length > 0 ? (
                <Flame className="size-4 text-primary shrink-0" />
              ) : (
                <Globe2 className="size-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-semibold truncate">
                {topCountries.length > 0
                  ? `${totalActiveCountries.toLocaleString()} countries active right now`
                  : `Explore ${TOTAL_COUNTRIES} countries`}
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              {isPeeking ? 'More' : 'Hide'}
              <ChevronUp
                className={cn(
                  'size-4 transition-transform',
                  !isPeeking && 'rotate-180',
                )}
              />
            </span>
          </button>

          {/* Vaul drawer titles are required for accessibility; visually
              hidden because the peek header above already labels it. */}
          <Vaul.Title className="sr-only">Discover countries and community stats</Vaul.Title>

          {/* Trending strip — horizontally scrollable chips of the hottest
              countries. Visible in the peek state so the bottom sheet
              immediately shows real, tappable value rather than just a
              label. Each chip routes straight into the country feed. When
              there's no trusted snapshot yet, falls back to a search hint. */}
          <div className="px-4 pb-2 pt-0.5">
            {topCountries.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
                {topCountries.map((c) => (
                  <Link
                    key={c.code}
                    to={`/i/iso3166:${c.code}`}
                    className="group flex items-center gap-2 shrink-0 rounded-full border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 px-3 py-1.5 transition-colors"
                  >
                    <span className="text-base leading-none" role="img" aria-label={`Flag of ${c.name}`}>
                      {c.flag}
                    </span>
                    <span className="text-xs font-medium truncate max-w-[10ch] group-hover:text-foreground">
                      {c.name}
                    </span>
                    <span className="text-[10px] tabular-nums font-semibold text-primary">
                      {c.count.toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                Tap to search and browse all {TOTAL_COUNTRIES} countries.
              </p>
            )}
          </div>

          {/* Expanded body — only mounted when the drawer is above the peek
              snap point so the peek state stays light and the heavy
              CommunityStatsPanel doesn't run its queries when the user
              might never expand the sheet. */}
          {!isPeeking && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {/* Stats snapshot first — putting it on top means the hashtag
                  chips are immediately visible at the mid snap point.
                  Renders nothing when no trusted snapshot exists. */}
              <div className="px-4 pt-2 pb-4">
                <CommunityStatsPanel compact />
              </div>
              {/* Search input + A–Z grid (shared with the desktop right
                  column). The browser owns its own sticky search header so
                  it stays reachable while the grid scrolls. */}
              <CountryBrowser gridClassName="grid-cols-3 sm:grid-cols-4 md:grid-cols-5" />
            </div>
          )}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
