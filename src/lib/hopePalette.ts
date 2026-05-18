/**
 * Curated palette of warm, hopeful hues used to tint the campaigns hero
 * per active campaign. Each entry is a *family* of HSL values that share a
 * base hue so the scrim, the radial sunrise glow, and any rim accents all
 * read as the same color tuned for their role.
 *
 * We deliberately exclude cold blues, greens, and any high-saturation
 * neon — the hero should always feel like dawn / golden hour, never like
 * a notification or a status indicator.
 */
export interface HopeHue {
  /** Stable name for debugging / logging. */
  name: string;
  /**
   * Tint applied to the diagonal scrim that sits over the photo. Higher
   * lightness, lower alpha — meant to layer on top of the existing dark
   * scrim and pull it toward this hue without overpowering the photo.
   */
  scrim: string;
  /**
   * Color of the large soft radial glow behind the headline area. Higher
   * saturation — this layer carries most of the emotional weight.
   */
  glow: string;
  /**
   * Edge / rim accent used along the top of the hero to read as a sliver
   * of sunrise light.
   */
  rim: string;
}

export const HOPE_PALETTE: readonly HopeHue[] = [
  // Sunrise gold — warm, optimistic, classic "new day".
  {
    name: 'sunrise-gold',
    scrim: 'hsl(38 92% 60% / 0.32)',
    glow: 'hsl(40 100% 65% / 0.55)',
    rim: 'hsl(42 100% 72% / 0.6)',
  },
  // Coral dawn — pink-orange skies just after sunrise.
  {
    name: 'coral-dawn',
    scrim: 'hsl(14 90% 62% / 0.32)',
    glow: 'hsl(18 100% 68% / 0.55)',
    rim: 'hsl(22 100% 75% / 0.6)',
  },
  // Honey — softer, slightly amber. Reads as harvest / abundance.
  {
    name: 'honey',
    scrim: 'hsl(32 85% 58% / 0.32)',
    glow: 'hsl(36 95% 64% / 0.55)',
    rim: 'hsl(38 100% 72% / 0.6)',
  },
  // Rose — pink-coral, gentler and more emotional than sunrise gold.
  {
    name: 'rose',
    scrim: 'hsl(348 80% 65% / 0.3)',
    glow: 'hsl(352 95% 72% / 0.5)',
    rim: 'hsl(355 100% 80% / 0.55)',
  },
  // Amber — deeper, more grounded sunset glow.
  {
    name: 'amber',
    scrim: 'hsl(26 90% 55% / 0.34)',
    glow: 'hsl(28 100% 62% / 0.55)',
    rim: 'hsl(30 100% 70% / 0.6)',
  },
  // Marigold — bright, joyful yellow-orange.
  {
    name: 'marigold',
    scrim: 'hsl(44 95% 60% / 0.3)',
    glow: 'hsl(46 100% 66% / 0.5)',
    rim: 'hsl(48 100% 74% / 0.55)',
  },
  // Peach — soft, hopeful, less saturated. Good when the photo itself is
  // already colorful and we just need a gentle wash.
  {
    name: 'peach',
    scrim: 'hsl(20 85% 70% / 0.28)',
    glow: 'hsl(22 95% 76% / 0.45)',
    rim: 'hsl(24 100% 82% / 0.5)',
  },
  // Magenta-rose — leans pink. Reads as care / love rather than dawn.
  {
    name: 'magenta-rose',
    scrim: 'hsl(338 80% 62% / 0.3)',
    glow: 'hsl(342 95% 70% / 0.5)',
    rim: 'hsl(346 100% 78% / 0.55)',
  },
];

/**
 * Fast deterministic 32-bit hash. djb2-style — plenty for picking a
 * palette index, and stable across runs for the same input.
 */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  // Force unsigned so we can mod safely.
  return h >>> 0;
}

/**
 * Picks a stable {@link HopeHue} for a given seed. Pass the campaign's
 * `aTag` (or any other stable identifier) — the same seed always returns
 * the same hue so users see consistent colors across visits.
 */
export function hopeHueFor(seed: string | undefined | null): HopeHue {
  if (!seed) return HOPE_PALETTE[0];
  return HOPE_PALETTE[hashSeed(seed) % HOPE_PALETTE.length];
}
