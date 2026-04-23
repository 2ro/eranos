import { useSeoMeta } from '@unhead/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';

interface ThemeOption {
  value: Theme;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const themeOptions: ThemeOption[] = [
  {
    value: 'system',
    label: 'System',
    description: 'Follows your device setting',
    icon: <Monitor className="size-5" />,
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Always use light mode',
    icon: <Sun className="size-5" />,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use dark mode',
    icon: <Moon className="size-5" />,
  },
];

export function AppearanceSettingsPage() {
  const { config } = useAppContext();
  const { theme, setTheme } = useTheme();

  // Treat "custom" as "system" for display since we're simplifying to 3 options
  const activeTheme = theme === 'custom' ? 'system' : theme;

  useSeoMeta({
    title: `Appearance | Settings | ${config.appName}`,
    description: 'Choose between system, light, and dark mode',
  });

  return (
    <main>
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Appearance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose how the app looks.
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-6">
          <IntroImage src="/theme-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Color Mode</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Pick your preferred color mode. System will automatically match your device's light or dark setting.
            </p>
          </div>
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
                activeTheme === option.value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/50 hover:border-primary/40 hover:bg-muted/30',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center size-10 rounded-lg transition-colors',
                  activeTheme === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {option.icon}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className={cn(
                  'text-sm font-semibold',
                  activeTheme === option.value ? 'text-foreground' : 'text-foreground',
                )}>
                  {option.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </p>
              </div>
              {activeTheme === option.value && (
                <div className="size-2.5 rounded-full bg-primary shrink-0 animate-in fade-in zoom-in duration-200" />
              )}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
