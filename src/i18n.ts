import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English is bundled statically so it's available synchronously on first
// paint as the fallback language — this prevents a flash of untranslated
// (key-path) content while a non-English locale is still loading.
import en from './locales/en.json';

/**
 * i18next initialization for Agora.
 *
 * Only English is bundled eagerly. Every other locale is loaded on demand
 * via a dynamic `import()` (see `loadLocale`), so each language becomes its
 * own lazily-fetched chunk and the initial bundle ships a single locale
 * instead of all of them (~2 MB of JSON saved on first load).
 *
 * Adding a new locale is a two-step change: add its code to
 * `SUPPORTED_LANGUAGES` below, and add a `case` to `loadLocale`'s dynamic
 * import map. The language switcher UI reads from `SUPPORTED_LANGUAGES` so
 * it picks up new entries automatically.
 */

export interface SupportedLanguage {
  /** BCP-47 language code (lowercase). */
  code: string;
  /** Display name in the language itself (used in the switcher UI). */
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'id', nativeName: 'Bahasa Indonesia' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'tr', nativeName: 'Türkçe' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'fa', nativeName: 'فارسی' },
  { code: 'ps', nativeName: 'پښتو' },
  { code: 'km', nativeName: 'ភាសាខ្មែរ' },
  { code: 'sn', nativeName: 'ChiShona' },
  { code: 'sw', nativeName: 'Kiswahili' },
  { code: 'zh', nativeName: '简体中文' },
  { code: 'zh-Hant', nativeName: '繁體中文' },
];

export const RTL_LANGUAGES = new Set(['ar', 'fa', 'ps', 'ur', 'he', 'yi', 'ku', 'ug']);

export function isRTLLanguage(lng: string): boolean {
  const base = lng.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(base);
}

/**
 * Apply the document-level `lang` and `dir` attributes so the browser knows
 * the page language and direction. Tailwind's `rtl:` variants pick up the
 * `dir="rtl"` attribute automatically.
 */
function applyDocumentDirection(lng: string): void {
  if (typeof document === 'undefined') return;
  const base = lng.split('-')[0].toLowerCase();
  document.documentElement.lang = base;
  document.documentElement.dir = isRTLLanguage(base) ? 'rtl' : 'ltr';
}

/**
 * Normalize an i18next language code to the locale chunk that backs it.
 *
 * i18next can hand us region-tagged codes (`en-US`, `pt-BR`) and the
 * Traditional Chinese aliases (`zh-TW`, `zh-HK`). Each must resolve to one
 * of the JSON files in `./locales`. Returns `undefined` when no chunk
 * exists (e.g. `en`, which is bundled statically and needs no fetch).
 */
function resolveLocaleFile(lng: string): string | undefined {
  const lower = lng.toLowerCase();
  if (lower === 'en' || lower.startsWith('en-')) return undefined;
  // Traditional Chinese: zh-Hant / zh-TW / zh-HK all share one resource.
  if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk') return 'zh-Hant';
  // Everything else maps on its base code (pt-BR -> pt, etc.).
  const base = lower.split('-')[0];
  // zh (Simplified) keeps its own file.
  return base;
}

/**
 * Lazily fetch a locale's translation bundle and register it with i18next.
 *
 * Each `import()` is statically analyzable by Vite, so every locale lands in
 * its own chunk that's only downloaded when that language is actually
 * selected (or detected on startup). English is bundled eagerly and skipped
 * here. Returns once the bundle is registered (or immediately for English /
 * already-loaded locales).
 */
const loadedLocales = new Set<string>(['en']);

async function loadLocale(lng: string): Promise<void> {
  const file = resolveLocaleFile(lng);
  if (!file || loadedLocales.has(file)) return;

  // The explicit map keeps the dynamic imports statically analyzable so Vite
  // emits one chunk per locale (a bare template-literal import would bundle
  // every JSON file into a single shared chunk and defeat the split).
  const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
    ar: () => import('./locales/ar.json'),
    es: () => import('./locales/es.json'),
    fa: () => import('./locales/fa.json'),
    fr: () => import('./locales/fr.json'),
    hi: () => import('./locales/hi.json'),
    id: () => import('./locales/id.json'),
    km: () => import('./locales/km.json'),
    ps: () => import('./locales/ps.json'),
    pt: () => import('./locales/pt.json'),
    ru: () => import('./locales/ru.json'),
    sn: () => import('./locales/sn.json'),
    sw: () => import('./locales/sw.json'),
    tr: () => import('./locales/tr.json'),
    zh: () => import('./locales/zh.json'),
    'zh-Hant': () => import('./locales/zh-Hant.json'),
  };

  const loader = loaders[file];
  if (!loader) return;

  const mod = await loader();
  // The Traditional Chinese file backs three language codes; register all so
  // i18next resolves `zh-Hant`, `zh-TW`, and `zh-HK` without re-fetching.
  const codes = file === 'zh-Hant' ? ['zh-Hant', 'zh-TW', 'zh-HK'] : [file];
  for (const code of codes) {
    i18n.addResourceBundle(code, 'translation', mod.default, true, true);
  }
  loadedLocales.add(file);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      // Only English ships in the main bundle; the rest are added at runtime
      // by `loadLocale` once detected or selected.
      en: { translation: en },
    },
    // Defer rendering until the detected language's bundle is registered, so
    // non-English users don't flash English before their locale loads.
    partialBundledLanguages: true,
    fallbackLng: 'en',
    // SUPPORTED_LANGUAGES drives the switcher UI; `zh-TW` and `zh-HK` are
    // also accepted by the detector so Taiwan/HK device locales route to
    // the Traditional resource directly instead of falling back to Simplified.
    supportedLngs: [...SUPPORTED_LANGUAGES.map((l) => l.code), 'zh-TW', 'zh-HK'],
    nonExplicitSupportedLngs: true,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

// Load the locale the detector picked on startup. If it isn't English the
// bundle is fetched in the background; once registered, i18next re-renders
// translated components via the `languageChanged`/`loaded` events.
void loadLocale(i18n.language);

// Fetch a locale's bundle before/at the moment the user switches to it.
i18n.on('languageChanged', (lng) => {
  void loadLocale(lng);
  applyDocumentDirection(lng);
});

// Apply once on init (LanguageDetector has already picked the language).
applyDocumentDirection(i18n.language);

export default i18n;
