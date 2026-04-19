import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';

/**
 * i18next initialization for Agora.
 *
 * Currently only English is bundled. The wallet stack (ported from the
 * legacy Agora/Pathos codebase) uses `react-i18next`, so this scaffolding
 * exists to satisfy those `t()` calls. Additional locales can be added
 * later by importing them and registering under `resources`.
 */

export const RTL_LANGUAGES = new Set(['ar', 'fa', 'ps', 'ur', 'he', 'yi', 'ku', 'ug']);

export function isRTLLanguage(lng: string): boolean {
  const base = lng.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(base);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: ['en'],
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

export default i18n;
