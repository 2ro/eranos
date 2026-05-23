import { useCallback } from "react";
import { type Theme } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { resolveTheme } from "@/themes";

/**
 * Hook to read and set the active theme.
 *
 * Theme is one of `"light"`, `"dark"`, or `"system"`. Agora's colors are
 * hardcoded in `src/index.css` — there is no custom-theme path, no font
 * override, no background image, no remote-loaded palette. Switching
 * themes only toggles the `.dark` class on `<html>`.
 *
 * The selected mode is persisted to localStorage via `AppContext` and
 * (when logged in) mirrored into the user's encrypted NIP-78 settings so
 * it follows them across devices.
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const setTheme = useCallback((theme: Theme) => {
    // Disable transitions briefly so the class flip doesn't animate.
    const noTransition = document.createElement('style');
    noTransition.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTransition);

    // Apply the class synchronously so the new colors take effect before React rerenders.
    document.documentElement.className = resolveTheme(theme);

    requestAnimationFrame(() => noTransition.remove());

    updateConfig((currentConfig) => ({ ...currentConfig, theme }));

    if (user) {
      updateSettings.mutateAsync({ theme }).catch((error) => {
        console.error('Failed to sync theme to encrypted storage:', error);
      });
    }
  }, [updateConfig, updateSettings, user]);

  return {
    theme: config.theme,
    setTheme,
  };
}
