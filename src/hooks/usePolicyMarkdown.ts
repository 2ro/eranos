import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Long-form policy / help content (Privacy, CSAE, etc.) is stored as markdown
 * under `src/content/<slug>/<lng>.md`. This loader resolves `(slug, language)`
 * to its raw markdown source with English fallback.
 *
 * Each entry is a dynamic `import()` of the markdown file with Vite's `?raw`
 * suffix, which is also supported by other modern bundlers (Bun, esbuild).
 * Static `import()` calls let bundlers code-split per locale so a cold start
 * pays only for the active language. `import.meta.glob` is intentionally
 * avoided — it's Vite-only and forbidden by `eslint.config.js`.
 *
 * Adding a new policy markdown file is a two-line change: drop the `.md`
 * file into `src/content/<slug>/`, and add the `[slug][lng]` entry to
 * `loaders` below.
 */
type Loader = () => Promise<{ default: string }>;
type LoaderMap = Record<string, Record<string, Loader>>;

const loaders: LoaderMap = {
  privacy: {
    en: () => import('../content/privacy/en.md?raw'),
    es: () => import('../content/privacy/es.md?raw'),
    zh: () => import('../content/privacy/zh.md?raw'),
    ar: () => import('../content/privacy/ar.md?raw'),
    fa: () => import('../content/privacy/fa.md?raw'),
    ps: () => import('../content/privacy/ps.md?raw'),
    km: () => import('../content/privacy/km.md?raw'),
    sn: () => import('../content/privacy/sn.md?raw'),
  },
  csae: {
    en: () => import('../content/csae/en.md?raw'),
    es: () => import('../content/csae/es.md?raw'),
    zh: () => import('../content/csae/zh.md?raw'),
    ar: () => import('../content/csae/ar.md?raw'),
    fa: () => import('../content/csae/fa.md?raw'),
    ps: () => import('../content/csae/ps.md?raw'),
    // km, sn fall back to en via the loader's English fallback path.
  },
};

async function tryLoad(slug: string, lng: string): Promise<string | null> {
  const loader = loaders[slug]?.[lng];
  if (!loader) return null;
  try {
    const mod = await loader();
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * Loads the markdown source for a long-form policy / help page, keyed on the
 * current i18next language with English fallback.
 *
 * Returned `markdown` is the raw markdown string (with `{{appName}}`-style
 * placeholders still in place); interpolation happens at the render site so
 * each consumer can pass its own value map.
 *
 * `isLoading` is true on first load and during a language switch. `error`
 * is set only if even the English fallback fails to load (build-time bug —
 * every shipped locale should land beside its `en.md` sibling).
 */
export function usePolicyMarkdown(slug: string): {
  markdown: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { i18n } = useTranslation();
  const lng = i18n.language.split('-')[0].toLowerCase();

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      const primary = await tryLoad(slug, lng);
      if (cancelled) return;
      if (primary !== null) {
        setMarkdown(primary);
        setIsLoading(false);
        return;
      }

      const fallback = await tryLoad(slug, 'en');
      if (cancelled) return;
      if (fallback !== null) {
        setMarkdown(fallback);
      } else {
        setError(new Error(`Missing markdown content for "${slug}" (no ${lng}.md or en.md)`));
        setMarkdown(null);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, lng]);

  return { markdown, isLoading, error };
}
