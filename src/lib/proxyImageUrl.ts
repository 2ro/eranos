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

/**
 * Fetch a remote image and return its bytes as a `File`, routed through the
 * configured image proxy so the request is CORS-safe and can later be drawn
 * onto a `<canvas>` without tainting it.
 *
 * This is the canvas-safe counterpart to {@link proxyImageUrl}: where that
 * helper produces an `<img src>` (and tolerates `data:`/`.svg` pass-through),
 * this one needs the *bytes* and therefore forces everything — including SVGs
 * — through the proxy, which rasterizes to PNG. Without that, a cross-origin
 * `fetch()` of an arbitrary host (or an SVG the proxy would otherwise skip)
 * fails CORS and the crop/encode pipeline silently dies.
 *
 * `data:` URIs are fetched directly — they carry their own bytes and never
 * hit the network or a CORS check.
 *
 * @param src           Original image URL.
 * @param proxyBaseUrl  Base URL of a wsrv.nl-compatible proxy. Falls back to
 *                      `https://wsrv.nl` when empty, since a direct fetch of an
 *                      arbitrary origin would almost always fail CORS.
 * @param filename      Base filename for the returned `File`.
 */
export async function fetchImageAsFile(
  src: string,
  proxyBaseUrl: string,
  filename = 'pasted-image',
): Promise<File> {
  // data: URIs carry their own bytes — fetch directly, no proxy, no CORS.
  const fetchUrl = src.startsWith('data:')
    ? src
    : proxyFetchUrl(src, proxyBaseUrl || 'https://wsrv.nl');

  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('Fetched resource is not an image');
  }

  const ext = blob.type === 'image/png' ? '.png'
    : blob.type === 'image/webp' ? '.webp'
    : '.jpg';

  return new File([blob], `${filename}${ext}`, { type: blob.type });
}

/**
 * Build a proxy URL for *fetching bytes* (as opposed to an `<img src>`).
 * Unlike {@link proxyImageUrl} this forces SVGs through the proxy so they
 * rasterize, and omits the width cap so the cropper gets full resolution.
 */
function proxyFetchUrl(src: string, proxyBaseUrl: string): string {
  let parsedProxy: URL;
  try {
    parsedProxy = new URL(proxyBaseUrl);
  } catch {
    return src;
  }
  if (parsedProxy.protocol !== 'https:') return src;

  const base = (parsedProxy.origin + parsedProxy.pathname).replace(/\/+$/, '');
  const params = new URLSearchParams({ url: src, output: 'png' });
  return `${base}/?${params.toString()}`;
}

