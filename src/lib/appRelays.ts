import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * The project's own relay — the ONLY relay Eranos talks to. No federation with
 * foreign relays. Change this single constant to swap the relay (e.g. to
 * wss://nrelay.us-ea.st/); everything below and APP_RELAYS derive from it.
 */
export const OUR_RELAY = 'wss://relay.floonet.dev/';

/**
 * Relay used for NIP-50 search, trending, and streaming queries.
 * Pinned to our relay — search/trending degrade to whatever it returns rather
 * than dialing out to foreign search relays.
 */
export const DITTO_RELAY = OUR_RELAY;

/** Search/trending/streaming relay set — pinned to our relay only. */
export const DITTO_RELAYS: string[] = [OUR_RELAY];

/**
 * Relay formerly used for kind 34236 addressable short video events (divine).
 * Pinned to our relay so video resolution never dials out.
 */
export const DIVINE_RELAY = OUR_RELAY;

/**
 * Relay formerly used for Zapstore app metadata (kind 32267) and releases
 * (kind 30063). Pinned to our relay so zapstore lookups never dial out.
 */
export const ZAPSTORE_RELAY = OUR_RELAY;

/** Normalize a relay URL for deduplication (lowercase, strip trailing slash). */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * App default relays that are used as a fallback when the user has no NIP-65 relay list,
 * and can be optionally combined with user relays.
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: OUR_RELAY, read: true, write: true },
  ],
  updatedAt: 0,
};

/**
 * Get the effective relay list based on user settings.
 *
 * - `useAppRelays`: when true, the app-default relays are included (first).
 * - `useUserRelays`: when true, the user's personal NIP-65 list is included.
 *
 * When both flags are off the result is empty. When both are on the two lists
 * are merged with app relays first, deduplicated by normalized URL.
 */
export function getEffectiveRelays(
  userRelays: RelayMetadata,
  useAppRelays: boolean,
  useUserRelays: boolean,
): RelayMetadata {
  const seen = new Set<string>();
  const mergedRelays: RelayMetadata['relays'][number][] = [];

  const sources: RelayMetadata['relays'] = [];
  if (useAppRelays) sources.push(...APP_RELAYS.relays);
  if (useUserRelays) sources.push(...userRelays.relays);

  for (const relay of sources) {
    const normalized = normalizeUrl(relay.url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      mergedRelays.push(relay);
    }
  }

  return {
    relays: mergedRelays,
    updatedAt: userRelays.updatedAt,
  };
}
