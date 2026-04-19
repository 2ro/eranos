import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import { decode } from 'ngeohash';
import { scaleSqrt } from 'd3-scale';
import type { Map as LeafletMap } from 'leaflet';
import { MessageCircle, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';
import type { EphemeralEventData } from '@/hooks/useEphemeralEvents';

// ── Types ───────────────────────────────────────────────────────────────────

/** One physical location (full geohash) carrying recent ephemeral events. */
interface GeohashLocation {
  geohash: string;
  /** `[lng, lat]` — note the order; Leaflet uses `[lat, lng]`. */
  coordinates: [number, number];
  events: EphemeralEventData[];
}

/** Pixel-clustered set of geohash locations rendered as a single bubble. */
interface ClusteredEphemeralMarker {
  id: string;
  coordinates: [number, number];
  locations: GeohashLocation[];
  totalEvents: number;
}

// ── Sizing + clustering tuning ──────────────────────────────────────────────

const ephemeralSizeScale = scaleSqrt().domain([1, 50]).range([18, 36]);
const ephemeralClusterScale = scaleSqrt().domain([2, 200]).range([24, 48]);
const CLUSTER_RADIUS_PX = 50;
const DISABLE_CLUSTERING_AT_ZOOM = 6;

// ── Country chip helpers ────────────────────────────────────────────────────

/** Coarse geohash-prefix → ISO 3166 alpha-2 mapping, only used for cosmetic
 *  flag/name chips inside popovers. Not authoritative geography. */
const GEOHASH_TO_COUNTRY: Record<string, string> = {
  '9': 'US', '9q': 'US', '9r': 'US', '9x': 'US', '9w': 'US', '9t': 'US',
  '9m': 'US', '9y': 'US', '9z': 'US', '9p': 'US', '9n': 'US',
  '9g': 'MX', '9e': 'MX', '9d': 'MX', '9f': 'MX', '9c': 'MX', '9b': 'MX',
  c: 'CA', b: 'US', d: 'US', dn: 'US', dp: 'US', dr: 'US', dq: 'US',
  dj: 'US', dk: 'US', dm: 'US', f: 'CA',
  u: 'EU', gc: 'GB', gf: 'GB', ey: 'NO', ez: 'NO',
  u0: 'ES', u1: 'ES', u2: 'FR', u3: 'FR', u4: 'FR',
  u6: 'DE', u7: 'DE', u8: 'DE', u9: 'DE',
  uc: 'PL', ud: 'PL', ue: 'SE', ug: 'SE',
  sr: 'IT', sp: 'IT', tf: 'CH',
  '6': 'BR', '7': 'CL',
  w: 'CN', x: 'CN', y: 'CN', xn: 'JP', xp: 'JP',
  t: 'IN', tu: 'IN', tv: 'IN', tw: 'IN', v: 'RU',
  s: 'SA',
  k: 'ZA', e: 'NG',
  q: 'AU', r: 'AU',
};

function getCountryFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return code;
  return code
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

function getCountryFromGeohash(geohash: string) {
  for (let len = Math.min(geohash.length, 3); len >= 1; len--) {
    const prefix = geohash.substring(0, len).toLowerCase();
    const code = GEOHASH_TO_COUNTRY[prefix];
    if (!code) continue;
    return {
      code,
      name: COUNTRIES[code]?.name || code,
      flag: getCountryFlag(code),
    };
  }
  return null;
}

function truncateGeohash(geohash: string, length = 6) {
  return geohash.length > length ? geohash.substring(0, length) : geohash;
}

// ── Clustering ──────────────────────────────────────────────────────────────

function clusterEphemeralLocations(
  locations: GeohashLocation[],
  map: LeafletMap,
  radiusPx: number,
): ClusteredEphemeralMarker[] {
  if (locations.length === 0) return [];

  const withPixels = locations.map((loc) => ({
    loc,
    pixel: map.latLngToContainerPoint([loc.coordinates[1], loc.coordinates[0]]),
  }));

  const out: ClusteredEphemeralMarker[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < withPixels.length; i++) {
    if (assigned.has(i)) continue;
    const members: GeohashLocation[] = [withPixels[i].loc];
    assigned.add(i);
    for (let j = i + 1; j < withPixels.length; j++) {
      if (assigned.has(j)) continue;
      const dx = withPixels[i].pixel.x - withPixels[j].pixel.x;
      const dy = withPixels[i].pixel.y - withPixels[j].pixel.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        members.push(withPixels[j].loc);
        assigned.add(j);
      }
    }
    let totalLng = 0;
    let totalLat = 0;
    let totalEvents = 0;
    for (const m of members) {
      const w = Math.max(1, m.events.length);
      totalLng += m.coordinates[0] * w;
      totalLat += m.coordinates[1] * w;
      totalEvents += m.events.length;
    }
    const totalWeight = members.reduce(
      (sum, m) => sum + Math.max(1, m.events.length),
      0,
    );
    out.push({
      id: members.map((m) => m.geohash).sort().join('|'),
      coordinates: [totalLng / totalWeight, totalLat / totalWeight],
      locations: members,
      totalEvents,
    });
  }
  return out;
}

