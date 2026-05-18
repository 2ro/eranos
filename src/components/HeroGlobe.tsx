import { useEffect, useMemo, useRef } from 'react';

import { LAND_RINGS } from '@/lib/landPolygons';

/** Geographic point used by the globe projection. */
interface GeoPoint {
  /** Latitude in degrees, [-90, 90]. */
  lat: number;
  /** Longitude in degrees, [-180, 180]. */
  lng: number;
}

interface CampaignMarker extends GeoPoint {
  /** Stable key for the marker (e.g. the campaign aTag). */
  key: string;
}

interface HeroGlobeProps {
  /** Markers to plot on top of the globe — one per geo-located campaign. */
  markers?: CampaignMarker[];
  /** Optional className applied to the outer container. */
  className?: string;
}

/** Pre-parsed land rings as arrays of {lat, lng} points. */
const LANDMASSES: readonly GeoPoint[][] = LAND_RINGS.map((flat) => {
  const out: GeoPoint[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ lng: flat[i], lat: flat[i + 1] });
  }
  return out;
});

const RADIUS = 240;
const CENTER = 300;
/** Seconds per full revolution. Slow on purpose so the motion is ambient. */
const ROTATION_PERIOD_SECONDS = 90;

/**
 * Orthographic projection: turns a (lat, lng) pair into 2D screen
 * coordinates plus a `z` depth value. Points with `z <= 0` are on the
 * back hemisphere and should be hidden (or drawn with low opacity).
 */
