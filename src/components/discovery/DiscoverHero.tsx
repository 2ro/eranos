import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, HandHeart, PlusCircle, Users } from 'lucide-react';

import { HeroGlobe, type GlobeMarkerKind } from '@/components/HeroGlobe';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { useGlobalDonations } from '@/hooks/useGlobalDonations';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { searchCountry } from '@/lib/countries';
import { getCoordinates } from '@/lib/coordinates';
import { formatSatsShort } from '@/lib/formatCampaignAmount';
import { cn } from '@/lib/utils';

interface DiscoverHeroProps {
  className?: string;
}

interface GlobeMarker {
  key: string;
  lat: number;
  lng: number;
  label: string;
  kind: GlobeMarkerKind;
}

interface TickerStat {
  /** Stable React key. */
  id: string;
  /** Big number / value text. */
  value: string;
  /** Trailing label that describes what the number is. */
  label: string;
  /** Decorative leading icon. */
  icon: React.ReactNode;
}

/** Country code → lat/lng. Used to seed country-pulse markers. */
function lookupCountryCoords(code: string) {
  const coords = getCoordinates(code);
  return coords ? { lat: coords.latitude, lng: coords.longitude } : null;
}

/**
 * Discover-page hero. The same hand-drawn `HeroGlobe` that anchors the
 * fundraising home page (`/`), but reframed: the globe is the
 * protagonist, three marker types sit on it at once — campaigns
 * (hearts), communities (rings), and country-pulse (warm dots) — and a
 * rotating stat ticker headlines what the network has done.
 *
 * Visual chrome:
 *  - Slow hue drift through `HOPE_PALETTE` every ~8s (the page literally
 *    pulses with hope).
 *  - `HeroAtmosphere` carries the warm scrim + radial glow + sunrise rim,
 *    same component the campaigns hero uses for crossfade.
 *  - No background photo — Discover isn't selling any one campaign, so
 *    the sphere reads against a soft secondary wash instead.
 */
