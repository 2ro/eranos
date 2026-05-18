import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { LAND_RINGS } from '@/lib/landPolygons';
import { HOPE_PALETTE, type HopeHue } from '@/lib/hopePalette';

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
  /** Tooltip / accessible label shown on hover. */
  label?: string;
}

interface HeroGlobeProps {
  /** Markers to plot on top of the globe — one per geo-located campaign. */
  markers?: CampaignMarker[];
  /**
   * Marker the user has selected. The selected marker gets a stronger glow
   * and a slightly larger heart so it reads as the "live" one.
   */
  selectedKey?: string | null;
  /** Fires when the user clicks a marker. */
  onMarkerClick?: (key: string) => void;
  /**
   * Active hopeful hue. Drives the outer halo color and the back-lit
   * limb tint so the globe agrees with the surrounding {@link HeroAtmosphere}.
   */
  hue?: HopeHue;
  /** Optional className applied to the outer container. */
  className?: string;
  /** Optional inline style applied to the outer container (e.g. fluid width via `clamp()`). */
  style?: CSSProperties;
}

/** Pre-parsed land rings as arrays of {lat, lng} points. */
const LANDMASSES: readonly GeoPoint[][] = LAND_RINGS.map((flat) => {
  const out: GeoPoint[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ lng: flat[i], lat: flat[i + 1] });
  }
  return out;
});

