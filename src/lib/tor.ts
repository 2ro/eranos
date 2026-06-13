import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Native Tor connection status (mirrors the values in TorController.java). */
export type TorStatus = 'disabled' | 'connecting' | 'connected' | 'failed';

export interface TorStatusEvent {
  status: TorStatus;
  /** Best-effort bootstrap progress (0–100) parsed from arti logs. */
  bootstrapPercent: number;
  error: string | null;
  /** Tor exit-node IP from the last successful check (verification readout). */
  exitIp?: string | null;
}

export interface TorPlugin {
  /** Whether Tor is enabled in persisted native preferences. */
  isEnabled(): Promise<{ enabled: boolean }>;
  /**
   * Persist the enabled flag only, without starting or stopping arti now.
   * The persisted value controls whether arti auto-starts on the next cold
   * launch. For live activation use {@link TorPlugin.start} /
   * {@link TorPlugin.stop} (what the settings toggle calls), which both
   * change state immediately *and* persist the flag.
   */
  setEnabled(options: { enabled: boolean }): Promise<void>;
  /** Start arti now (live) and persist enabled=true. */
  start(): Promise<void>;
  /** Stop arti now (live), clear the WebView proxy, and persist enabled=false. */
  stop(): Promise<void>;
  /** Synchronous snapshot of the current status. */
  getStatus(): Promise<{ enabled: boolean } & TorStatusEvent>;
  /** Re-run the connectivity probe (used by the gate's "Retry"). */
  retry(): Promise<void>;
  addListener(
    eventName: 'torStatus',
    listener: (event: TorStatusEvent) => void,
  ): Promise<PluginListenerHandle>;
}

/**
 * The native Tor (arti) plugin. Implemented on Android only — see
 * `android/app/src/main/java/spot/agora/app/TorPlugin.java`. On web/iOS the
 * registered proxy exists but its methods reject; always guard with
 * {@link isTorSupported} (the helpers below do).
 */
export const Tor = registerPlugin<TorPlugin>('Tor');

/** Tor mode is only available on Android. */
export function isTorSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Persist the Tor enabled flag natively (no-op on unsupported platforms). */
export async function setTorEnabled(enabled: boolean): Promise<void> {
  if (!isTorSupported()) return;
  try {
    await Tor.setEnabled({ enabled });
  } catch {
    // Native plugin unavailable (e.g. older build) — ignore.
  }
}

/** Read the current native status, or `null` when Tor isn't supported. */
export async function getTorStatus(): Promise<({ enabled: boolean } & TorStatusEvent) | null> {
  if (!isTorSupported()) return null;
  try {
    return await Tor.getStatus();
  } catch {
    return null;
  }
}

/** Ask arti to re-check connectivity (no-op on unsupported platforms). */
export async function retryTor(): Promise<void> {
  if (!isTorSupported()) return;
  try {
    await Tor.retry();
  } catch {
    // ignore
  }
}

/** Start arti now (live activation). No-op on unsupported platforms. */
export async function startTor(): Promise<void> {
  if (!isTorSupported()) return;
  try {
    await Tor.start();
  } catch {
    // ignore
  }
}

/** Stop arti now (live deactivation). No-op on unsupported platforms. */
export async function stopTor(): Promise<void> {
  if (!isTorSupported()) return;
  try {
    await Tor.stop();
  } catch {
    // ignore
  }
}
