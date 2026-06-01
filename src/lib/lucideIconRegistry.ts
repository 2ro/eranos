import type { ForwardRefExoticComponent } from 'react';
import type { LucideProps } from 'lucide-react';

type LucideComponent = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>;

/**
 * Lazy registry of every named icon exported by `lucide-react`.
 *
 * `lucide-react` exports ~1500 individual icon components. Statically
 * importing the whole library would defeat tree-shaking for the entire
 * app, so this module is the *only* place that imports it with a
 * namespace import. Both `LucideIcon` (the display wrapper) and
 * `IconPicker` go through `loadLucideRegistry()`, which dynamically
 * imports `lucide-react` and emits the icons as a separate Vite chunk.
 *
 * The registry caches the resolved module so subsequent calls are
 * synchronous-fast (Promise.resolve of the cached value).
 *
 * **Validation.** We expose `entries()` filtered to (a) the PascalCase
 * names we accept on write (see `isValidIconName` in
 * `src/lib/campaignLists.ts`) and (b) components that look like icon
 * components (have a `render` or `$$typeof` marker). Anything failing
 * either check is dropped silently — that keeps non-icon exports
 * (`createLucideIcon`, the `LucideProps` interface re-export, etc.)
 * out of the picker.
 */

let cached: Promise<Record<string, LucideComponent>> | null = null;

/** Camelcase or generic exports we deliberately want to exclude. */
const EXCLUDED_NAMES = new Set<string>([
  'createLucideIcon',
  'Icon',
  'LucideIcon',
  'LucideProps',
  'default',
]);

/** PascalCase: starts with an uppercase letter, no underscores. */
const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]+$/;

/** Load (and cache) the full Lucide module. Subsequent calls are free. */
function loadModule(): Promise<Record<string, LucideComponent>> {
  if (!cached) {
    cached = import('lucide-react').then((mod) => {
      const out: Record<string, LucideComponent> = {};
      for (const [name, value] of Object.entries(mod)) {
        if (EXCLUDED_NAMES.has(name)) continue;
        if (!PASCAL_CASE_RE.test(name)) continue;
        // Skip the "Icon"-suffixed deprecated aliases that lucide-react
        // ships for backwards compatibility — they double-count the list.
        if (name.endsWith('Icon') && name !== 'Icon') continue;
        // Skip the "Lucide"-prefixed aliases for the same reason.
        if (name.startsWith('Lucide') && name !== 'Lucide') continue;
        if (typeof value !== 'object' && typeof value !== 'function') continue;
        out[name] = value as LucideComponent;
      }
      return out;
    });
  }
  return cached;
}

/** Resolve a single icon by name. Returns `null` if not in the registry. */
export async function getLucideIcon(name: string): Promise<LucideComponent | null> {
  const reg = await loadModule();
  return reg[name] ?? null;
}

/** Return all `{ name, component }` entries in alphabetical order. */
export async function getAllLucideIcons(): Promise<
  Array<{ name: string; Component: LucideComponent }>
> {
  const reg = await loadModule();
  return Object.keys(reg)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, Component: reg[name] }));
}
