import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { getCountryInfo } from '@/lib/countries';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CountryPulseStripProps {
  /** Maximum number of country chips to render. Default: 24. */
  limit?: number;
  className?: string;
}

interface CountryEntry {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  /** Display name (from `getCountryInfo`). */
  name: string;
  /** Flag emoji. */
  flag: string;
  /** Activity count from kind 30385 stats. */
  count: number;
}

/**
 * Horizontal strip of country flag chips, ordered by trailing-window
 * activity from the trusted kind 30385 stats snapshots. Hovering a chip
 * lifts its flag and brightens its warm gradient sleeve; clicking opens
 * the country's NIP-73 external-identifier feed at `/i/iso3166:XX`.
 *
 * Sits below the hero on the Discover page as a low-friction entry into
 * country-scoped browsing — the "this is where the world is showing up
 * today" rail.
 *
 * Renders a soft-pulse skeleton while activity data is loading so the
 * page never collapses to zero height between the hero and the campaign
 * shelf.
 */
export function CountryPulseStrip({ limit = 24, className }: CountryPulseStripProps) {
  const { data: activityByCountry, isLoading } = useGlobalActivity();

  const entries = useMemo<CountryEntry[]>(() => {
    if (!activityByCountry) return [];
    const out: CountryEntry[] = [];
    for (const [code, count] of activityByCountry) {
      const info = getCountryInfo(code);
      if (!info) continue;
      out.push({ code, name: info.name, flag: info.flag, count });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, limit);
  }, [activityByCountry, limit]);

  if (isLoading && entries.length === 0) {
    return (
      <div className={cn('flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className={cn('flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1', className)}>
      {entries.map((entry) => (
        <CountryChip key={entry.code} entry={entry} />
      ))}
    </div>
  );
}

function CountryChip({ entry }: { entry: CountryEntry }) {
  return (
    <Link
      to={`/i/iso3166:${entry.code}`}
      className={cn(
        'group relative flex w-28 shrink-0 flex-col items-center gap-1 rounded-2xl p-3',
        'bg-gradient-to-br from-amber-100/30 via-rose-100/20 to-amber-50/20',
        'dark:from-amber-900/20 dark:via-rose-900/15 dark:to-amber-950/15',
        'border border-amber-200/40 dark:border-amber-900/40',
        'shadow-sm motion-safe:transition-all motion-safe:duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      aria-label={`${entry.name}: ${entry.count.toLocaleString()} recent comments`}
    >
      <span
        className="text-3xl leading-none select-none motion-safe:transition-transform group-hover:scale-110"
        role="img"
        aria-hidden="true"
      >
        {entry.flag}
      </span>
      <span className="text-[11px] font-semibold text-foreground/90 line-clamp-1 max-w-full">
        {entry.name}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">
        {entry.count.toLocaleString()}
      </span>
    </Link>
  );
}