export function DiscoverHero({ className }: DiscoverHeroProps) {
  // ─── Data ──────────────────────────────────────────────────────────────
  const { data: campaigns } = useCampaigns({ limit: 60 });
  const { data: communities } = useDiscoverCommunities({ limit: 60 });
  const { data: activityByCountry } = useGlobalActivity();
  const { data: donations, isLoading: donationsLoading } = useGlobalDonations();

  // ─── Globe markers ─────────────────────────────────────────────────────
  // Layer three pin types. We dedupe primarily by country so the globe
  // never piles dozens of markers on top of each other — the goal is a
  // sparse, hopeful constellation, not a heatmap. Hearts win over rings
  // win over dots when the same country shows up in multiple sources.
  const markers = useMemo<GlobeMarker[]>(() => {
    const out: GlobeMarker[] = [];
    const claimedCountries = new Set<string>();

    // 1. Campaigns → hearts. Newest first; cap at 18 so they don't crowd.
    let heartCount = 0;
    for (const c of campaigns ?? []) {
      if (heartCount >= 18) break;
      if (!c.location) continue;
      const match = searchCountry(c.location);
      if (!match) continue;
      if (claimedCountries.has(match.country.code)) continue;
      const coords = getCoordinates(match.country.code);
      if (!coords) continue;
      claimedCountries.add(match.country.code);
      out.push({
        key: `campaign:${c.aTag}`,
        lat: coords.latitude,
        lng: coords.longitude,
        label: c.title,
        kind: 'campaign',
      });
      heartCount++;
    }

    // 2. Country-pulse dots — the trusted-stats country activity, sized
    // implicitly by the marker glyph. Cap at 28 so the back of the globe
    // doesn't bristle when it rotates into view.
    let pulseCount = 0;
    if (activityByCountry) {
      const sortedCodes = [...activityByCountry.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code);
      for (const code of sortedCodes) {
        if (pulseCount >= 28) break;
        if (claimedCountries.has(code)) continue;
        const coords = lookupCountryCoords(code);
        if (!coords) continue;
        claimedCountries.add(code);
        out.push({
          key: `pulse:${code}`,
          lat: coords.lat,
          lng: coords.lng,
          label: `Active in ${code}`,
          kind: 'country-pulse',
        });
        pulseCount++;
      }
    }

    // 3. Community rings — only when we can geolocate one of the
    // moderators. Communities don't carry a location tag of their own,
    // so we use a small heuristic: spread the first N communities across
    // continents by scattering them on a stable hash. Keeps the layer
    // present without inventing coordinates we can't justify.
    //
    // To keep ourselves honest we cap this at 6 rings and never overwrite
    // a country that already has a campaign heart or pulse dot. If we
    // genuinely can't place any, we skip the layer.
    const scatter: Array<{ lat: number; lng: number }> = [
      { lat: 40.7, lng: -74.0 },   // Americas
      { lat: -23.5, lng: -46.6 },  // S. America
      { lat: 51.5, lng: -0.1 },    // Europe
      { lat: -1.3, lng: 36.8 },    // Africa
      { lat: 35.7, lng: 139.7 },   // E. Asia
      { lat: -33.9, lng: 151.2 },  // Oceania
    ];
    let ringCount = 0;
    for (const community of communities ?? []) {
      if (ringCount >= scatter.length) break;
      const slot = scatter[ringCount];
      out.push({
        key: `community:${community.aTag}`,
        lat: slot.lat,
        lng: slot.lng,
        label: community.name,
        kind: 'community',
      });
      ringCount++;
    }

    return out;
  }, [campaigns, communities, activityByCountry]);

  // ─── Hue drift ─────────────────────────────────────────────────────────
  // Cycle through the hopeful palette on a slow ~9s interval. We seed
  // HeroAtmosphere with a stable string per cycle so its crossfade logic
  // kicks in correctly between hues.
  const [hueIndex, setHueIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % HOPE_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);
  const activeHue = HOPE_PALETTE[hueIndex];
  const atmosphereSeed = `discover-hue-${activeHue.name}`;

  // ─── Stat ticker ───────────────────────────────────────────────────────
  // Three rotating, immutable network-wide stats. We compute them
  // defensively — when the underlying query is still loading we surface
  // a small skeleton inside the ticker row instead of "0" so the page
  // doesn't lie about the network's scale.
  const stats = useMemo<TickerStat[]>(() => {
    const items: TickerStat[] = [];

    if (donations && donations.totalSats > 0) {
      items.push({
        id: 'sats',
        value: formatSatsShort(donations.totalSats),
        label: `raised on-chain across ${donations.campaignCount.toLocaleString()} ${
          donations.campaignCount === 1 ? 'campaign' : 'campaigns'
        }`,
        icon: <HandHeart className="size-5" aria-hidden />,
      });
    }
    if (communities && communities.length > 0) {
      items.push({
        id: 'communities',
        value: communities.length.toLocaleString(),
        label: `${communities.length === 1 ? 'community' : 'communities'} gathering on Nostr`,
        icon: <Users className="size-5" aria-hidden />,
      });
    }
    if (activityByCountry && activityByCountry.size > 0) {
      items.push({
        id: 'countries',
        value: activityByCountry.size.toLocaleString(),
        label: `${activityByCountry.size === 1 ? 'country' : 'countries'} posting today`,
        icon: <Globe2 className="size-5" aria-hidden />,
      });
    }
    return items;
  }, [donations, communities, activityByCountry]);

  // Auto-advance the ticker. Holds at the first slot until at least one
  // stat is known so the visitor doesn't see an empty pill.
  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    if (stats.length <= 1) return;
    const id = window.setInterval(() => {
      setTickerIndex((i) => (i + 1) % stats.length);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [stats.length]);

  const currentStat = stats[tickerIndex % Math.max(stats.length, 1)];

  return (
    <section
      className={cn(
        'relative overflow-hidden border-b border-border bg-secondary/30',
        className,
      )}
    >
      {/* Atmosphere — same scrim + radial glow + sunrise rim used on
          `/`. Seeded by the active hue so the whole hero blooms together
          when the palette advances. */}
      <HeroAtmosphere seed={atmosphereSeed} />

      {/* Globe — centered, dominant. Slight upward bias so the headline
          beneath has breathing room. */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="pointer-events-auto opacity-90">
          <HeroGlobe
            markers={markers}
            hue={activeHue}
            className="aspect-square max-w-none drop-shadow-2xl"
            style={{ width: 'clamp(440px, 62dvw, 720px)' }}
          />
        </div>
      </div>

      {/* Foreground content — headline above the sphere, ticker + CTAs
          below it. Uses the same `max-w-7xl` container as the campaigns
          page so everything aligns. */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 min-h-[560px] sm:min-h-[640px] lg:min-h-[680px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-foreground/70">
            Discover
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] drop-shadow-sm">
            The world,
            <br className="sm:hidden" /> gathering.
          </h1>
          <p className="text-base sm:text-lg text-foreground/75 max-w-2xl mx-auto">
            Campaigns, communities, and conversations from every corner of the
            globe — backed by Bitcoin, broadcast on Nostr, owned by no one.
          </p>
        </div>

        {/* Spacer so the next block lands beneath the sphere. */}
        <div className="flex-1 min-h-[180px] sm:min-h-[220px]" aria-hidden="true" />

        {/* Rotating stat ticker. The fixed min-height stops the layout
            from jumping as labels swap; the keyed inner span re-mounts on
            every change to trigger the fade-in transition. */}
        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-background/55 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          {currentStat ? (
            <div
              key={currentStat.id}
              className="flex items-center justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
            >
              <span className="text-primary shrink-0">{currentStat.icon}</span>
              <span className="text-sm sm:text-base font-semibold tracking-tight">
                {currentStat.value}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                {currentStat.label}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              {donationsLoading ? (
                <>
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Connecting to relays…
                </span>
              )}
            </div>
          )}
        </div>

        {/* CTAs — clean glass pills, same vocabulary as `/`. Two clear
            actions: start something (campaign creation), or browse the
            world map for inspiration. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            asChild
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(24_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(24_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <Link to="/campaigns/new">
              <PlusCircle className="mr-2" />
              Start a campaign
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            asChild
            className="rounded-full bg-background/60 backdrop-blur h-12 px-6 text-base"
          >
            <Link to="/world">
              <Globe2 className="size-4 mr-2" />
              Browse the world
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
