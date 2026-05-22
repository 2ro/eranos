import { createRoot } from 'react-dom/client';

// Import polyfills first (Buffer must be globally available before bitcoinjs-lib)
import './lib/polyfills.ts';

// Initialize ECC library for bitcoinjs-lib (Taproot / Schnorr support). Must
// happen before any code path that calls bitcoin.payments.p2tr / Psbt.sign,
// so render-time helpers like nostrPubkeyToBitcoinAddress don't fail on
// first paint.
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
bitcoin.initEccLib(ecc);

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
import '@fontsource/bebas-neue/400.css';

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

// ─── Service worker registration (web only) ─────────────────────────────────
//
// Register /sw.js unconditionally on web. The SW itself (public/sw.js) has
// no fetch handler and wipes caches on activate — see that file for the
// stale-SW eviction story.
//
// This registration does NOT fix the stale-SW problem on its own: returning
// users with the old precache SW never run any of our new JS, because the
// old SW serves the old bundle from cache. The browser evicts the old SW
// out-of-band by re-fetching /sw.js on its own update schedule, and the
// new SW's activate handler does the actual cache wipe + tab reload.
//
// What this registration buys us is forward-looking insurance: it ensures
// every web visitor has a SW in place, so the next time we need to ship an
// emergency cache bust via /sw.js, there's something for the browser to
// update. Without it, only push-enabled users (who hit
// usePushNotifications) would ever have a SW registered.
//
// Native (Capacitor) skips this — assets are served from the local
// filesystem, no SW involved.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[sw] registration failed:', err);
    });
  });
}
