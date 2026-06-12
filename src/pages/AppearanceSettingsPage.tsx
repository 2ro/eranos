import { useSeoMeta } from '@unhead/react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';

interface ThemeOption {
  value: Theme;
  labelKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
}

const themeOptions: ThemeOption[] = [
  {
    value: 'system',
    labelKey: 'settings.appearance.system',
    descriptionKey: 'settings.appearance.systemDesc',
    icon: <Monitor className="size-5" />,
  },
  {
    value: 'light',
    labelKey: 'settings.appearance.light',
    descriptionKey: 'settings.appearance.lightDesc',
    icon: <Sun className="size-5" />,
  },
  {
    value: 'dark',
    labelKey: 'settings.appearance.dark',
    descriptionKey: 'settings.appearance.darkDesc',
    icon: <Moon className="size-5" />,
  },
];

export function AppearanceSettingsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { theme, setTheme } = useTheme();

  useSeoMeta({
    title: `${t('settings.appearance.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.appearance.subtitle'),
  });

  return (
    <main>
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('settings.appearance.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.appearance.subtitle')}
            </p>
          </div>
        }
      />

      <div className="p-4 max-w-2xl mx-auto w-full">
        {/* Intro */}
        <div className="px-1 pt-1 pb-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t('settings.appearance.colorMode')}</h2>
          <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
            {t('settings.appearance.intro')}
          </p>
        </div>

        {/* Theme options */}
        <div className="overflow-hidden rounded-2xl bg-card border border-border/60 shadow-sm divide-y divide-border/50">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'w-full flex items-center gap-3.5 px-3.5 py-3 transition-colors',
                'hover:bg-muted/50 active:bg-muted/70',
                'focus-visible:outline-none focus-visible:bg-muted/50',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center size-9 rounded-[10px] transition-colors',
                  theme === option.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {option.icon}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[15px] font-medium leading-tight text-foreground">
                  {t(option.labelKey)}
                </p>
                <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
                  {t(option.descriptionKey)}
                </p>
              </div>
              {theme === option.value && (
                <Check className="size-[18px] text-primary shrink-0 animate-in fade-in zoom-in duration-200" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
