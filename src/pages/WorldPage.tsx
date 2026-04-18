import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Earth, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { useAppContext } from '@/hooks/useAppContext';
import { useGlobalActivity, useTopCountryHashtags } from '@/hooks/useGlobalActivity';
import { COUNTRIES } from '@/lib/countries';

// Lazy-load the map: react-leaflet + leaflet pull in ~150 KB of JS that we
// don't want to ship with the rest of the app shell.
const WorldMap = lazy(() => import('@/components/world/WorldMap'));

const COUNTRY_LIST = Object.entries(COUNTRIES)
  .map(([code, { name, flag }]) => ({ code, name, flag }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function WorldPage() {
  const { config } = useAppContext();
  const [search, setSearch] = useState('');

  useSeoMeta({
    title: `World | ${config.appName}`,
    description: 'Browse countries and join the conversation',
  });

  const { data: activities } = useGlobalActivity();
  const { data: topHashtags } = useTopCountryHashtags();

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRY_LIST;
    const q = search.trim().toLowerCase();
    return COUNTRY_LIST.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <main className="">
      <PageHeader title="World" icon={<Earth className="size-5" />} backTo="/" />

      {/* Global community stats snapshot (kind 30385, d=iso3166:ZZ).
          Renders nothing when no trusted snapshot exists. */}
      <div className="px-4 pb-4">
        <CommunityStatsPanel />
      </div>

      {/* Interactive map — primary discovery surface. Falls back gracefully
          when no per-country stats are available yet (renders the basemap
          alone). Lazy-loaded to keep leaflet out of the main bundle. */}
      <div className="px-4 pb-4">
        <div className="relative h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border bg-muted/30 shadow-sm">
          <Suspense fallback={<Skeleton className="absolute inset-0 rounded-2xl" />}>
            <WorldMap activities={activities ?? new Map()} topHashtags={topHashtags ?? new Map()} />
          </Suspense>
        </div>
      </div>

      {/* A–Z fallback / search — always available so any country can be reached
          even when there's no per-country activity to plot on the map. */}
      <div className="px-4 pb-4">
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 px-4 pb-8">
          {filtered.map((c) => (
            <Link
              key={c.code}
              to={`/i/iso3166:${c.code}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-secondary/60"
            >
              <span
                className="text-4xl sm:text-5xl leading-none select-none transition-transform group-hover:scale-110"
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
    </main>
  );
}
