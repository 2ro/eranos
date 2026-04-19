/**
 * Geo-located Nostr relay catalogue. Used by the ephemeral chat surface
 * (kinds 20000/20001) to route reads/writes to relays physically near the
 * geohash being chatted about, which dramatically reduces latency for
 * realtime conversations.
 *
 * Source CSV (`relayUrl,latitude,longitude` per line) is maintained by the
 * permissionlesstech project. We cache the parsed catalogue in module scope
 * for the lifetime of the page so we never re-fetch.
 */

export interface GeoRelay {
  url: string;
  latitude: number;
  longitude: number;
}

const GEORELAYS_CSV_URL =
  'https://raw.githubusercontent.com/permissionlesstech/georelays/refs/heads/main/nostr_relays.csv';

let geoRelaysCache: GeoRelay[] | null = null;
let geoRelaysFetchPromise: Promise<GeoRelay[]> | null = null;

export async function fetchGeoRelays(): Promise<GeoRelay[]> {
  if (geoRelaysCache) return geoRelaysCache;
  if (geoRelaysFetchPromise) return geoRelaysFetchPromise;

  geoRelaysFetchPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(GEORELAYS_CSV_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const csvText = await response.text();
      clearTimeout(timeoutId);

      const relays: GeoRelay[] = [];
      const lines = csvText.trim().split('\n');

      // Yield to the UI thread between batches so a 1000+ row CSV doesn't
      // block the main thread on slow devices.
      const batchSize = 100;
      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, i + batchSize);
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (const line of batch) {
          const parts = line.split(',');
          if (parts.length < 3) continue;
          const rawUrl = parts[0].trim();
          const latitude = parseFloat(parts[1]);
          const longitude = parseFloat(parts[2]);
          if (!rawUrl || isNaN(latitude) || isNaN(longitude)) continue;
          const url = rawUrl.startsWith('wss://') ? rawUrl : `wss://${rawUrl}`;
          relays.push({ url, latitude, longitude });
        }
      }

      geoRelaysCache = relays;
      return relays;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Failed to fetch geo relays:', error);
      geoRelaysFetchPromise = null;
      return [];
    }
  })();

  return geoRelaysFetchPromise;
}

/** Haversine great-circle distance in kilometres. */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Return the `count` geo-relays nearest to the given coordinates. */
export function findClosestRelays(
  relays: GeoRelay[],
  targetLat: number,
  targetLng: number,
  count = 5,
): GeoRelay[] {
  if (relays.length === 0) return [];
  return relays
    .map((relay) => ({
      relay,
      distance: calculateDistance(targetLat, targetLng, relay.latitude, relay.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(({ relay }) => relay);
}
