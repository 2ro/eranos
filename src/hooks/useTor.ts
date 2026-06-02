import { useEffect, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  Tor,
  isTorSupported,
  getTorStatus,
  startTor,
  stopTor,
  type TorStatus,
} from '@/lib/tor';

export interface UseTor {
  /** Whether Tor mode is available on this platform (Android only). */
  supported: boolean;
  /** Whether Tor is enabled in native preferences. */
  enabled: boolean;
  /** False until the first native status has been read (used to avoid a UI flash). */
  loaded: boolean;
  status: TorStatus;
  bootstrapPercent: number;
  error: string | null;
  /** Tor exit-node IP from the last successful check, when connected. */
  exitIp: string | null;
  /** Persist the enabled flag natively. Takes effect on next app launch. */
  setEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Subscribes to native Tor (arti) status and exposes the enable toggle.
 * Safe to call on any platform — it simply reports `supported: false` and a
 * `disabled` status off Android.
 */
export function useTor(): UseTor {
  const supported = isTorSupported();
  const [enabled, setEnabledState] = useState(false);
  const [loaded, setLoaded] = useState(!isTorSupported());
  const [status, setStatus] = useState<TorStatus>('disabled');
  const [bootstrapPercent, setBootstrapPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exitIp, setExitIp] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;

    let active = true;
    let handle: PluginListenerHandle | undefined;

    getTorStatus().then((s) => {
      if (!active) return;
      if (s) {
        setEnabledState(s.enabled);
        setStatus(s.status);
        setBootstrapPercent(s.bootstrapPercent);
        setError(s.error);
        setExitIp(s.exitIp ?? null);
      }
      setLoaded(true);
    });

    Tor.addListener('torStatus', (e) => {
      setStatus(e.status);
      setBootstrapPercent(e.bootstrapPercent);
      setError(e.error);
      setExitIp(e.exitIp ?? null);
    }).then((h) => {
      if (active) {
        handle = h;
      } else {
        h.remove();
      }
    });

    return () => {
      active = false;
      handle?.remove();
    };
  }, [supported]);

  // Live activation: starting/stopping arti also persists the enabled flag
  // natively, so it auto-starts again on the next cold launch.
  const setEnabled = async (next: boolean) => {
    if (next) {
      await startTor();
    } else {
      await stopTor();
    }
    setEnabledState(next);
  };

  return { supported, enabled, loaded, status, bootstrapPercent, error, exitIp, setEnabled };
}
