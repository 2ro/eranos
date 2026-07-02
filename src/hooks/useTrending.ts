import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNip85EventStats, useNip85AddrStats } from '@/hooks/useNip85Stats';
import { type ResolvedEmoji } from '@/lib/customEmoji';

/** The stats shape returned by useEventStats. */
interface EventStats {
  replies: number;
  reposts: number;
  quotes: number;
  reactions: number;
  reactionEmojis: ResolvedEmoji[];
}

const EMPTY_STATS: EventStats = { replies: 0, reposts: 0, quotes: 0, reactions: 0, reactionEmojis: [] };

/** Check whether a kind falls in an addressable range (NIP-33 kinds 30000-39999). */
function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** Compute the NIP-33 `a`-tag coordinate string for an addressable event. */
function getAddrString(event: NostrEvent): string | undefined {
  if (!isAddressableKind(event.kind)) return undefined;
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${event.kind}:${event.pubkey}:${dTag}`;
}

/**
 * Counts engagement (replies, reposts, quotes, reactions) for a given event.
 * For addressable events (kinds 30000-39999 + 0, 3), uses NIP-85 kind 30384 (addr stats).
 * For regular events, uses NIP-85 kind 30383 (event stats).
 *
 * Returns a shape compatible with useQuery ({ data, isLoading }) by transforming
 * the underlying NIP-85 query data via useMemo.
 */
export function useEventStats(eventId: string | undefined, event?: NostrEvent) {
  const addr = event ? getAddrString(event) : undefined;
  const nip85 = useNip85EventStats(addr ? undefined : eventId);
  const nip85Addr = useNip85AddrStats(addr);

  const source = addr ? nip85Addr : nip85;

  const data = useMemo<EventStats>(() => {
    if (!source.data) return EMPTY_STATS;
    return {
      replies: source.data.commentCount,
      reposts: source.data.repostCount,
      quotes: 0,
      reactions: source.data.reactionCount,
      reactionEmojis: [],
    };
  }, [source.data]);

  return { data, isLoading: source.isLoading };
}


