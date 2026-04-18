import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';

const COUNTRY_LIST = Object.entries(COUNTRIES)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name));

interface CountryBrowserProps {
  /** Tailwind grid column count for the flag grid. Defaults to a responsive
   *  4-column layout suitable for the 360px right column. */
  gridClassName?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * Search input + A–Z country flag grid. Shared by the desktop right column
 * (`WorldDiscoveryPanel`) and the mobile bottom drawer
 * (`WorldDiscoveryDrawer`) so country browsing has a single source of truth.
 *
 * Each flag links to the existing `/i/iso3166:XX` country feed.
 */
export function CountryBrowser({ gridClassName, className }: CountryBrowserProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRY_LIST;
    const q = search.trim().toLowerCase();
    return COUNTRY_LIST.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search countries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      {filtered.length > 0 ? (
        <div className={cn('grid gap-2 p-4', gridClassName ?? 'grid-cols-3 sm:grid-cols-4')}>
          {filtered.map((c) => (
            <Link
              key={c.code}
              to={`/i/iso3166:${c.code}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-secondary/60"
            >
              <span
                className="text-3xl sm:text-4xl leading-none select-none transition-transform group-hover:scale-110"
                role="img"
                aria-label={`Flag of ${c.name}`}
              >
                {c.flag}
              </span>
              <span className="text-xs text-center font-medium text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2 leading-tight">
                {c.name}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 px-8 text-center">
          <p className="text-muted-foreground">No countries match "{search}"</p>
        </div>
      )}
    </div>
  );
}
