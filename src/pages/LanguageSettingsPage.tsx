import { useSeoMeta } from '@unhead/react';
import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import i18n, { SUPPORTED_LANGUAGES, isRTLLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

export function LanguageSettingsPage() {
  const { config } = useAppContext();
  const { t, i18n: i18nInstance } = useTranslation();

  // Use the live i18n language so the selected indicator updates immediately
  // after the user picks a new option (the component re-renders via
  // `useTranslation` when the language changes).
  //
  // Match the active language against `SUPPORTED_LANGUAGES` codes in two
  // passes so script-tagged variants like `zh-Hant` keep their checkmark
  // instead of collapsing to the base `zh` row:
  //   1. Exact match (case-insensitive) — `zh-Hant` matches the `zh-Hant`
  //      switcher entry, `en` matches `en`.
  //   2. Alias map — `zh-TW` and `zh-HK` both resolve to `zh-Hant` because
  //      i18n.ts registers them as resource aliases.
  //   3. Base-code match — `en-US` matches `en`, `pt-BR` matches `pt`, etc.
  //      Only consulted when no script-tagged variant matched first.
  const rawLng = i18nInstance.language ?? 'en';
  const ZH_HANT_ALIASES = new Set(['zh-tw', 'zh-hk']);
  const supportedCodesLower = new Set(SUPPORTED_LANGUAGES.map((l) => l.code.toLowerCase()));
  const rawLngLower = rawLng.toLowerCase();
  const currentLng = (() => {
    if (supportedCodesLower.has(rawLngLower)) {
      return SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === rawLngLower)!.code;
    }
    if (ZH_HANT_ALIASES.has(rawLngLower)) return 'zh-Hant';
    return rawLng.split('-')[0].toLowerCase();
  })();

  useSeoMeta({
    title: `${t('language.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('language.subtitle'),
  });

  const handleSelect = (code: string) => {
    if (code === currentLng) return;
    void i18n.changeLanguage(code);
  };

  return (
    <main>
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <Languages className="size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{t('language.title')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {t('language.subtitle')}
              </p>
            </div>
          </div>
        }
      />

      <div className="p-4">
        <div className="px-3 pt-2 pb-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('language.intro')}
          </p>
        </div>

        <ul className="space-y-2" role="radiogroup" aria-label={t('language.title')}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const selected = language.code === currentLng;
            const rtl = isRTLLanguage(language.code);
            return (
              <li key={language.code}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleSelect(language.code)}
                  className={cn(
                    'w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 hover:border-primary/40 hover:bg-muted/30',
                  )}
                >
                  <div
                    className={cn(
                      'flex-1 text-left min-w-0',
                      // Force native-name rendering in the locale's own
                      // direction so RTL scripts (Arabic, Farsi, Pashto)
                      // display correctly even when the surrounding UI is LTR.
                    )}
                  >
                    <p
                      className="text-base font-semibold truncate"
                      dir={rtl ? 'rtl' : 'ltr'}
                      lang={language.code}
                    >
                      {language.nativeName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
                      {language.code}
                    </p>
                  </div>
                  {selected && (
                    <Check className="size-5 text-primary shrink-0" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground mt-6 px-3 leading-relaxed">
          {t('language.translationNote')}
        </p>
      </div>
    </main>
  );
}

export default LanguageSettingsPage;
