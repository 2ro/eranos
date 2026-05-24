/**
 * Sanitize a string for safe interpolation into a double-quoted CSS context.
 *
 * Uses an allowlist approach — only Unicode letters, numbers, spaces, hyphens,
 * underscores, apostrophes, and periods are permitted. Everything else is
 * stripped, which is enough to prevent CSS-string breakout (`"`, `;`, `<`,
 * `\\`, etc.).
 *
 * Use this whenever an event-sourced string flows into a CSS declaration
 * value — e.g. a font-family chosen by a letter sender, where the value is
 * interpolated into `style={{ fontFamily: ... }}`.
 *
 * URLs in CSS contexts (`url("...")`) must still go through `sanitizeUrl()`
 * from `@/lib/sanitizeUrl` — this helper only protects the bare string
 * interpolation case.
 */
export function sanitizeCssString(value: string): string {
  return value.replace(/[^\p{L}\p{N} _\-'.]/gu, '');
}