const RADIUS = 285;
const CENTER = 300;
/** Seconds per full revolution. Slow on purpose so the motion is ambient. */
const ROTATION_PERIOD_SECONDS = 140;

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
export function HeroGlobe({
  markers = [],
  selectedKey = null,
  onMarkerClick,
  hue = HOPE_PALETTE[0],
  className,
  style,
}: HeroGlobeProps) {
  const landRef = useRef<SVGGElement | null>(null);
  const markersRef = useRef<SVGGElement | null>(null);

  // Stable per-ring point counts so the animation loop knows how many polygon
  // elements to update without re-reading the DOM each frame.
  const ringSizes = useMemo(() => LANDMASSES.map((r) => r.length), []);

  // Live refs so the rAF loop can read the latest markers / selection
  // without retriggering the effect — otherwise every spotlight tick
  // would tear down the loop and snap rotation back to 0°.
  const markersRefValue = useRef(markers);
  const selectedKeyRef = useRef(selectedKey);
  useEffect(() => {
    markersRefValue.current = markers;
    selectedKeyRef.current = selectedKey;
  }, [markers, selectedKey]);

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
      //
      // For each ring we walk vertex-by-vertex projecting through the
      // orthographic camera. Vertices on the *front* of the sphere
      // (z > 0) are kept as-is. Vertices on the *back* (z < 0) would
      // otherwise project on top of front-side land — orthographic
      // projection collapses depth — so we drop them.
      //
      // Where a ring crosses the visible limb (front ↔ back) we emit an
      // interpolated point on the limb itself, so polygons that wrap
      // around the side of the globe close cleanly along the sphere's
      // outline instead of cutting across the disc interior.
      //
      // We also fade rings out over a narrow band near the limb so they
      // don't pop on/off when crossing z = 0. Anything with maxZ below
      // FADE_OUT is considered fully hidden; rings between FADE_OUT and
      // FADE_IN ease in/out.
      const FADE_OUT = 0.0;
      const FADE_IN = 0.08;
      const landEl = landRef.current;
      if (landEl) {
        const polygons = landEl.children;
        for (let i = 0; i < LANDMASSES.length; i++) {
          const ring = LANDMASSES[i];
          const polygon = polygons[i] as SVGPolygonElement | undefined;
          if (!polygon) continue;

          // First pass: project every vertex, remembering z so we can
          // detect front/back transitions cheaply.
          const n = ring.length;
          const xs = new Array<number>(n);
          const ys = new Array<number>(n);
          const zs = new Array<number>(n);
          let maxZ = -1;
          for (let j = 0; j < n; j++) {
            const p = project(ring[j].lat, ring[j].lng, rotation);
            xs[j] = p.x;
            ys[j] = p.y;
            zs[j] = p.z;
            if (p.z > maxZ) maxZ = p.z;
          }
          if (maxZ <= FADE_OUT) {
            polygon.setAttribute('opacity', '0');
            continue;
          }

          // Second pass: emit only the visible portion. For each edge we
          // include the endpoint when it's in front, and any limb-crossing
          // we step over gets an interpolated point on the sphere edge.
          const parts: string[] = [];
          for (let j = 0; j < n; j++) {
            const k = (j + 1) % n;
            const zj = zs[j];
            const zk = zs[k];
            if (zj > 0) parts.push(`${xs[j].toFixed(1)},${ys[j].toFixed(1)}`);
            if ((zj > 0) !== (zk > 0)) {
              // Find the parameter t in [0,1] along this edge where z=0.
              const t = zj / (zj - zk);
              const ex = xs[j] + (xs[k] - xs[j]) * t;
              const ey = ys[j] + (ys[k] - ys[j]) * t;
              // Project the limb point onto the actual sphere edge so it
              // never lands inside the disc.
              const dx = ex - CENTER;
              const dy = ey - CENTER;
              const d = Math.hypot(dx, dy) || 1;
              const lx = CENTER + (dx / d) * RADIUS;
              const ly = CENTER + (dy / d) * RADIUS;
              parts.push(`${lx.toFixed(1)},${ly.toFixed(1)}`);
            }
          }
          if (parts.length < 3) {
            polygon.setAttribute('opacity', '0');
            continue;
          }
          polygon.setAttribute('points', parts.join(' '));
          // Smooth fade as rings come around the limb. `fade` clamps to
          // [0,1] over the narrow FADE_OUT→FADE_IN band, then we keep
          // adding the small depth-based dimming used before.
          const fade = Math.min(1, Math.max(0, (maxZ - FADE_OUT) / (FADE_IN - FADE_OUT)));
          polygon.setAttribute('opacity', (fade * Math.min(1, 0.55 + maxZ * 0.55)).toFixed(2));
        }
      }

      // --- Campaign markers ---
      const markersEl = markersRef.current;
      const liveMarkers = markersRefValue.current;
      const liveSelectedKey = selectedKeyRef.current;
      if (markersEl) {
        const groups = markersEl.children;
        for (let i = 0; i < liveMarkers.length; i++) {
          const m = liveMarkers[i];
          const group = groups[i] as SVGGElement | undefined;
          if (!group) continue;
          const p = project(m.lat, m.lng, rotation);
          if (p.z <= 0) {
            group.setAttribute('opacity', '0');
            // Pull off-canvas so backside markers don't intercept clicks.
            group.setAttribute('transform', 'translate(-1000 -1000)');
            continue;
          }
          // Selected marker scales up subtly to read as "you are here".
          const scale = m.key === liveSelectedKey ? 1.35 : 1;
          group.setAttribute(
            'transform',
            `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${scale})`,
          );
          group.setAttribute('opacity', (0.55 + p.z * 0.45).toFixed(2));
        }
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // `markers` and `selectedKey` are read inside `tick` via refs above,
    // so we deliberately omit them from this dep list to keep the
    // rotation loop alive across spotlight cycles.
  }, [ringSizes]);

  return (
    <div className={className} style={style}>
      {/* Wrapper so the outer halo can sit behind the SVG. The halo is a
          plain div (not part of the SVG) so its blur extends past the
          sphere without needing a giant viewBox, and so we can drive it
          with a CSS keyframe animation independent of the rotation. */}
      <div className="relative size-full">
        {/* Outer atmospheric halo. Scaled larger than the wrapper so light
            spills out into the photo, blurred for softness, and tinted
            with the active campaign's hopeful hue. Breathes slowly via
            the .hero-globe-halo-breath class defined in index.css. */}
        <div
          className="hero-globe-halo-breath absolute inset-[-15%] pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `radial-gradient(closest-side, ${hue.glow} 0%, ${hue.rim} 30%, transparent 70%)`,
            filter: 'blur(40px)',
            // background-image isn't actually transitionable across
            // gradient stops in CSS, but keeping the declaration here
            // documents that the hue swap is driven by React re-renders
            // synced to the HeroAtmosphere crossfade.
          }}
        />

        <svg
          viewBox="0 0 600 600"
          className="relative size-full"
          role="img"
          aria-label="Globe showing locations of active fundraising campaigns"
          focusable="false"
        >
        <defs>
          {/* Sphere base: warm dawn gold lit from the upper-left, fading
              into a deeper honey shadow on the lower-right. The whole
              sphere is meant to read as "lit from within" — like the
              moment before sunrise — not as a slab of dirt. */}
          <radialGradient id="hero-globe-base" cx="32%" cy="28%" r="78%">
            <stop offset="0%" stopColor="hsl(46 100% 96% / 0.92)" />
            <stop offset="40%" stopColor="hsl(38 90% 82% / 0.82)" />
            <stop offset="100%" stopColor="hsl(28 65% 60% / 0.72)" />
          </radialGradient>
          {/* Back-lit limb light. Reads as light pooling on the inside of
              the sphere edge — Earthrise rather than satellite. Tinted
              with the active hopeful hue, kept narrow + low-opacity so it
              feels like atmosphere, not a neon ring. */}
          <radialGradient id="hero-globe-rim" cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor={hue.rim} stopOpacity="0" />
            <stop offset="97%" stopColor={hue.rim} stopOpacity="0.55" />
            <stop offset="100%" stopColor={hue.glow} stopOpacity="0" />
          </radialGradient>
          {/* Soft highlight in the upper-left to sell the sphere shape. */}
          <radialGradient id="hero-globe-highlight" cx="28%" cy="22%" r="38%">
            <stop offset="0%" stopColor="hsl(50 100% 98% / 0.85)" />
            <stop offset="100%" stopColor="hsl(50 100% 98% / 0)" />
          </radialGradient>
          {/* Marker glow halo. Soft, warm, no pulsing. */}
          <radialGradient id="hero-marker-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          {/* Stronger halo used for the selected marker so it visibly leads
              the eye to whatever the spotlight card is currently showing. */}
          <radialGradient id="hero-marker-glow-active" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
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
            stroke="hsl(28 50% 40% / 0.25)"
            strokeWidth="0.3"
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

        {/* Campaign markers — a small heart glyph with a warm glow halo.
            Each marker is a button: clicking selects the campaign, which
            the parent uses to populate the spotlight card. */}
        <g ref={markersRef}>
          {markers.map((m) => {
            const isSelected = m.key === selectedKey;
            return (
              <g
                key={m.key}
                opacity={0}
                transform="translate(-1000 -1000)"
                role={onMarkerClick ? 'button' : undefined}
                tabIndex={onMarkerClick ? 0 : undefined}
                aria-label={m.label ?? 'View campaign'}
                aria-pressed={onMarkerClick ? isSelected : undefined}
                onClick={onMarkerClick ? () => onMarkerClick(m.key) : undefined}
                onKeyDown={
                  onMarkerClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onMarkerClick(m.key);
                        }
                      }
                    : undefined
                }
                style={{
                  cursor: onMarkerClick ? 'pointer' : undefined,
                  outline: 'none',
                }}
              >
                {/* Glow halo (stronger for the active marker). */}
                <circle
                  r={isSelected ? 16 : 12}
                  fill={`url(#hero-marker-glow${isSelected ? '-active' : ''})`}
                />
                {/* Heart glyph. Path is centered at the origin (~14×12 units)
                    so the parent <g>'s translate+scale lands it on the globe. */}
                <path
                  d="M0,3.5 C-3.5,1 -7,-1.5 -7,-4.5 C-7,-7 -5,-8.5 -3,-8.5 C-1.5,-8.5 -0.5,-7.5 0,-6.5 C0.5,-7.5 1.5,-8.5 3,-8.5 C5,-8.5 7,-7 7,-4.5 C7,-1.5 3.5,1 0,3.5 Z"
                  fill="hsl(var(--primary))"
                  stroke="hsl(40 100% 98%)"
                  strokeWidth="0.6"
                  strokeLinejoin="round"
                />
                {/* Tiny inner highlight to make the heart pop on the warm
                    landmass without needing a heavy outline. */}
                <ellipse cx={-2.5} cy={-5.5} rx={1.5} ry={1} fill="hsl(40 100% 98% / 0.55)" />
                {/* Transparent hit target — much easier to click/tap than the
                    tiny visible heart, especially on touch. */}
                <circle
                  r={14}
                  fill="transparent"
                  style={{ cursor: onMarkerClick ? 'pointer' : 'default' }}
                />
              </g>
            );
          })}
        </g>
      </svg>
      </div>
    </div>
  );
}
