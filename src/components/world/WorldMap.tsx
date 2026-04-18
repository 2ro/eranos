import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { scaleSqrt } from 'd3-scale';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  COUNTRIES,
  isSubdivisionFormat,
  getCountryCoordinates,
  getSubdivisionCoordinates,
} from '@/lib/countries';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CountryActivityPopover } from './CountryActivityPopover';

// CARTO Positron tiles — clean, label-rich basemap with a dark variant.
const POSITRON_LIGHT_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const POSITRON_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface ActivityMarker {
  /** ISO 3166-1 / -2 code as published in the stats snapshot. */
  countryCode: string;
  /** `[longitude, latitude]` — note the order; Leaflet uses `[lat, lng]`. */
  coordinates: [number, number];
  activityCount: number;
  topHashtag?: string;
}

interface ClusteredMarker {
  id: string;
  coordinates: [number, number];
  markers: ActivityMarker[];
  totalActivityCount: number;
  topHashtag?: string;
}

// Bubble sizing — square-root keeps high-activity markers visually bounded.
const sizeScale = scaleSqrt().domain([1, 100]).range([36, 80]);
const clusterSizeScale = scaleSqrt().domain([2, 500]).range([48, 100]);

const CLUSTER_RADIUS_PX = 60;
const DISABLE_CLUSTERING_AT_ZOOM = 6;

/**
 * Group markers that overlap on screen into a single bubble. Cluster centre is
 * the activity-weighted centroid; the most popular hashtag in the cluster is
 * surfaced on the bubble.
 */
function clusterMarkers(
  markers: ActivityMarker[],
  map: LeafletMap,
  radiusPx: number,
): ClusteredMarker[] {
  if (markers.length === 0) return [];

  const withPixels = markers.map((marker) => ({
    marker,
    pixel: map.latLngToContainerPoint([marker.coordinates[1], marker.coordinates[0]]),
  }));

  const clusters: ClusteredMarker[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < withPixels.length; i++) {
    if (assigned.has(i)) continue;

    const members: ActivityMarker[] = [withPixels[i].marker];
    assigned.add(i);

    for (let j = i + 1; j < withPixels.length; j++) {
      if (assigned.has(j)) continue;
      const dx = withPixels[i].pixel.x - withPixels[j].pixel.x;
      const dy = withPixels[i].pixel.y - withPixels[j].pixel.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) {
        members.push(withPixels[j].marker);
        assigned.add(j);
      }
    }

    let totalLng = 0;
    let totalLat = 0;
    let totalWeight = 0;
    let totalActivityCount = 0;
    const hashtagCounts = new Map<string, number>();
    for (const m of members) {
      const w = m.activityCount;
      totalLng += m.coordinates[0] * w;
      totalLat += m.coordinates[1] * w;
      totalWeight += w;
      totalActivityCount += w;
      if (m.topHashtag) {
        hashtagCounts.set(m.topHashtag, (hashtagCounts.get(m.topHashtag) ?? 0) + w);
      }
    }

    const topHashtag = hashtagCounts.size > 0
      ? Array.from(hashtagCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : undefined;

    clusters.push({
      id: members.map((m) => m.countryCode).sort().join('-'),
      coordinates: [totalLng / totalWeight, totalLat / totalWeight],
      markers: members,
      totalActivityCount,
      topHashtag,
    });
  }

  return clusters;
}

// ── Marker components ───────────────────────────────────────────────────────

