import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Globe2 } from 'lucide-react';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { COUNTRIES } from '@/lib/countries';
import { CountryBrowser } from './CountryBrowser';
import { cn } from '@/lib/utils';

interface WorldDiscoveryPanelProps {
  /**
   * Per-country activity counts derived from the trusted global stats
   * snapshot. Drives the "trending" section at the top of the panel.
   */
  activities?: Map<string, number>;
  /** Extra classes — defaults to a desktop-only sticky right column. */
  className?: string;
}

/**
 * Desktop right-column variant of the world discovery surface. Always
 * visible alongside the full-bleed map at the `xl` breakpoint (1280px)
 * and up. Mirrors the content of `WorldDiscoveryDrawer` (mobile / tablet)
 * so users get the same affordances regardless of device — trending
 * countries, community stats snapshot, and the full A–Z country browser.
 *
 * Hidden below `xl` via `hidden xl:flex`; the floating discovery launcher
 * + modal takes over there. The cutoff sits at `xl` (not the lower
 * `sidebar` breakpoint) because the map needs at least ~700-800px of
 * horizontal room to be readable next to the 360px panel.
 */
export function WorldDiscoveryPanel({ activities, className }: WorldDiscoveryPanelProps) {
  // Same trending derivation as the drawer's peek strip — fold subdivision
  // codes into their parent country and surface the top 12 by activity.
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
      .filter((c) => c.flag)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [activities]);

  const totalActiveCountries = topCountries.length;

  return (
    <aside
      className={cn(
        // `hidden xl:flex` keeps the panel out of the layout flow below
        // 1280px so the map gets the full column width and the floating
        // discovery launcher is the only discovery surface there.
        // `sticky top-0 h-screen` pins it next to the map column without
        // affecting page scroll behavior.
        'hidden xl:flex flex-col w-[360px] shrink-0 h-screen sticky top-0 border-l border-border bg-background overflow-hidden',
        className,
      )}
      aria-label="World discovery panel"
    >
      {/* Trending section — instant tap-to-jump chips for the hottest
          countries. Sits at the top so it's never scrolled past. */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2 mb-2.5">
          {topCountries.length > 0 ? (
            <Flame className="size-4 text-primary shrink-0" />
          ) : (
            <Globe2 className="size-4 text-muted-foreground shrink-0" />
          )}
          <h2 className="text-sm font-semibold">
            {topCountries.length > 0
              ? `${totalActiveCountries.toLocaleString()} countries active`
              : 'Explore the world'}
          </h2>
        </div>
        {topCountries.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {topCountries.map((c) => (
              <Link
                key={c.code}
                to={`/i/iso3166:${c.code}`}
                className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 px-2.5 py-1 transition-colors"
              >
                <span className="text-sm leading-none" role="img" aria-label={`Flag of ${c.name}`}>
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
          <p className="text-xs text-muted-foreground">
            Browse all countries or wait a moment for activity to load.
          </p>
        )}
      </div>

      {/* Scroll area: stats snapshot + searchable A–Z browser. The browser's
          search input is internally sticky so it stays visible while the
          long flag grid scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="px-4 pt-4 pb-2">
          <CommunityStatsPanel compact />
        </div>
        <CountryBrowser gridClassName="grid-cols-3" />
      </div>
    </aside>
  );
}