function project(lat: number, lng: number, rotationDeg: number) {
  const phi = (lat * Math.PI) / 180;
  // Subtract rotation so the globe appears to spin west-to-east.
  const lambda = ((lng - rotationDeg) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const x = cosPhi * Math.sin(lambda);
  const y = Math.sin(phi);
  const z = cosPhi * Math.cos(lambda);
  return {
    x: CENTER + x * RADIUS,
    // Negate so positive latitudes render upward in SVG.
    y: CENTER - y * RADIUS,
    z,
  };
}

/**
 * Slowly-rotating SVG globe rendered with pure SVG (no WebGL, no canvas).
 *
 * Visuals are intentionally warm and hand-drawn rather than satellite/HUD:
 *  - a soft cream sphere lit from the upper-left,
 *  - sandy-amber landmasses (real Natural Earth continent shapes,
 *    pre-simplified to ~1.5k vertices), and
 *  - small glowing marker dots for active campaigns.
 *
 * Rotation is driven by `requestAnimationFrame` and applied imperatively via
 * refs so the component never re-renders during animation. Respects
 * `prefers-reduced-motion` by holding at a static angle.
 */
export function HeroGlobe({ markers = [], className }: HeroGlobeProps) {
  const landRef = useRef<SVGGElement | null>(null);
  const markersRef = useRef<SVGGElement | null>(null);

  // Stable per-ring point counts so the animation loop knows how many polygon
  // elements to update without re-reading the DOM each frame.
  const ringSizes = useMemo(() => LANDMASSES.map((r) => r.length), []);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let start: number | null = null;

    const tick = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsedSeconds = (timestamp - start) / 1000;
      const rotation = prefersReducedMotion
        ? 25 // Hold at a flattering static angle.
        : (elapsedSeconds / ROTATION_PERIOD_SECONDS) * 360;

      // --- Landmass polygons ---
      const landEl = landRef.current;
      if (landEl) {
        const polygons = landEl.children;
        for (let i = 0; i < LANDMASSES.length; i++) {
          const ring = LANDMASSES[i];
          const polygon = polygons[i] as SVGPolygonElement | undefined;
          if (!polygon) continue;
          // Project every vertex; if the whole ring is on the back hemisphere
          // we just hide it. Rings that straddle the limb are clipped by the
          // sphere mask defined in <defs>, so we can emit them unmodified.
          let maxZ = -1;
          const parts: string[] = [];
          for (let j = 0; j < ring.length; j++) {
            const p = project(ring[j].lat, ring[j].lng, rotation);
            if (p.z > maxZ) maxZ = p.z;
            parts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          }
          if (maxZ <= 0) {
            polygon.setAttribute('opacity', '0');
            continue;
          }
          polygon.setAttribute('points', parts.join(' '));
          // Slightly fade rings sitting close to the limb so the sphere
          // edges feel less hard.
          polygon.setAttribute('opacity', Math.min(1, 0.5 + maxZ * 0.6).toFixed(2));
        }
      }

      // --- Campaign markers ---
      const markersEl = markersRef.current;
      if (markersEl) {
        const groups = markersEl.children;
        for (let i = 0; i < markers.length; i++) {
          const m = markers[i];
          const group = groups[i] as SVGGElement | undefined;
          if (!group) continue;
          const p = project(m.lat, m.lng, rotation);
          if (p.z <= 0) {
            group.setAttribute('opacity', '0');
            continue;
          }
          group.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
          group.setAttribute('opacity', (0.55 + p.z * 0.45).toFixed(2));
        }
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [markers, ringSizes]);

  return (
    <div className={className} aria-hidden="true">
      <svg
        viewBox="0 0 600 600"
        className="size-full"
        role="presentation"
        focusable="false"
      >
        <defs>
          {/* Sphere base: warm cream lit from the upper-left, fading to a
              slightly cooler shadow on the lower-right. Deliberately
              non-blue to avoid the satellite/HUD look. */}
          <radialGradient id="hero-globe-base" cx="35%" cy="32%" r="75%">
            <stop offset="0%" stopColor="hsl(40 90% 96%)" />
            <stop offset="55%" stopColor="hsl(34 60% 86%)" />
            <stop offset="100%" stopColor="hsl(28 35% 70%)" />
          </radialGradient>
          {/* Subtle warm rim light along the limb. */}
          <radialGradient id="hero-globe-rim" cx="50%" cy="50%" r="50%">
            <stop offset="93%" stopColor="hsl(30 80% 70% / 0)" />
            <stop offset="100%" stopColor="hsl(30 70% 55% / 0.55)" />
          </radialGradient>
          {/* Soft highlight in the upper-left to sell the sphere shape. */}
          <radialGradient id="hero-globe-highlight" cx="30%" cy="25%" r="35%">
            <stop offset="0%" stopColor="hsl(50 100% 98% / 0.7)" />
            <stop offset="100%" stopColor="hsl(50 100% 98% / 0)" />
          </radialGradient>
          {/* Marker glow halo. */}
          <radialGradient id="hero-marker-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          {/* Clip everything to the sphere so polygons straddling the
              terminator don't leak outside the circle. */}
          <clipPath id="hero-globe-clip">
            <circle cx={CENTER} cy={CENTER} r={RADIUS} />
          </clipPath>
        </defs>

        {/* Base sphere with light shading. */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#hero-globe-base)" />

        {/* Landmasses, clipped to the sphere. */}
        <g clipPath="url(#hero-globe-clip)">
          <g
            ref={landRef}
            fill="hsl(30 55% 52%)"
            stroke="hsl(28 50% 40% / 0.35)"
            strokeWidth="0.6"
            strokeLinejoin="round"
          >
            {LANDMASSES.map((_, i) => (
              <polygon key={i} opacity={0} />
            ))}
          </g>
        </g>

        {/* Warm highlight + rim shading sit above the land so the sphere
            still reads as a lit ball, not a flat map. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="url(#hero-globe-highlight)"
          pointerEvents="none"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="url(#hero-globe-rim)"
          pointerEvents="none"
        />

        {/* Campaign markers — a soft halo and a small solid dot. No pulsing,
            no targeting reticle, no "ping" animation. */}
        <g ref={markersRef}>
          {markers.map((m) => (
            <g key={m.key} opacity={0} transform="translate(-10 -10)">
              <circle r={11} fill="url(#hero-marker-glow)" />
              <circle r={3} fill="hsl(var(--primary))" />
              <circle r={1.2} fill="hsl(40 100% 96%)" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
