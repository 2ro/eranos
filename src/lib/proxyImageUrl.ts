/**
 * Rewrite an image URL through a wsrv.nl-compatible image-resizing proxy.
 *
 * When `proxyBaseUrl` is empty the original `src` is returned unchanged.
 * Otherwise the URL is rewritten to fetch a `width`-pixel-wide WebP at
 * quality 75 from the proxy, with the original URL passed as the `default`
 * parameter so the proxy falls back to redirecting to the origin if it
 * cannot fetch or transcode upstream.
 *
 * The proxy must speak the wsrv.nl / weserv API
 * (https://github.com/weserv/images). Pointing this at an `imgproxy` or
 * other non-weserv backend will not work.
 *
 * Skip rules (pass through unchanged):
 *   - empty `proxyBaseUrl` or `src`
 *   - `proxyBaseUrl` that doesn't parse as an `https:` URL (defense in
 *     depth — settings input is user-controlled, this prevents pathological
 *     values like `javascript:` from landing in an `<img src>`)
 *   - `data:` URIs
 *   - `.svg` URLs (proxy would rasterize, defeating the point)
 *   - URLs already routed through wsrv.nl or the configured proxy
 *
 * @param src           Original image URL.
 * @param width         Target width in pixels (aspect ratio preserved).
 * @param proxyBaseUrl  Base URL of the proxy (`''` = disabled).
 */
export function proxyImageUrl(
  src: string,
  width: number,
  proxyBaseUrl: string,
): string {
  if (!proxyBaseUrl || !src) return src;

  // Validate the proxy URL is well-formed https. Anything else (malformed,
  // `javascript:`, `data:`, `http:`, etc.) bypasses the proxy and returns
  // the original URL — better a missed optimization than a broken page or
  // an injected URL scheme.
  let parsedProxy: URL;
  try {
    parsedProxy = new URL(proxyBaseUrl);
  } catch {
    return src;
  }
  if (parsedProxy.protocol !== 'https:') return src;

  // Don't proxy data: URIs, SVGs, or already-proxied URLs.
  if (src.startsWith('data:') || src.endsWith('.svg')) return src;
  if (src.includes('wsrv.nl') || src.includes(proxyBaseUrl)) return src;

  // Normalize: strip trailing slash from the validated origin+path.
  const base = (parsedProxy.origin + parsedProxy.pathname).replace(/\/+$/, '');

  const params = new URLSearchParams({
    url: src,
    w: String(width),
    output: 'webp',
    q: '75',
    default: src,
  });

  return `${base}/?${params.toString()}`;
}

