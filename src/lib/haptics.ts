import { Capacitor } from '@capacitor/core';

/**
 * Centralized haptic feedback utility.
 *
 * On native (iOS/Android) it uses @capacitor/haptics for true taptic engine
 * feedback. On web it falls back to navigator.vibrate() which works on
 * Android browsers but is a silent no-op elsewhere.
 */

type ImpactStyle = 'Heavy' | 'Medium' | 'Light';
type NotificationType = 'Success' | 'Warning' | 'Error';

// Lazy-loaded Haptics plugin — only imported on native to avoid bundling
// the plugin in web builds where it isn't useful.
let hapticsPromise: Promise<typeof import('@capacitor/haptics')> | null = null;

function getHaptics() {
  if (!hapticsPromise) {
    hapticsPromise = import('@capacitor/haptics');
  }
  return hapticsPromise;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function nativeImpact(style: ImpactStyle) {
  const { Haptics, ImpactStyle } = await getHaptics();
  await Haptics.impact({ style: ImpactStyle[style] });
}

async function nativeNotification(type: NotificationType) {
  const { Haptics, NotificationType } = await getHaptics();
  await Haptics.notification({ type: NotificationType[type] });
}

async function nativeSelectionChanged() {
  const { Haptics } = await getHaptics();
  await Haptics.selectionChanged();
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* Vibration API not available */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

function warnHapticError(label: string, err: unknown) {
  console.warn(`[haptics] ${label} failed:`, err);
}

/** Light tap — reactions, reposts, bookmarks, share. */
export function impactLight(): void {
  if (Capacitor.isNativePlatform()) {
    nativeImpact('Light').catch((e) => warnHapticError('impactLight', e));
  } else {
    vibrate(10);
  }
}

/** Medium tap — primary action press, pull-to-refresh threshold, follow. */
export function impactMedium(): void {
  if (Capacitor.isNativePlatform()) {
    nativeImpact('Medium').catch((e) => warnHapticError('impactMedium', e));
  } else {
    vibrate(20);
  }
}

/** Success notification — action completed successfully, post published. */
export function notificationSuccess(): void {
  if (Capacitor.isNativePlatform()) {
    nativeNotification('Success').catch((e) => warnHapticError('notificationSuccess', e));
  } else {
    vibrate(15);
  }
}

/** Selection changed — toggle switches, tab taps, picker changes. */
export function selectionChanged(): void {
  if (Capacitor.isNativePlatform()) {
    nativeSelectionChanged().catch((e) => warnHapticError('selectionChanged', e));
  } else {
    vibrate(5);
  }
}
