import { loadBundledFont } from '@/lib/fonts';

/**
 * Ensure all bundled fonts referenced in a CSS font-family string are loaded.
 * Parses the comma-separated list, strips quotes/whitespace, and calls
 * loadBundledFont for each segment. No-ops for already-loaded or unknown fonts.
 */
export function ensureLetterFonts(cssFontFamily: string | undefined): void {
  if (!cssFontFamily) return;
  const families = cssFontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  for (const family of families) {
    if (family) loadBundledFont(family);
  }
}
