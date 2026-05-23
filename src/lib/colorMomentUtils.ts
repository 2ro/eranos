/**
 * Color Moment (kind 3367) utilities.
 *
 * Color Moments are palette-art posts: a kind-3367 event carries a small set
 * of hex colors as `c` tags. Agora renders them as art via
 * `ColorMomentContent`. The previous `paletteToTheme()` helper that
 * promoted a Color Moment to the active app theme has been removed — Agora
 * no longer supports user-injected themes.
 */

/** Extract validated hex color values from event tags. */
export function getColors(tags: string[][]): string[] {
  return tags
    .filter(([n]) => n === 'c')
    .map(([, v]) => v)
    .filter((v) => /^#[0-9A-Fa-f]{6}$/.test(v));
}
