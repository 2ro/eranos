import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Flame, Globe2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { COUNTRIES } from '@/lib/countries';
import { CountryBrowser } from './CountryBrowser';
import { cn } from '@/lib/utils';

const TOTAL_COUNTRIES = Object.keys(COUNTRIES).length;

interface WorldDiscoveryModalProps {
  /**
   * Per-country activity counts derived from the trusted global stats
   * snapshot. Drives the "trending" chips at the top and the active-country
   * badge on the floating button.
   */
  activities?: Map<string, number>;
}

/**
 * Mobile / tablet (sub-sidebar breakpoint) discovery surface for the
 * `/world` map. Replaces the previous persistent bottom drawer with a
 * compact floating button that opens a centered information-style modal
 * on demand — the map stays fully visible until the user explicitly opts
 * into discovery, instead of having half the screen permanently occupied
 * by a sheet.
 *
 * Above the `sidebar` breakpoint (900px) the docked `WorldDiscoveryPanel`
 * takes over and this component is unmounted by `WorldPage`.
 */
export function WorldDiscoveryDrawer({ activities }: WorldDiscoveryModalProps) {
  const [open, setOpen] = useState(false);

  // Top-N hottest countries for the modal's trending strip. Subdivision
  // codes (e.g. `US-TX`) are folded into their parent country so the strip
  // mirrors the world map's mental model. Sorted by activity count desc.
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

  return (
    <>
      {/* Floating discovery launcher. Anchored to the top-right of the
          page wrapper at the same vertical offset as Leaflet's zoom
          controls (which dock at `top: 10px; left: 10px` inside the map
          container), so the two sit on the same horizontal line. The
          mobile top bar overlays the map column but is semi-transparent
          on the world page (`fullBleed`), so a 10px offset still keeps
          the button visually clear of the bar. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open world discovery"
        className={cn(
          'absolute right-2.5 top-2.5 z-30 flex items-center gap-2 rounded-full',
          'border border-border/60 bg-background/95 backdrop-blur',
          'px-4 py-2.5 shadow-lg hover:bg-background',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {topCountries.length > 0 ? (
          <Flame className="size-4 text-primary shrink-0" />
        ) : (
          <Compass className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-semibold">
          {topCountries.length > 0
            ? `${totalActiveCountries.toLocaleString()} active`
            : 'Discover'}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Tall, scrollable modal — flex column so the embedded
            `CountryBrowser` can manage its own internal scroll while the
            sticky search header stays reachable. Responsive width: hugs
            the viewport on phones, expands to a comfortable reading
            width on tablets and small laptops (where the docked
            discovery panel hasn't kicked in yet at `xl`/1280px). */}
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-base">
              {topCountries.length > 0 ? (
                <Flame className="size-4 text-primary shrink-0" />
              ) : (
                <Globe2 className="size-4 text-muted-foreground shrink-0" />
              )}
              {topCountries.length > 0
                ? `${totalActiveCountries.toLocaleString()} countries active`
                : `Explore ${TOTAL_COUNTRIES} countries`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Trending countries, community stats, and the full A–Z country browser.
            </DialogDescription>

            {/* Trending strip — horizontally scrollable chips of the
                hottest countries. Each chip routes straight into the
                country feed and closes the modal so the user lands on the
                destination immediately. */}
            {topCountries.length > 0 && (
              <div className="-mx-4 mt-2 overflow-x-auto px-4 pb-1">
                <div className="flex gap-2">
                  {topCountries.map((c) => (
                    <Link
                      key={c.code}
                      to={`/i/iso3166:${c.code}`}
                      onClick={() => setOpen(false)}
                      className="group flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span
                        className="text-base leading-none"
                        role="img"
                        aria-label={`Flag of ${c.name}`}
                      >
                        {c.flag}
                      </span>
                      <span className="max-w-[10ch] truncate text-xs font-medium group-hover:text-foreground">
                        {c.name}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums text-primary">
                        {c.count.toLocaleString()}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Scrollable body: stats snapshot + A–Z browser. */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 pt-3 pb-2">
              <CommunityStatsPanel compact />
            </div>
            <CountryBrowser gridClassName="grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
