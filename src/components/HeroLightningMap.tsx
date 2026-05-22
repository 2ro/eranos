import { memo, useId, useMemo } from 'react';

import { LAND_RINGS } from '@/lib/landPolygons';
import { cn } from '@/lib/utils';

/**
 * Decorative dark world map with glowing brand-orange Lightning arcs and
 * pulsing city nodes. Designed as a hero backdrop on near-black surfaces:
 * type sits comfortably over it without any text shadow.
 *
 * Composition (back to front):
 *   1. Equirectangular world map drawn from {@link LAND_RINGS} — barely
 *      lit so it reads as texture, not focus.
 *   2. Central radial glow tinted in brand orange behind the visual
 *      center of gravity.
 *   3. Curated set of arcs between major cities, drawn as quadratic
 *      Bézier paths with a flowing dash animation (the "lightning" hops).
 *   4. Pulsing dot at every endpoint, with a soft halo.
 *
 * The data is intentionally curated — no campaign coupling. The map is a
 * brand visual, not a state visualization. Arc list lives at the bottom
 * of this file and can be swapped freely without touching layout.
 *
 * Pure SVG, no WebGL, no canvas. ~12 arcs + ~150 polygons — render cost
 * is negligible. Animations honor `prefers-reduced-motion`.
 */
function HeroLightningMapImpl({ className }: { className?: string }) {
  const uid = useId();
  const arcId = (key: string) => `${uid}-${key}`;

  // viewBox is the equirectangular world: 360 wide × 180 tall, recentered
  // so (0,0) is the geographic origin. We project [lng, lat] -> [lng, -lat]
  // (SVG y grows downward).
  const W = 360;
  const H = 180;

  const landPaths = useMemo(() => {
    return LAND_RINGS.map((ring, idx) => {
      // Rings are flat [lng, lat, lng, lat, ...]. Convert to an SVG path.
      let d = '';
      for (let i = 0; i < ring.length; i += 2) {
        const lng = ring[i];
        const lat = ring[i + 1];
        d += i === 0 ? `M${lng.toFixed(2)} ${(-lat).toFixed(2)}` : `L${lng.toFixed(2)} ${(-lat).toFixed(2)}`;
      }
      d += 'Z';
      return <path key={idx} d={d} />;
    });
  }, []);

  // All endpoints across the curated arc set, deduplicated, so we render
  // one pulsing node per city even if multiple arcs share it.
  const nodes = useMemo(() => {
    const seen = new Map<string, { lng: number; lat: number }>();
    for (const arc of CURATED_ARCS) {
      const a = `${arc.from[0]},${arc.from[1]}`;
      const b = `${arc.to[0]},${arc.to[1]}`;
      if (!seen.has(a)) seen.set(a, { lng: arc.from[0], lat: arc.from[1] });
      if (!seen.has(b)) seen.set(b, { lng: arc.to[0], lat: arc.to[1] });
    }
    return Array.from(seen.values());
  }, []);

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}
      aria-hidden="true"
    >
      {/* Central radial brand-orange glow. Sits behind the map texture so
          the map reads as illuminated by it, not pasted over it. Position
          biased slightly right so the headline column on the left stays
          on the cooler side of the glow. */}
      <div
        className="absolute -inset-[10%]"
        style={{
          background:
            'radial-gradient(60% 55% at 62% 45%, hsl(24 100% 55% / 0.32) 0%, hsl(24 95% 50% / 0.18) 28%, hsl(220 30% 8% / 0) 65%)',
        }}
      />

      <svg
        viewBox={`-${W / 2} -${H / 2} ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          {/* Land fill — very low alpha brand-orange so the continents
              read as faint glowing outlines on the dark backdrop. */}
          <linearGradient id={arcId('land')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(24 80% 50%)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="hsl(24 70% 45%)" stopOpacity="0.06" />
          </linearGradient>

          {/* Arc gradient — bright at midpoint, fading at endpoints, so
              the line reads as energy traveling rather than a solid wire. */}
          <linearGradient id={arcId('arc')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(24 100% 60%)" stopOpacity="0.0" />
            <stop offset="35%" stopColor="hsl(24 100% 60%)" stopOpacity="0.85" />
            <stop offset="65%" stopColor="hsl(30 100% 65%)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(30 100% 65%)" stopOpacity="0.0" />
          </linearGradient>

          {/* Glow filter for arcs and nodes — wider and softer than a CSS
              shadow, and crucially, applied inside the SVG so it scales
              cleanly with the viewBox. */}
          <filter id={arcId('glow')} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Stronger glow for the nodes themselves so they punch through
              the arcs at intersections. */}
          <radialGradient id={arcId('node-halo')}>
            <stop offset="0%" stopColor="hsl(30 100% 70%)" stopOpacity="0.9" />
            <stop offset="40%" stopColor="hsl(24 100% 55%)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(24 100% 50%)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Land — single fill, single stroke, drawn as one group so the
            browser batches it. Stroke is what makes the continents legible
            on near-black; fill is just a quiet wash. */}
        <g
          fill={`url(#${arcId('land')})`}
          stroke="hsl(24 75% 50% / 0.32)"
          strokeWidth="0.18"
          strokeLinejoin="round"
        >
          {landPaths}
        </g>

        {/* Arcs. Each arc is a quadratic Bézier with the control point
            lifted above the great-circle path, giving the curved silhouette
            from the reference. Stroke-dasharray + animated stroke-dashoffset
            produces the flowing-energy effect. */}
        <g
          fill="none"
          stroke={`url(#${arcId('arc')})`}
          strokeWidth="0.45"
          strokeLinecap="round"
          filter={`url(#${arcId('glow')})`}
        >
          {CURATED_ARCS.map((arc, i) => {
            const [x1, y1] = [arc.from[0], -arc.from[1]];
            const [x2, y2] = [arc.to[0], -arc.to[1]];
            // Lift the control point perpendicular to the chord. The lift
            // amount scales with chord length so short arcs stay tight
            // and trans-oceanic arcs sweep dramatically.
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            const lift = Math.min(45, len * 0.32);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            // Control point biased "north" (negative y in SVG space) so
            // arcs always curve upward over the equator. Looks more
            // intentional than projecting the true great-circle.
            const cx = mx;
            const cy = my - lift;
            return (
              <path
                key={i}
                d={`M${x1.toFixed(2)} ${y1.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`}
                className="hero-arc-flow"
                style={{
                  // Stagger each arc's animation so the flow feels
                  // organic, not lockstep.
                  animationDelay: `${(i * 0.43).toFixed(2)}s`,
                }}
              />
            );
          })}
        </g>

        {/* City nodes. Two layers per node: a soft halo behind, a hot dot
            in front. Halo is what reads at distance; dot is what reads up
            close. */}
        <g>
          {nodes.map((n, i) => {
            const x = n.lng;
            const y = -n.lat;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r="2.2"
                  fill={`url(#${arcId('node-halo')})`}
                  className="hero-node-pulse"
                  style={{ animationDelay: `${(i * 0.31).toFixed(2)}s` }}
                />
                <circle
                  cx={x}
                  cy={y}
                  r="0.55"
                  fill="hsl(36 100% 70%)"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Left-edge gradient mask — ensures the headline column always has
          a quiet zone behind it regardless of where arcs land. This is
          what replaces the old hero-text-shadow: structural legibility,
          not a per-character text effect. */}
      <div
        className="absolute inset-y-0 left-0 w-2/3 lg:w-1/2"
        style={{
          background:
            'linear-gradient(to right, hsl(220 25% 6% / 0.92) 0%, hsl(220 25% 6% / 0.65) 35%, hsl(220 25% 6% / 0) 100%)',
        }}
      />

      {/* Bottom vignette — anchors the hero to the page below and softens
          the map texture as it meets the next section. */}
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{
          background: 'linear-gradient(to bottom, hsl(220 25% 6% / 0) 0%, hsl(220 25% 6% / 0.85) 100%)',
        }}
      />
    </div>
  );
}

export const HeroLightningMap = memo(HeroLightningMapImpl);

/**
 * Hand-picked arcs between major activist hubs across continents. Order
 * matters only for the staggered animation start times — pairs are
 * otherwise independent. Coordinates are `[lng, lat]` in degrees.
 *
 * Edit freely. Twelve arcs is roughly the sweet spot — fewer feels
 * sparse, more turns into a tangle that competes with the headline.
 */
const CURATED_ARCS: ReadonlyArray<{
  from: readonly [number, number];
  to: readonly [number, number];
}> = [
  // Trans-Atlantic — North America ↔ Europe / Africa
  { from: [-74.0, 40.7], to: [-0.1, 51.5] },     // New York → London
  { from: [-122.4, 37.8], to: [13.4, 52.5] },    // San Francisco → Berlin
  { from: [-79.4, 43.7], to: [2.35, 48.9] },     // Toronto → Paris
  { from: [-0.1, 51.5], to: [3.4, 6.5] },        // London → Lagos
  // Trans-Pacific — Americas ↔ Asia / Oceania
  { from: [-118.2, 34.0], to: [139.7, 35.7] },   // Los Angeles → Tokyo
  { from: [-99.1, 19.4], to: [121.5, 25.0] },    // Mexico City → Taipei
  { from: [151.2, -33.9], to: [-122.4, 37.8] },  // Sydney → San Francisco
  // South America bridges
  { from: [-58.4, -34.6], to: [-43.2, -22.9] },  // Buenos Aires → Rio
  { from: [-43.2, -22.9], to: [3.4, 6.5] },      // Rio → Lagos
  // Asia / Africa lattice
  { from: [77.2, 28.6], to: [55.3, 25.3] },      // Delhi → Dubai
  { from: [55.3, 25.3], to: [31.2, 30.0] },      // Dubai → Cairo
  { from: [31.2, 30.0], to: [13.4, 52.5] },      // Cairo → Berlin
  { from: [103.8, 1.35], to: [121.5, 25.0] },    // Singapore → Taipei
  { from: [18.4, -33.9], to: [3.4, 6.5] },       // Cape Town → Lagos
];
