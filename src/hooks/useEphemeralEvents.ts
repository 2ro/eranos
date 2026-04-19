import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { decode } from 'ngeohash';
import { fetchGeoRelays, type GeoRelay } from '@/lib/georelays';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';

/**
 * Map-ready ephemeral chat event (kind 20000 — public, or 20001 — private).
 *
 * See NIP.md → Kinds 20000/20001 for the tag schema. The `g` tag carries the
 * geohash that anchors the message on the world map.
 */
export interface EphemeralEventData {
  event: NostrEvent;
  geohash?: string;
  nickname?: string;
  message: string;
}

const EPHEMERAL_KINDS = [20000, 20001];
const ONE_HOUR_SECONDS = 60 * 60;

/** Default relay set, always included so chat works even before the geo CSV
 *  resolves. */
const DEFAULT_CHAT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

function validateEphemeralEvent(event: NostrEvent): boolean {
  if (event.kind !== 20000 && event.kind !== 20001) return false;
  // Must be anchored to a geohash to be useful for the map / heat layer.
  return !!event.tags.find(([name]) => name === 'g')?.[1];
}

function transformEphemeralEvent(event: NostrEvent): EphemeralEventData {
  return {
    event,
    geohash: event.tags.find(([name]) => name === 'g')?.[1],
    nickname: event.tags.find(([name]) => name === 'n')?.[1],
    message: event.content,
  };
}

/**
 * Pick a stable rolling window of geo relays so the same set of pages share
 * the same shard for ~5 minutes (cuts down on connection churn) without ever
 * sticking to one slice forever.
 */
function rotatingGeoRelays(geoRelays: GeoRelay[], count: number): string[] {
  if (geoRelays.length === 0) return [];
  const rotationIndex = Math.floor(Date.now() / 300_000) % geoRelays.length;
  return geoRelays.slice(rotationIndex, rotationIndex + count).map((r) => r.url);
}

/**
 * Fetch recent ephemeral chat events for the world map.
 *
 * - When `targetGeohash` is provided we only ask the closest geo relays for
 *   that prefix (chat-detail mode).
 * - Without it we fan out to default relays plus a rotating window of geo
 *   relays so the map shows activity from everywhere (heatmap mode).
 *
 * Always returns events from the last `ONE_HOUR_SECONDS` window — older
 * ephemeral events are uninteresting for "what's happening right now".
 */
export function useEphemeralEvents(targetGeohash?: string) {
  const { nostr } = useNostr();
  const { isLoading: accountsLoading } = useLoggedInAccounts();

  return useQuery({
    queryKey: ['ephemeral-events', targetGeohash ?? '__global__'],
    enabled: !accountsLoading,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(60_000)]);
      const since = Math.floor(Date.now() / 1000) - ONE_HOUR_SECONDS;

      // ── Chat detail mode: scope to nearest geo relays only. ──────────────
      if (targetGeohash) {
        try {
          const geoRelays = await fetchGeoRelays();
          // Touch decode so an obviously bad geohash throws here rather than
          // mid-render later.
          decode(targetGeohash);
          const closest = geoRelays.slice(0, 8).map((r) => r.url);
          const relays = closest.length > 0 ? closest : DEFAULT_CHAT_RELAYS;
          const events = await nostr
            .group(relays)
            .query([{ kinds: EPHEMERAL_KINDS, since, limit: 500 }], { signal });
          return events.filter(validateEphemeralEvent).map(transformEphemeralEvent);
        } catch (error) {
          console.error('Failed to fetch ephemeral events for geohash:', error);
          const events = await nostr
            .group(DEFAULT_CHAT_RELAYS)
            .query([{ kinds: EPHEMERAL_KINDS, since, limit: 500 }], { signal });
          return events.filter(validateEphemeralEvent).map(transformEphemeralEvent);
        }
      }

      // ── Global heatmap mode: defaults + rotating geo relays. ─────────────
      const allEvents: NostrEvent[] = [];
      const failedRelays = new Set<string>();

      try {
        const defaultEvents = await nostr
          .group(DEFAULT_CHAT_RELAYS)
          .query([{ kinds: EPHEMERAL_KINDS, since, limit: 300 }], {
            signal: AbortSignal.timeout(8_000),
          });
        allEvents.push(...defaultEvents);
      } catch (error) {
        console.warn('Ephemeral events: default relay phase failed:', error);
        DEFAULT_CHAT_RELAYS.forEach((r) => failedRelays.add(r));
      }

      try {
        const geoRelays = await fetchGeoRelays();
        const rotation = rotatingGeoRelays(geoRelays, 8).filter(
          (url) => !failedRelays.has(url) && !DEFAULT_CHAT_RELAYS.includes(url),
        );

        // Process in batches of 4 to avoid overwhelming the connection pool.
        const batchSize = 4;
        for (let i = 0; i < rotation.length; i += batchSize) {
          const batch = rotation.slice(i, i + batchSize);
          const batchResults = await Promise.allSettled(
            batch.map((url) =>
              nostr
                .relay(url)
                .query([{ kinds: EPHEMERAL_KINDS, since, limit: 200 }], {
                  signal: AbortSignal.timeout(8_000),
                })
                .catch((err) => {
                  console.warn(`Ephemeral events: ${url} failed:`, err);
                  failedRelays.add(url);
                  return [] as NostrEvent[];
                }),
            ),
          );
          for (const result of batchResults) {
            if (result.status === 'fulfilled') allEvents.push(...result.value);
          }
          if (i + batchSize < rotation.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      } catch (geoError) {
        console.warn('Ephemeral events: geo relay phase failed:', geoError);
      }

      const unique = Array.from(new Map(allEvents.map((e) => [e.id, e])).values());
      return unique.filter(validateEphemeralEvent).map(transformEphemeralEvent);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}
