import { useCallback } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { proxyImageUrl } from '@/lib/proxyImageUrl';

/**
 * Returns a memoized function that rewrites an image URL through the
 * configured image proxy. When the proxy is disabled (empty string) the
 * function returns the original URL unchanged.
 *
 * Per-context widths are chosen at the call site — see `ProxiedImage`
 * (`src/components/ProxiedImage.tsx`) for the standard widths used across
 * the app. Avoid calling `proxyImageUrl` directly except where a hook
 * cannot be used (CSS `background-image`, helper modules, etc.).
 *
 * Usage:
 *   const proxy = useImageProxy();
 *   <img src={proxy(url, 600)} />
 */
export function useImageProxy() {
  const { config } = useAppContext();
  const proxyBaseUrl = config.imageProxy;

  return useCallback(
    (src: string, width: number) => proxyImageUrl(src, width, proxyBaseUrl),
    [proxyBaseUrl],
  );
}
