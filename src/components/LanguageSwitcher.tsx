import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LANGUAGES, changeAppLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Resolve the live i18next language code to one of `SUPPORTED_LANGUAGES`'
 * codes so the right row shows as selected.
 *
 * Mirrors the logic in `LanguageSettingsPage` so the top-nav switcher and the
 * settings page agree on which language is active:
 *   1. Exact match (case-insensitive) — `zh-Hant` → `zh-Hant`, `en` → `en`.
 *   2. Traditional-Chinese aliases — `zh-TW` / `zh-HK` resolve to `zh-Hant`
 *      because `i18n.ts` registers them as resource aliases.
 *   3. Base-code fallback — `en-US` → `en`, `pt-BR` → `pt`.
 */
function resolveCurrentLng(rawLng: string): string {
  const lower = rawLng.toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  if (lower === 'zh-tw' || lower === 'zh-hk') return 'zh-Hant';
  return lower.split('-')[0];
}

interface LanguageSwitcherProps {
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * Compact language picker for the top nav. A globe/languages icon opens a
 * dropdown of every supported language by its own native name, so a visitor
 * who can't read the current UI language can still recognize and pick theirs.
 *
 * Switching happens in place — `changeAppLanguage` swaps the active locale and
 * the app re-renders translated — so the user never loses their scroll
 * position, the campaign they're reading, or any in-progress form state. The
 * full `/settings/language` page remains the canonical deep-link.
 *
 * Every row stays LTR-aligned (one consistent left edge for the selected dot
 * and the text), so the list reads as a tidy column rather than RTL names
 * floating to the far edge. Each name still carries its own `lang` so the
 * browser shapes Arabic/Persian/Khmer/CJK glyphs correctly.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n: i18nInstance } = useTranslation();
  const currentLng = resolveCurrentLng(i18nInstance.language ?? 'en');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'shrink-0 size-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            className,
          )}
          aria-label={t('nav.language')}
          title={t('nav.language')}
        >
          <Globe className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-left">{t('language.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={currentLng}
          onValueChange={(code) => {
            if (code !== currentLng) void changeAppLanguage(code);
          }}
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <DropdownMenuRadioItem
              key={language.code}
              value={language.code}
              lang={language.code}
              dir="ltr"
              className="text-left"
            >
              {language.nativeName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
