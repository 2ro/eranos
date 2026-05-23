/**
 * Bundled font registry for the Letter feature (kind 8211).
 *
 * Letters let senders pick a font for the body text; the recipient's client
 * lazy-loads the corresponding fontsource package when the letter is opened.
 * Only the fonts in `FONT_OPTIONS` (see `src/lib/letterTypes.ts`) are
 * ever requested, and the family name is matched against this allowlist —
 * arbitrary font URLs are NOT loaded.
 *
 * The Agora app's UI uses `Inter Variable` and `Bebas Neue` (loaded eagerly
 * in `src/main.tsx`), neither of which is configurable.
 */

interface BundledFont {
  /** Canonical font-family name used in letter metadata. */
  family: string;
  /** Dynamic import that loads the font CSS into the page. */
  load: () => Promise<void>;
}

const bundledFonts: BundledFont[] = [
  {
    family: 'Fredoka',
    load: () => import('@fontsource-variable/fredoka').then(() => {}),
  },
  {
    family: 'Fredoka Variable',
    load: () => import('@fontsource-variable/fredoka').then(() => {}),
  },
  {
    family: 'Nunito',
    load: () => import('@fontsource-variable/nunito').then(() => {}),
  },
  {
    family: 'Nunito Variable',
    load: () => import('@fontsource-variable/nunito').then(() => {}),
  },
  {
    family: 'Playfair Display',
    load: () => import('@fontsource-variable/playfair-display').then(() => {}),
  },
  {
    family: 'Playfair Display Variable',
    load: () => import('@fontsource-variable/playfair-display').then(() => {}),
  },
  {
    family: 'Caveat',
    load: () => import('@fontsource/caveat/400.css').then(() => {}),
  },
  {
    family: 'Pacifico',
    load: () => import('@fontsource/pacifico/400.css').then(() => {}),
  },
  {
    family: 'Pirata One',
    load: () => import('@fontsource/pirata-one/400.css').then(() => {}),
  },
  {
    family: 'Permanent Marker',
    load: () => import('@fontsource/permanent-marker/400.css').then(() => {}),
  },
  {
    family: 'Special Elite',
    load: () => import('@fontsource/special-elite/400.css').then(() => {}),
  },
  {
    family: 'Creepster',
    load: () => import('@fontsource/creepster/400.css').then(() => {}),
  },
  {
    family: 'Silkscreen',
    load: () => import('@fontsource/silkscreen/400.css').then(() => {}),
  },
];

/** Map from lowercase family name to BundledFont for quick lookup. */
const bundledFontMap = new Map(
  bundledFonts.map((f) => [f.family.toLowerCase(), f]),
);

/** Tracks which fonts have already been loaded. */
const loadedFonts = new Set<string>();

/**
 * Ensure a bundled font is loaded (idempotent).
 *
 * Returns `true` if the font was found in the allowlist and the CSS was
 * loaded (or had already been loaded). Returns `false` for any unknown
 * family — the caller's text just falls back to the default font stack.
 */
export async function loadBundledFont(family: string): Promise<boolean> {
  const key = family.toLowerCase();
  if (loadedFonts.has(key)) return true;

  const font = bundledFontMap.get(key);
  if (!font) return false;

  try {
    await font.load();
    loadedFonts.add(key);
    return true;
  } catch (error) {
    console.error(`Failed to load bundled font "${family}":`, error);
    return false;
  }
}
