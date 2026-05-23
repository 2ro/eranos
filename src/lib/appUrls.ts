/** Canonical public origin for links that should open the production Agora app. */
export const AGORA_ORIGIN = 'https://agora.spot';

/** Hostname for platform integrations that require a domain instead of an origin. */
export const AGORA_HOST = new URL(AGORA_ORIGIN).hostname;

/** Build a public Agora URL from a root-relative path or bare path segment. */
export function buildAgoraUrl(path = ''): string {
  const normalizedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `${AGORA_ORIGIN}${normalizedPath}`;
}
