import { useAppContext } from '@/hooks/useAppContext';
import { AGORA_ORIGIN } from '@/lib/appUrls';

/**
 * Returns the origin to use when building shareable URLs (QR codes,
 * copy-link, remote-login callbacks, etc). Prefers `config.shareOrigin`
 * when set, otherwise falls back to Agora's canonical production origin.
 *
 * The returned value never has a trailing slash.
 *
 * Why this exists: on Capacitor, `window.location.origin` resolves to
 * `capacitor://localhost` (iOS) or `https://localhost` (Android), which
 * produces broken shareable URLs.
 */
export function useShareOrigin(): string {
  const { config } = useAppContext();
  const configured = config.shareOrigin?.replace(/\/+$/, '');
  if (configured) return configured;
  return AGORA_ORIGIN;
}
