import { ReactNode, useLayoutEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme } from '@/contexts/AppContext';
import { resolveTheme } from '@/themes';
import { AppConfigSchema } from '@/lib/schemas';
import { z } from 'zod';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence.
  // The deserializer uses safeParse per top-level field so that a single
  // invalid/incomplete field (e.g. feedSettings missing a new key) doesn't
  // nuke the entire config back to defaults. Valid fields are preserved.
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) return {};

        const result: Partial<AppConfig> = {};
        // Validate each top-level field individually
        for (const key of Object.keys(parsed)) {
          const fieldSchema = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape];
          if (fieldSchema) {
            const fieldResult = fieldSchema.safeParse(parsed[key]);
            if (fieldResult.success) {
              (result as Record<string, unknown>)[key] = fieldResult.data;
            }
          }
        }

        // Migrate legacy blossomServers (string[]) to blossomServerMetadata
        if (!result.blossomServerMetadata) {
          const legacyServers = parsed.blossomServers;
          if (Array.isArray(legacyServers)) {
            const parsed2 = z.array(z.string().url()).safeParse(legacyServers);
            if (parsed2.success && parsed2.data.length > 0) {
              result.blossomServerMetadata = {
                servers: parsed2.data,
                updatedAt: 0,
              };
            }
          }
        }

        return result;
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = {
    ...defaultConfig,
    ...rawConfig,
    // Deep-merge feedSettings so new keys added to the default are visible
    // even for existing users who have an older feedSettings in localStorage.
    feedSettings: { ...defaultConfig.feedSettings, ...rawConfig.feedSettings },
  };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Keep the .dark class on <html> in sync with the active theme.
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply the active theme to `<html>` by setting its className.
 *
 * Colors are defined statically in `src/index.css` — this hook only flips
 * the `.dark` class so the right block wins. When the user picks
 * `"system"`, we also subscribe to `prefers-color-scheme` changes so the
 * app follows the OS in real time.
 *
 * There is no runtime CSS-variable injection, no font loading from event
 * data, no background image, no recolored favicon. Anything that could
 * paint untrusted strings into the document has been removed.
 */
function useApplyTheme(theme: Theme) {
  useLayoutEffect(() => {
    function apply() {
      document.documentElement.className = resolveTheme(theme);
      // The inline body background set by public/theme.js before React
      // mounted is no longer needed once Tailwind's bg-background kicks in.
      document.body.removeAttribute('style');
    }

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
}
