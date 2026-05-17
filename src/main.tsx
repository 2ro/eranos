import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

// Kick off cache hydration early so data is ready before components render.
import { hydrateNip05Cache } from '@/lib/nip05Cache';
import { hydrateProfileCache } from '@/lib/profileCache';
hydrateNip05Cache();
hydrateProfileCache();

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// i18next initialization (used by the Spark wallet stack ported from Pathos).
import './i18n';

import '@fontsource-variable/inter';

// ─── Native status bar theming (Android APK / iOS) ───────────────────────────
// Keeps the OS top chrome in sync with the active app theme.
// Runs before React so the very first paint matches the persisted theme.
// Uses a MutationObserver so it reacts to all subsequent theme changes
// (class changes for builtin themes, style-content changes for custom themes).
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { getBackgroundThemeMode } from '@/lib/colorUtils';

if (Capacitor.isNativePlatform()) {
  // Hide the iOS keyboard accessory bar (prev/next/done toolbar above the keyboard).
  // Only runs on iOS — setAccessoryBarVisible is unimplemented on Android.
  if (Capacitor.getPlatform() === 'ios') {
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    }).catch(() => {});
  }
  /**
   * Sync the native system bar icon style with the active CSS theme.
   *
   * SystemBarsStyle.Dark  = light/white icons (use on dark backgrounds)
   * SystemBarsStyle.Light = dark/black icons  (use on light backgrounds)
   *
   * On Android 16+ (API 36) setBackgroundColor no longer works — the bars
   * are transparent and the web content renders behind them. The app already
   * draws its own safe-area backgrounds in CSS, so only icon style matters.
   */
  function updateStatusBar() {
    const isDark = getBackgroundThemeMode() === 'dark';
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }

  // Apply immediately (theme class is set synchronously by AppProvider useLayoutEffect
  // before the first React paint, but we still try early in case it's already set).
  updateStatusBar();

  // Re-apply whenever the theme class changes on <html> (light / dark / custom)
  const classObserver = new MutationObserver(() => updateStatusBar());
  classObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Re-apply whenever the injected <style id="theme-vars"> content changes
  // (covers custom themes that change CSS variables without changing the class).
  const styleObserver = new MutationObserver(() => updateStatusBar());
  const observeThemeVars = () => {
    const el = document.getElementById('theme-vars');
    if (el) {
      styleObserver.observe(el, { characterData: true, childList: true, subtree: true });
    }
  };
  // The style element may not exist yet — watch <head> for it to appear.
  observeThemeVars();
  const headObserver = new MutationObserver(() => observeThemeVars());
  headObserver.observe(document.head, { childList: true });
}
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Remove the HTML preloader after React has painted.
requestAnimationFrame(() => {
  document.getElementById('preloader')?.remove();
});

// ─── Service worker takeover (web only) ──────────────────────────────────────
//
// A previous version of Agora deployed at this origin shipped a precaching
// service worker that's still serving stale HTML/JS to returning users. The
// SW we ship now (public/sw.js) has no fetch handler and nukes every cache
// on activate, so as soon as the browser installs it, returning users start
// getting fresh builds again.
//
// usePushNotifications() also registers /sw.js, but only when the user
// visits the notification settings page — that's not good enough to evict
// the old SW for everyone. We register here on every web page load so the
// new SW takes over for all visitors, regardless of whether they use push.
//
// Native (Capacitor) skips this — the bundled web assets are served from
// the local filesystem and there's no stale SW on the origin to evict.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[sw] registration failed:', err);
    });
  });
}
