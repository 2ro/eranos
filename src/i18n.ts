import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ar from './locales/ar.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import km from './locales/km.json';
import ps from './locales/ps.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import sn from './locales/sn.json';
import zh from './locales/zh.json';

/**
 * i18next initialization for Agora.
 *
 * All Phase-1 locales are bundled statically. Adding a new locale is a
 * three-line change: add the import above, add it to `resources` below,
 * and add its code to `SUPPORTED_LANGUAGES`. The language switcher UI
 * reads from `SUPPORTED_LANGUAGES` so it picks up new entries
 * automatically.
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
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'fa', nativeName: 'فارسی' },
  { code: 'ps', nativeName: 'پښتو' },
  { code: 'km', nativeName: 'ភាសាខ្មែរ' },
  { code: 'sn', nativeName: 'ChiShona' },
  { code: 'zh', nativeName: '中文' },
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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
      es: { translation: es },
      fa: { translation: fa },
      fr: { translation: fr },
      hi: { translation: hi },
      km: { translation: km },
      ps: { translation: ps },
      pt: { translation: pt },
      ru: { translation: ru },
      sn: { translation: sn },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
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

// Apply once on init (LanguageDetector has already picked the language).
applyDocumentDirection(i18n.language);

// Re-apply whenever the user switches languages.
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
