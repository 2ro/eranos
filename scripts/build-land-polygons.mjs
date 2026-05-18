// Build a heavily-simplified land-polygon dataset for the hero globe.
//
// Input: Natural Earth 110m countries TopoJSON
//   (https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json)
//
// Output: src/lib/landPolygons.ts — an array of rings (each ring is a flat
//   array [lng0, lat0, lng1, lat1, ...]) representing landmasses.
//
// Run with: node scripts/build-land-polygons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const INPUT = process.argv[2] ?? '/tmp/opencode/countries-110m.json';
const OUTPUT = path.join(REPO_ROOT, 'src/lib/landPolygons.ts');

/** Douglas-Peucker on a polyline of [lng, lat] pairs. */
function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();
  const sqTol = tolerance * tolerance;

  function sqSegDist(p, a, b) {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function dp(first, last, simplified) {
    let maxSqDist = sqTol;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sqDist = sqSegDist(points[i], points[first], points[last]);
      if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
    }
    if (index !== -1) {
      if (index - first > 1) dp(first, index, simplified);
      simplified.push(points[index]);
      if (last - index > 1) dp(index, last, simplified);
    }
  }

  const last = points.length - 1;
  const simplified = [points[0]];
  dp(0, last, simplified);
  simplified.push(points[last]);
  return simplified;
}

const topo = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const layer = topo.objects.countries;
const transform = topo.transform;

/** Decode a topojson arc into absolute [lng, lat] pairs. */
function decodeArc(arc) {
  const out = [];
  let x = 0;
  let y = 0;
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    out.push([
      x * transform.scale[0] + transform.translate[0],
      y * transform.scale[1] + transform.translate[1],
    ]);
  }
  return out;
}

const arcs = topo.arcs.map(decodeArc);

/** Resolve a topojson arc index (negative means reversed) into points. */
function resolveArc(i) {
  if (i < 0) {
    const arc = arcs[~i];
    return arc.slice().reverse();
  }
  return arcs[i];
}

/** Build a ring from an array of arc indices. */
function buildRing(arcIndices) {
  const ring = [];
  for (let i = 0; i < arcIndices.length; i++) {
    const seg = resolveArc(arcIndices[i]);
    // Skip the duplicated joining point between consecutive arcs.
    if (i === 0) ring.push(...seg);
    else ring.push(...seg.slice(1));
  }
  return ring;
}

const rings = [];
for (const feature of layer.geometries) {
  if (feature.type === 'Polygon') {
    for (const arcIndices of feature.arcs) {
      rings.push(buildRing(arcIndices));
    }
  } else if (feature.type === 'MultiPolygon') {
    for (const polygon of feature.arcs) {
      for (const arcIndices of polygon) {
        rings.push(buildRing(arcIndices));
      }
    }
  }
}

// Aggressive simplification: tolerance is in degrees. ~1.2° drops most coastal
// noise while keeping continent shapes recognizable at hero scale.
const TOLERANCE_DEG = 1.2;
// Drop tiny islands whose simplified ring would be near-useless.
const MIN_VERTS_AFTER = 4;

const simplifiedRings = [];
for (const ring of rings) {
  const s = simplify(ring, TOLERANCE_DEG);
  if (s.length < MIN_VERTS_AFTER) continue;
  // Quantize to 0.1° to shave bytes — well below the resolution we render at.
  const flat = [];
  for (const [lng, lat] of s) {
    flat.push(Math.round(lng * 10) / 10, Math.round(lat * 10) / 10);
  }
  simplifiedRings.push(flat);
}

const totalCoords = simplifiedRings.reduce((sum, r) => sum + r.length / 2, 0);

const banner = `/**
 * Simplified land polygons for the hero globe.
 *
 * Generated from Natural Earth 110m country boundaries via
 * \`scripts/build-land-polygons.mjs\`. Each entry is a flat \`[lng, lat, lng,
 * lat, ...]\` ring. We keep the data inline (rather than fetching a TopoJSON
 * blob at runtime) so the hero renders instantly, with no network jitter and
 * no extra runtime dependency.
 *
 * Do not edit by hand — re-run the script to regenerate.
 */
`;

const body = `export const LAND_RINGS: readonly (readonly number[])[] = [\n${
  simplifiedRings.map((r) => `  [${r.join(',')}],`).join('\n')
}\n];\n`;

fs.writeFileSync(OUTPUT, banner + body);

console.log(
  `Wrote ${OUTPUT}`,
  `\n  rings: ${simplifiedRings.length}`,
  `\n  vertices: ${totalCoords}`,
  `\n  bytes: ${fs.statSync(OUTPUT).size}`,
);