function ActivityMarkerComponent({
  marker,
  isMobile,
}: {
  marker: ActivityMarker;
  isMobile?: boolean;
}) {
  const map = useMap();
  const baseSize = sizeScale(Math.min(marker.activityCount, 100));
  const size = marker.topHashtag ? baseSize * 1.25 : baseSize;
  const opacityMultiplier = marker.activityCount < 10 ? 0.6 : 1;

  const handleOpenChange = (open: boolean) => {
    if (open && isMobile) {
      map.panTo([marker.coordinates[1], marker.coordinates[0]]);
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${marker.countryCode}: ${marker.activityCount} posts`}
          className="relative flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
          style={{ width: size, height: size }}
        >
          {/* Outer animated halo. */}
          <div
            className="absolute inset-0 rounded-full bg-primary animate-accent-glow blur-md"
            style={{ transform: 'scale(1.5)', opacity: 0.4 * opacityMultiplier }}
          />
          <div
            className="absolute inset-0 rounded-full bg-primary animate-pulse blur-sm"
            style={{ transform: 'scale(1.35)', opacity: 0.3 * opacityMultiplier }}
          />
          <div
            className="absolute inset-0 rounded-full bg-primary"
            style={{ transform: 'scale(1.2)', opacity: 0.25 * opacityMultiplier }}
          />
          {/* Solid core — brightness scales subtly with activity. */}
          <div
            className="absolute inset-0 rounded-full shadow-[0_0_20px_rgba(234,88,12,0.6)] group-hover:shadow-[0_0_30px_rgba(234,88,12,0.8)] transition-shadow"
            style={{
              background: `linear-gradient(135deg,
                hsl(15 90% ${Math.max(40, Math.min(55, 40 + marker.activityCount * 0.3))}%) 0%,
                hsl(15 90% ${Math.max(35, Math.min(50, 35 + marker.activityCount * 0.3))}%) 50%,
                hsl(15 90% ${Math.max(30, Math.min(45, 30 + marker.activityCount * 0.3))}%) 100%)`,
              opacity: opacityMultiplier,
            }}
          />
          <div className="relative z-10 flex flex-col items-center justify-center">
            <span
              className="text-white font-bold leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              style={{ fontSize: Math.max(11, size * 0.3) }}
            >
              {marker.activityCount}
            </span>
            {marker.topHashtag && size >= 32 && (
              <span
                className="text-white font-semibold leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mt-0.5"
                style={{ fontSize: Math.max(8, size * 0.2) }}
              >
                #{marker.topHashtag}
              </span>
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          '!w-auto p-0 border-0 shadow-xl z-[10000]',
          isMobile && '!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2',
        )}
        side={isMobile ? undefined : 'top'}
        sideOffset={isMobile ? 0 : 10}
        collisionPadding={isMobile ? undefined : { top: 16, bottom: 16, left: 16, right: 16 }}
        avoidCollisions={!isMobile}
      >
        <CountryActivityPopover
          countryCode={marker.countryCode}
          activityCount={marker.activityCount}
          topHashtag={marker.topHashtag}
          isMobile={isMobile}
        />
      </PopoverContent>
    </Popover>
  );
}

function ClusterPopover({ cluster, isMobile }: { cluster: ClusteredMarker; isMobile?: boolean }) {
  return (
    <Card
      className={cn(
        'border-primary/20 bg-popover/95 backdrop-blur-sm shadow-lg',
        isMobile ? 'w-[88vw] max-w-sm' : 'w-72',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {cluster.markers.length} countries — {cluster.totalActivityCount.toLocaleString()} posts
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-56">
          <div className="space-y-1 pr-2">
            {cluster.markers
              .slice()
              .sort((a, b) => b.activityCount - a.activityCount)
              .map((marker) => {
                const upper = marker.countryCode.toUpperCase();
                const parent = upper.includes('-') ? upper.split('-')[0] : upper;
                const name = COUNTRIES[parent]?.name ?? parent;
                const flag = COUNTRIES[parent]?.flag ?? '';
                return (
                  <Link
                    key={marker.countryCode}
                    to={`/i/iso3166:${parent}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-secondary transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none" role="img" aria-hidden="true">
                        {flag}
                      </span>
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {marker.activityCount.toLocaleString()}
                    </span>
                  </Link>
                );
              })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ClusterMarkerComponent({
  cluster,
  isMobile,
}: {
  cluster: ClusteredMarker;
  isMobile?: boolean;
}) {
  const map = useMap();
  const baseSize = clusterSizeScale(Math.min(cluster.totalActivityCount, 500));
  const size = cluster.topHashtag ? baseSize * 1.25 : baseSize;
  const opacityMultiplier = cluster.totalActivityCount < 10 ? 0.6 : 1;

  const handleOpenChange = (open: boolean) => {
    if (open && isMobile) {
      map.panTo([cluster.coordinates[1], cluster.coordinates[0]]);
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${cluster.markers.length} countries, ${cluster.totalActivityCount} posts`}
          className="relative flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
          style={{ width: size, height: size }}
        >
          <div
            className="absolute inset-0 rounded-full bg-primary animate-accent-glow blur-lg"
            style={{ transform: 'scale(1.6)', opacity: 0.5 * opacityMultiplier }}
          />
          <div
            className="absolute inset-0 rounded-full bg-primary animate-pulse blur-md"
            style={{ transform: 'scale(1.45)', opacity: 0.35 * opacityMultiplier }}
          />
          <div
            className="absolute inset-0 rounded-full bg-primary"
            style={{ transform: 'scale(1.25)', opacity: 0.25 * opacityMultiplier }}
          />
          <div
            className="absolute inset-0 rounded-full shadow-[0_0_25px_rgba(234,88,12,0.7)] group-hover:shadow-[0_0_35px_rgba(234,88,12,0.9)] transition-shadow"
            style={{
              background: `linear-gradient(135deg,
                hsl(15 90% ${Math.max(45, Math.min(58, 45 + cluster.totalActivityCount * 0.08))}%) 0%,
                hsl(15 90% ${Math.max(40, Math.min(53, 40 + cluster.totalActivityCount * 0.08))}%) 50%,
                hsl(15 90% ${Math.max(35, Math.min(48, 35 + cluster.totalActivityCount * 0.08))}%) 100%)`,
              opacity: opacityMultiplier,
            }}
          />
          <div className="relative z-10 flex flex-col items-center justify-center">
            <span
              className="text-white font-bold leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              style={{ fontSize: Math.max(12, size * 0.28) }}
            >
              {cluster.totalActivityCount}
            </span>
            {cluster.topHashtag && size >= 44 && (
              <span
                className="text-white font-semibold leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mt-0.5"
                style={{ fontSize: Math.max(9, size * 0.19) }}
              >
                #{cluster.topHashtag}
              </span>
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          '!w-auto p-0 border-0 shadow-xl z-[10000]',
          isMobile && '!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2',
        )}
        side={isMobile ? undefined : 'top'}
        sideOffset={isMobile ? 0 : 10}
        collisionPadding={isMobile ? undefined : { top: 16, bottom: 16, left: 16, right: 16 }}
        avoidCollisions={!isMobile}
      >
        <ClusterPopover cluster={cluster} isMobile={isMobile} />
      </PopoverContent>
    </Popover>
  );
}

// ── DOM overlay ─────────────────────────────────────────────────────────────
//
// React markers live in an HTML overlay positioned in pixel space. We listen
// to Leaflet move/zoom events and force a re-render so each marker is
// translated to follow the map.

function MarkersOverlay({
  activityMarkers,
  isMobile,
}: {
  activityMarkers: ActivityMarker[];
  isMobile?: boolean;
}) {
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

  const clusteredMarkers = useMemo(() => {
    if (!shouldCluster || activityMarkers.length <= 1) return null;
    return clusterMarkers(activityMarkers, map, CLUSTER_RADIUS_PX);
    // Re-cluster on zoom changes too, since pixel positions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityMarkers, map, shouldCluster, zoom]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', zIndex: 1000 }}>
      {shouldCluster && clusteredMarkers
        ? clusteredMarkers.map((cluster) => {
            const pos = getPixel(cluster.coordinates[0], cluster.coordinates[1]);
            if (pos.x === 0 && pos.y === 0) return null;
            const node =
              cluster.markers.length === 1 ? (
                <ActivityMarkerComponent marker={cluster.markers[0]} isMobile={isMobile} />
              ) : (
                <ClusterMarkerComponent cluster={cluster} isMobile={isMobile} />
              );
            return (
              <div
                key={cluster.id}
                className="absolute pointer-events-auto"
                style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
              >
                {node}
              </div>
            );
          })
        : activityMarkers.map((marker) => {
            const pos = getPixel(marker.coordinates[0], marker.coordinates[1]);
            if (pos.x === 0 && pos.y === 0) return null;
            return (
              <div
                key={marker.countryCode}
                className="absolute pointer-events-auto"
                style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
              >
                <ActivityMarkerComponent marker={marker} isMobile={isMobile} />
              </div>
            );
          })}
    </div>
  );
}

// ── Map plumbing ────────────────────────────────────────────────────────────

/** Force Leaflet to recompute its size after layout changes. */
function MapSizeController() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    // Watch the map's own container — sidebars, drawers, and lazy-loaded
    // panels can change our width without firing window resize, which
    // leaves Leaflet computing marker positions against the wrong size and
    // pushes the bubbles off-screen.
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

interface WorldMapProps {
  /** Map of country/subdivision code → activity count. */
  activities: Map<string, number>;
  /** Map of country code → top trending hashtag (no leading `#`). */
  topHashtags?: Map<string, string>;
  /** Triggered when the underlying tile layer finishes initial load. */
  onMapReady?: () => void;
}

/**
 * Pannable, zoomable world map of community activity. Each country with at
 * least one comment in the latest kind 30385 snapshot gets a glowing bubble;
 * clicking it surfaces a popover that links into the existing
 * `/i/iso3166:XX` country feed. At low zoom levels nearby bubbles fold into
 * clusters with a roll-up popover.
 *
 * Intentionally pared back from Pathos's MapView: no ephemeral chat markers
 * (deferred to §3.11), no Bermuda Triangle easter egg, no SVG mesh lines.
 */
export function WorldMap({ activities, topHashtags, onMapReady }: WorldMapProps) {
  const isMobile = useIsMobile();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Track theme by observing the `dark` class on <html> — works for any
  // theming strategy (system / light / dark / custom).
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const activityMarkers = useMemo<ActivityMarker[]>(() => {
    const result: ActivityMarker[] = [];
    activities.forEach((count, code) => {
      if (count <= 0) return;
      let coordinates: [number, number] | undefined;
      if (isSubdivisionFormat(code)) {
        coordinates = getSubdivisionCoordinates(code) ?? getCountryCoordinates(code.split('-')[0]);
      } else {
        coordinates = getCountryCoordinates(code);
      }
      if (!coordinates) return;
      result.push({
        countryCode: code,
        coordinates,
        activityCount: count,
        topHashtag: topHashtags?.get(code),
      });
    });
    return result;
  }, [activities, topHashtags]);

  return (
    <div ref={containerRef} className="w-full h-full relative isolate">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={10}
        style={{ height: '100%', width: '100%', background: 'transparent' }}
        zoomControl={true}
        attributionControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        worldCopyJump={true}
        preferCanvas={true}
        whenReady={() => onMapReady?.()}
      >
        <TileLayer
          attribution={ATTRIBUTION}
          url={isDark ? POSITRON_DARK_URL : POSITRON_LIGHT_URL}
          maxZoom={19}
          minZoom={2}
        />
        <MapSizeController />
        <MarkersOverlay activityMarkers={activityMarkers} isMobile={isMobile} />
      </MapContainer>
    </div>
  );
}

// Default export so the page can `React.lazy(() => import('./WorldMap'))`.
export default WorldMap;
