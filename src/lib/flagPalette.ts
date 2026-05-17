/**
 * Extracts dominant colors from a flag emoji at runtime by rendering it onto
 * an offscreen canvas and sampling pixel data. Used to color the country
 * pill in `CommentContext` with the actual flag colors of the post's
 * country, no hand-curated table required.
 *
 * The work runs once per emoji per session and the result is cached, so the
 * cost is paid on first render only.
 */

import { useEffect, useState } from 'react';

/** Cache extracted palettes by emoji string so we never re-sample the same flag. */
const PALETTE_CACHE = new Map<string, string[] | null>();

/** Canvas size used for sampling. Larger = more accurate, slower; 64 is enough for ~3 stable hues. */
const CANVAS_SIZE = 64;

/** Minimum saturation (0-1) for a pixel to count as a "real" flag color. Filters out anti-alias / off-white. */
const MIN_SATURATION = 0.15;

/** Maximum lightness (0-1). Above this we treat the pixel as background/anti-alias. */
const MAX_LIGHTNESS = 0.97;

/** Minimum lightness — drops black anti-alias edges around the emoji. */
const MIN_LIGHTNESS = 0.04;

/** Number of dominant colors to keep for the gradient. */
const PALETTE_SIZE = 3;

/** Hue buckets when grouping similar samples. Smaller = stricter "same color" grouping. */
const HUE_BUCKET_DEG = 18;

interface HslColor {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
      case gN: h = (bN - rN) / d + 2; break;
      default: h = (rN - gN) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex({ h, s, l }: HslColor): string {
  // Standard HSL -> RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0; let g = 0; let b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * Extract dominant flag colors from an emoji by rendering it to a canvas and
 * sampling pixels. Returns a left-to-right ordered palette suitable for a
 * `linear-gradient`. Returns `null` when extraction is impossible (no DOM,
 * canvas blocked, or all samples were skin/anti-alias).
 */
function extractFlagPalette(flag: string): string[] | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Fill with a sentinel transparent background so we can ignore unrendered pixels.
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Render the emoji centered. font-size needs to be smaller than the canvas
  // so the glyph fits with margin (emojis are typically ~80% of the em box).
  ctx.font = `${Math.floor(CANVAS_SIZE * 0.85)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  try {
    ctx.fillText(flag, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  } catch {
    return null;
  }

  // Read pixels. Sample a horizontal stripe through the middle of the glyph
  // (vertical extent of most flag emojis) at high density.
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  } catch {
    return null;
  }
  const data = imageData.data;

  // Group samples into hue buckets, weighted by saturation*opacity so dominant
  // flag colors win over edge anti-aliasing.
  const buckets = new Map<number, { weight: number; sumH: number; sumS: number; sumL: number; minX: number }>();

  // Sample the middle third vertically (where flag stripes are most representative)
  const yStart = Math.floor(CANVAS_SIZE * 0.3);
  const yEnd = Math.floor(CANVAS_SIZE * 0.7);

  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < CANVAS_SIZE; x++) {
      const idx = (y * CANVAS_SIZE + x) * 4;
      const a = data[idx + 3];
      if (a < 128) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsl = rgbToHsl(r, g, b);
      // Drop near-grayscale / near-black / near-white pixels (anti-alias, borders).
      if (hsl.s < MIN_SATURATION) continue;
      if (hsl.l > MAX_LIGHTNESS) continue;
      if (hsl.l < MIN_LIGHTNESS) continue;

      const bucket = Math.floor(hsl.h / HUE_BUCKET_DEG);
      const weight = hsl.s * (a / 255);
      const existing = buckets.get(bucket);
      if (existing) {
        existing.weight += weight;
        existing.sumH += hsl.h * weight;
        existing.sumS += hsl.s * weight;
        existing.sumL += hsl.l * weight;
        if (x < existing.minX) existing.minX = x;
      } else {
        buckets.set(bucket, {
          weight,
          sumH: hsl.h * weight,
          sumS: hsl.s * weight,
          sumL: hsl.l * weight,
          minX: x,
        });
      }
    }
  }

  if (buckets.size === 0) return null;

  // Pick the top-weighted buckets, then order them by minX so the gradient
  // mirrors the left-to-right layout of the flag itself.
  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, PALETTE_SIZE)
    .sort((a, b) => a.minX - b.minX);

  return sorted.map((bucket) => {
    const h = bucket.sumH / bucket.weight;
    let s = bucket.sumS / bucket.weight;
    let l = bucket.sumL / bucket.weight;
    // Nudge saturation/lightness toward a band that reads well behind white
    // text without losing the flag's character.
    s = Math.min(1, Math.max(0.55, s));
    l = Math.min(0.55, Math.max(0.32, l));
    return hslToHex({ h, s, l });
  });
}

/**
 * React hook: returns the dominant colors of a flag emoji, or `null` while
 * extraction is in progress / impossible. Cached across remounts.
 */
export function useFlagPalette(flag: string | undefined): string[] | null {
  const initial = flag ? PALETTE_CACHE.get(flag) ?? null : null;
  const [palette, setPalette] = useState<string[] | null>(initial);

  useEffect(() => {
    if (!flag) {
      setPalette(null);
      return;
    }
    if (PALETTE_CACHE.has(flag)) {
      setPalette(PALETTE_CACHE.get(flag) ?? null);
      return;
    }
    // Defer extraction off the critical render path. requestAnimationFrame
    // gives the browser a chance to paint the gradient fallback first.
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      const result = extractFlagPalette(flag);
      PALETTE_CACHE.set(flag, result);
      if (!cancelled) setPalette(result);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [flag]);

  return palette;
}
