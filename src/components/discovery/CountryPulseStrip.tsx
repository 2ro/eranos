import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { getCountryInfo, subdivisionFlag } from '@/lib/countries';
import { Skeleton } from '@/components/ui/skeleton';
import { CountryFlag } from '@/components/CountryFlag';
import { cn } from '@/lib/utils';

interface CountryPulseStripProps {
  /** Maximum number of country chips to render. Default: 24. */
  limit?: number;
  className?: string;
}

interface CountryEntry {
  /** Full ISO 3166 identifier — either `XX` (country) or `XX-YY` (subdivision). */
  code: string;
  /**
   * Display name. For subdivisions this is the subdivision name
   * (e.g. "California"); for countries it's the country name
   * (e.g. "United States").
   */
  name: string;
  /**
   * Best emoji flag for this entry. Subdivisions with an RGI tag
   * sequence (currently England, Scotland, Wales) get their actual
   * subnational flag; everything else falls back to the parent country
   * flag and a subdivision-code badge.
   */
  flag: string;
  /**
   * Subdivision token (e.g. `CA`, `TX`, `BY`) shown as a small badge
   * overlay when the entry is a state/province *and* no native
   * subdivision flag exists. `undefined` for country-level entries and
   * for subdivisions that already have their own flag emoji.
   */
  subdivisionToken?: string;
  /** Activity count from kind 30385 stats. */
  count: number;
}

/**
 * Horizontal strip of country (and subdivision) flag chips, ordered by
 * trailing-window activity from the trusted kind 30385 stats snapshots.
 * Hovering a chip lifts its flag and brightens its warm gradient
 * sleeve; clicking opens the entity's NIP-73 external-identifier feed
 * at `/i/iso3166:XX` (or `/i/iso3166:XX-YY` for subdivisions).
 *
 * Sits below the hero on the Discover page as a low-friction entry into
 * geo-scoped browsing — the "this is where the world is showing up
 * today" rail.
 *
 * Renders a soft-pulse skeleton while activity data is loading so the
 * page never collapses to zero height between the hero and the campaign
 * shelf.
 */
/**
 * ISO 3166-2 codes we display as country-level entries rather than
 * subdivisions. The strip shows the subdivision's *own* name (no parent
 * country fallback) and suppresses the small ISO-suffix badge — these
 * are entities with their own widely-recognised flag and identity.
 *
 * Currently just Tibet: ISO 3166-2 lists `CN-XZ` as "Tibet Autonomous
 * Region" under China, but the editorial position here is to surface it
 * as a country in its own right with the Snow Lion flag.
 */
const COUNTRY_LEVEL_SUBDIVISIONS: Record<string, string> = {
  'CN-XZ': 'Tibet',
};

export function CountryPulseStrip({ limit = 24, className }: CountryPulseStripProps) {
  const { data: activityByCountry, isLoading } = useGlobalActivity();

  const entries = useMemo<CountryEntry[]>(() => {
    if (!activityByCountry) return [];
    const out: CountryEntry[] = [];
    for (const [code, count] of activityByCountry) {
      const info = getCountryInfo(code);
      if (!info) continue;
      const upperCode = code.toUpperCase();
      const countryLevelOverride = COUNTRY_LEVEL_SUBDIVISIONS[upperCode];
      const isSubdivision = !!info.subdivision;

      // Country-level override (Tibet etc.) wins: use the editorial
      // name, drop the subdivision-token badge, and let CountryFlag pick
      // up the bundled SVG asset on render.
      if (countryLevelOverride) {
        out.push({
          code,
          name: countryLevelOverride,
          flag: info.flag,
          subdivisionToken: undefined,
          count,
        });
        continue;
      }

      // Prefer subdivision-level naming when available — "California" reads
      // far more usefully than yet another "United States" tile.
      const name = (isSubdivision ? info.subdivisionName : info.name) ?? info.name;
      // Use the real subdivision flag (England/Scotland/Wales tag
      // sequences) when one exists; otherwise fall back to the parent
      // country flag and surface the ISO 3166-2 suffix as a badge.
      const nativeSubFlag = isSubdivision && info.subdivision
        ? subdivisionFlag(info.subdivision)
        : null;
      const flag = nativeSubFlag ?? info.flag;
      const subdivisionToken = isSubdivision && !nativeSubFlag
        ? info.subdivision?.split('-')[1]
        : undefined;
      out.push({
        code,
        name,
        flag,
        subdivisionToken,
        count,
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, limit);
  }, [activityByCountry, limit]);

  // Vertical padding (`py-2`) on the scroll track gives the chips room
  // to lift on hover (`-translate-y-0.5` plus the slightly larger glyph)
  // without `overflow-x-auto` cropping the top edge — `overflow-x-auto`
  // implicitly clips on the Y axis too, and `overflow-y-visible` is
  // unreliable across browsers, so we pad instead of fight the clip.
  const scrollClass = 'flex gap-3 overflow-x-auto scrollbar-none px-4 py-2';

  if (isLoading && entries.length === 0) {
    return (
      <div className={cn(scrollClass, className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className={cn(scrollClass, className)}>
      {entries.map((entry) => (
        <CountryChip key={entry.code} entry={entry} />
      ))}
    </div>
  );
}

function CountryChip({ entry }: { entry: CountryEntry }) {
  const ariaLabel = entry.subdivisionToken
    ? `${entry.name} (${entry.code}): ${entry.count.toLocaleString()} recent comments`
    : `${entry.name}: ${entry.count.toLocaleString()} recent comments`;

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
      aria-label={ariaLabel}
    >
      {/* Flag + optional subdivision token. The token is a tiny pill
          anchored bottom-right of the flag glyph — no emoji font has
          reliable subnational flags, so we surface the ISO 3166-2
          suffix (e.g. "CA", "TX", "BY") as a typographic badge.
          `CountryFlag` swaps in a bundled SVG for codes that have a
          recognised flag but no Unicode emoji (currently Tibet). */}
      <span className="relative leading-none motion-safe:transition-transform group-hover:scale-110 inline-block">
        <CountryFlag
          code={entry.code}
          emoji={entry.flag}
          label={entry.name}
          className="text-3xl"
        />
        {entry.subdivisionToken && (
          <span
            className={cn(
              'absolute -bottom-1 -right-2 px-1.5 py-0.5 rounded-md',
              'text-[9px] font-bold tracking-wider leading-none',
              'bg-background/95 text-foreground/85 border border-border/70 shadow-sm',
            )}
            aria-hidden="true"
          >
            {entry.subdivisionToken}
          </span>
        )}
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
