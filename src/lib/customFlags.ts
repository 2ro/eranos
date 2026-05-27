/**
 * Bundled flag assets for ISO codes that have a recognised flag but no
 * Unicode emoji codepoint. The {@link CountryFlag} component renders
 * these as `<img>` elements; callers that need the raw URL (e.g. a
 * card backdrop, a CSS background) use {@link customFlagAsset}.
 *
 * Editorial choices:
 *  - Tibet (ISO 3166-2 `CN-XZ`) is surfaced as a country-level entity
 *    with the Snow Lion flag, matching the older Agora codebase.
 *  - Kosovo (`XK`) is a user-assigned ISO 3166-1 code with no Unicode
 *    emoji flag, so we bundle its SVG to render alongside the rest of
 *    the country list.
 *
 * Add additional entries here as new bundled assets land in `/public`.
 */
const CUSTOM_FLAG_ASSETS: Record<string, string> = {
  'CN-XZ': '/flag-tibet.svg',
  'XK': '/flag-kosovo.svg',
};

/**
 * Whether `CountryFlag` will render a bundled SVG/image for this code
 * instead of falling back to its emoji. Useful when a surrounding
 * renderer has a separate "Wikipedia subdivision thumbnail" branch
 * that should bow out so the custom flag wins.
 */
export function hasCustomFlag(code: string): boolean {
  return code.toUpperCase() in CUSTOM_FLAG_ASSETS;
}

/**
 * URL of the bundled flag asset for this code, or `null` when none is
 * defined. Use this when a renderer needs to drop the flag into a
 * non-`<img>` slot — a CSS background, a feed-card backdrop, or a
 * blurred banner — instead of through the `CountryFlag` glyph
 * component. Stays `null` for entries that fall back to emoji.
 */
export function customFlagAsset(code: string): string | null {
  return CUSTOM_FLAG_ASSETS[code.toUpperCase()] ?? null;
}
