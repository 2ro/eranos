import type { QueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Invalidate the NIP-85 stats queries for a given event so that
 * reaction / repost / comment counts update in the UI after the
 * user performs an action against it.
 *
 * Handles both regular events (`['nip85-event-stats', eventId, statsPubkey]`)
 * and addressable events (`['nip85-addr-stats', '<kind>:<pubkey>:<d>', statsPubkey]`).
 *
 * Pass `statsPubkey` from `useAppContext().config.nip85StatsPubkey`. When the
 * configured pubkey isn't known, the function still issues a prefix-match
 * invalidation so any cached entry refreshes.
 *
 * `eventOrId` accepts either a hex event id (regular event) or a full
 * `NostrEvent`. Passing the event allows us to detect addressable kinds
 * (10000–19999, 30000–39999) and invalidate the matching `nip85-addr-stats`
 * key too.
 */
export function invalidateEventStats(
  queryClient: QueryClient,
  eventOrId: NostrEvent | string,
  statsPubkey?: string,
): void {
  if (typeof eventOrId === 'string') {
    queryClient.invalidateQueries({ queryKey: ['nip85-event-stats', eventOrId, statsPubkey] });
    // Also a prefix sweep, in case statsPubkey was undefined when the cache
    // entry was created (e.g. early load before config hydration).
    queryClient.invalidateQueries({ queryKey: ['nip85-event-stats', eventOrId] });
    return;
  }

  const event = eventOrId;
  queryClient.invalidateQueries({ queryKey: ['nip85-event-stats', event.id, statsPubkey] });
  queryClient.invalidateQueries({ queryKey: ['nip85-event-stats', event.id] });

  const isAddressable =
    (event.kind >= 30000 && event.kind < 40000) ||
    (event.kind >= 10000 && event.kind < 20000);
  if (isAddressable) {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const addr = `${event.kind}:${event.pubkey}:${d}`;
    queryClient.invalidateQueries({ queryKey: ['nip85-addr-stats', addr, statsPubkey] });
    queryClient.invalidateQueries({ queryKey: ['nip85-addr-stats', addr] });
  }
}