// ── Popover ─────────────────────────────────────────────────────────────────

function EphemeralPopover({
  locations,
  onOpenChat,
  isMobile,
}: {
  locations: GeohashLocation[];
  onOpenChat: (geohash: string) => void;
  isMobile?: boolean;
}) {
  const rows = useMemo(
    () =>
      locations
        .map((loc) => {
          const messagesWithContent = loc.events.filter(
            (e) => e.message && e.message.trim().length > 0,
          );
          const userCount = new Set(loc.events.map((e) => e.event.pubkey)).size;
          // Newest message first.
          const latest = [...messagesWithContent].sort(
            (a, b) => b.event.created_at - a.event.created_at,
          )[0];
          return {
            geohash: loc.geohash,
            country: getCountryFromGeohash(loc.geohash),
            messageCount: messagesWithContent.length,
            userCount,
            latest,
          };
        })
        .filter((r) => r.messageCount > 0)
        .sort((a, b) => b.messageCount - a.messageCount),
    [locations],
  );

  const heartbeatCount = locations.reduce(
    (sum, loc) =>
      sum + loc.events.filter((e) => !e.message || !e.message.trim()).length,
    0,
  );

  return (
    <Card
      className={cn(
        'border-sky-400/30 bg-popover/95 backdrop-blur-sm shadow-xl',
        isMobile ? 'w-[90vw]' : 'w-[28rem]',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          Live geo chat
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'location' : 'locations'}
          {heartbeatCount > 0 && ` · ${heartbeatCount} active`}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {heartbeatCount} {heartbeatCount === 1 ? 'user is' : 'users are'} listening nearby — be the first to say something.
          </p>
        ) : (
          <ScrollArea className="h-48 sm:h-64">
            <div className="space-y-2 pr-2">
              {rows.map(({ geohash, country, messageCount, userCount, latest }) => (
                <button
                  key={geohash}
                  onClick={() => onOpenChat(geohash)}
                  className="w-full text-left p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200/50 dark:border-sky-800/50 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg leading-none flex-shrink-0">
                        {country?.flag || '📍'}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {country?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {truncateGeohash(geohash)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Users className="h-3 w-3" />
                        {userCount}
                      </Badge>
                      <Badge className="text-xs gap-1 bg-sky-500 hover:bg-sky-500">
                        <MessageCircle className="h-3 w-3" />
                        {messageCount}
                      </Badge>
                    </div>
                  </div>
                  {latest && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                      {latest.nickname && (
                        <span className="font-medium">{latest.nickname}: </span>
                      )}
                      {latest.message}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ── Marker bubble ───────────────────────────────────────────────────────────

function EphemeralBubble({
  size,
  count,
  isCluster,
}: {
  size: number;
  count: number;
  isCluster?: boolean;
}) {
  const opacityMultiplier = count < 3 ? 0.6 : 1;
  return (
    <div
      className="relative flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full bg-sky-400 animate-accent-glow blur-md"
        style={{ transform: 'scale(1.5)', opacity: 0.45 * opacityMultiplier }}
      />
      <div
        className="absolute inset-0 rounded-full bg-sky-400 animate-pulse blur-sm"
        style={{ transform: 'scale(1.3)', opacity: 0.3 * opacityMultiplier }}
      />
      <div
        className="absolute inset-0 rounded-full shadow-[0_0_18px_rgba(56,189,248,0.6)] group-hover:shadow-[0_0_28px_rgba(56,189,248,0.85)] transition-shadow"
        style={{
          background:
            'linear-gradient(135deg, hsl(199 89% 55%) 0%, hsl(199 89% 48%) 50%, hsl(199 89% 40%) 100%)',
          opacity: opacityMultiplier,
        }}
      />
      <div className="relative z-10 flex items-center justify-center">
        <span
          className="text-white font-bold leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          style={{ fontSize: Math.max(10, size * (isCluster ? 0.32 : 0.36)) }}
        >
          {count}
        </span>
      </div>
    </div>
  );
}

// ── Layer ───────────────────────────────────────────────────────────────────

interface EphemeralMarkersLayerProps {
  events: EphemeralEventData[];
  onOpenChat: (geohash: string) => void;
  isMobile?: boolean;
}

/**
 * DOM overlay that renders ephemeral chat activity (kinds 20000/20001) as
 * sky-blue glowing bubbles distinct from the orange community-activity
 * bubbles. Clicking a bubble opens a popover with one row per active
 * geohash, each linking into the realtime chat dialog.
 *
 * Mounted inside `<MapContainer>`. Listens to Leaflet move/zoom events and
 * recomputes pixel positions so bubbles follow the map.
 */
export function EphemeralMarkersLayer({
  events,
  onOpenChat,
  isMobile,
}: EphemeralMarkersLayerProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [, force] = useState({});

  useEffect(() => {
    const onMove = () => force({});
    const onZoom = () => {
      setZoom(map.getZoom());
      force({});
    };
    map.on('move', onMove);
    map.on('zoom', onZoom);
    map.on('moveend', onMove);
    map.on('zoomend', onZoom);
    return () => {
      map.off('move', onMove);
      map.off('zoom', onZoom);
      map.off('moveend', onMove);
      map.off('zoomend', onZoom);
    };
  }, [map]);

  // Group raw events by full geohash → one location each.
  const locations = useMemo<GeohashLocation[]>(() => {
    const grouped = new Map<string, EphemeralEventData[]>();
    for (const e of events) {
      if (!e.geohash) continue;
      const arr = grouped.get(e.geohash);
      if (arr) arr.push(e);
      else grouped.set(e.geohash, [e]);
    }
    const result: GeohashLocation[] = [];
    for (const [geohash, evts] of grouped.entries()) {
      try {
        const { latitude, longitude } = decode(geohash);
        result.push({
          geohash,
          coordinates: [longitude, latitude],
          events: evts,
        });
      } catch {
        // Skip malformed geohashes silently — Pathos producers occasionally
        // ship bad strings.
      }
    }
    return result;
  }, [events]);

  const getPixel = useCallback(
    (lng: number, lat: number) => {
      try {
        const p = map.latLngToContainerPoint([lat, lng]);
        return { x: p.x, y: p.y };
      } catch {
        return { x: 0, y: 0 };
      }
    },
    [map],
  );

  const shouldCluster = zoom < DISABLE_CLUSTERING_AT_ZOOM;

  const clusters = useMemo(() => {
    if (!shouldCluster || locations.length <= 1) return null;
    return clusterEphemeralLocations(locations, map, CLUSTER_RADIUS_PX);
    // Re-cluster on zoom changes too, since pixel positions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, map, shouldCluster, zoom]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: 'visible', zIndex: 999 }}
    >
      {shouldCluster && clusters
        ? clusters.map((cluster) => {
            const pos = getPixel(cluster.coordinates[0], cluster.coordinates[1]);
            if (pos.x === 0 && pos.y === 0) return null;
            const isCluster = cluster.locations.length > 1;
            const size = isCluster
              ? ephemeralClusterScale(Math.min(cluster.totalEvents, 200))
              : ephemeralSizeScale(Math.min(cluster.totalEvents, 50));
            return (
              <div
                key={cluster.id}
                className="absolute pointer-events-auto"
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      aria-label={
                        isCluster
                          ? `${cluster.locations.length} chat locations, ${cluster.totalEvents} events`
                          : `${cluster.totalEvents} events at ${cluster.locations[0].geohash}`
                      }
                      className="bg-transparent border-0 p-0"
                    >
                      <EphemeralBubble
                        size={size}
                        count={cluster.locations.length > 1 ? cluster.locations.length : cluster.totalEvents}
                        isCluster={isCluster}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className={cn(
                      '!w-auto p-0 border-0 shadow-xl z-[10000]',
                      isMobile && '!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2',
                    )}
                    side={isMobile ? undefined : 'top'}
                    sideOffset={isMobile ? 0 : 10}
                    collisionPadding={
                      isMobile ? undefined : { top: 16, bottom: 16, left: 16, right: 16 }
                    }
                    avoidCollisions={!isMobile}
                  >
                    <EphemeralPopover
                      locations={cluster.locations}
                      onOpenChat={onOpenChat}
                      isMobile={isMobile}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            );
          })
        : locations.map((loc) => {
            const pos = getPixel(loc.coordinates[0], loc.coordinates[1]);
            if (pos.x === 0 && pos.y === 0) return null;
            const size = ephemeralSizeScale(Math.min(loc.events.length, 50));
            return (
              <div
                key={loc.geohash}
                className="absolute pointer-events-auto"
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      aria-label={`${loc.events.length} events at ${loc.geohash}`}
                      className="bg-transparent border-0 p-0"
                    >
                      <EphemeralBubble size={size} count={loc.events.length} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className={cn(
                      '!w-auto p-0 border-0 shadow-xl z-[10000]',
                      isMobile && '!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2',
                    )}
                    side={isMobile ? undefined : 'top'}
                    sideOffset={isMobile ? 0 : 10}
                    collisionPadding={
                      isMobile ? undefined : { top: 16, bottom: 16, left: 16, right: 16 }
                    }
                    avoidCollisions={!isMobile}
                  >
                    <EphemeralPopover
                      locations={[loc]}
                      onOpenChat={onOpenChat}
                      isMobile={isMobile}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            );
          })}
    </div>
  );
}
