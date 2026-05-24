import { useSeoMeta } from '@unhead/react';
import { Monitor, Moon, Sun } from 'lucide-react';
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

      <div className="p-4">
        {/* Intro */}
        <div className="px-3 pt-2 pb-6">
          <h2 className="text-sm font-semibold">{t('settings.appearance.colorMode')}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t('settings.appearance.intro')}
          </p>
        </div>

        {/* Theme options */}
        <div className="space-y-2">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                theme === option.value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/50 hover:border-primary/40 hover:bg-muted/30',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center size-10 rounded-lg transition-colors',
                  theme === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {option.icon}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className={cn(
                  'text-sm font-semibold',
                  theme === option.value ? 'text-foreground' : 'text-foreground',
                )}>
                  {t(option.labelKey)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(option.descriptionKey)}
                </p>
              </div>
              {theme === option.value && (
                <div className="size-2.5 rounded-full bg-primary shrink-0 animate-in fade-in zoom-in duration-200" />
              )}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
