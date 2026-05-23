import type { Theme } from '@/contexts/AppContext';

/**
 * Agora's built-in color scheme. Colors are defined statically in `src/index.css`
 * via `:root {}` (light mode) and `.dark {}` blocks; this module exists only to
 * resolve a `Theme` preference (`"system"` / `"light"` / `"dark"`) to the
 * concrete class name applied on `<html>`.
 *
 * There is no longer any mechanism for injecting custom colors, fonts, or
 * backgrounds at runtime. Everything that styles the app ships in the bundle.
 */

/**
 * Resolves a theme preference to a concrete mode.
 * - `"system"` → `"light"` or `"dark"` based on OS preference.
 * - `"light"` / `"dark"` → returned as-is.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}
