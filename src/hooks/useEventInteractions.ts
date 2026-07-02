import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { isCustomEmoji, getCustomEmojiUrl } from '@/lib/customEmoji';

export interface RepostEntry {
  eventId: string;
  pubkey: string;
  createdAt: number;
}

export interface ReactionEntry {
  /** The kind 7 reaction event's ID. */
  eventId: string;
  pubkey: string;
  emoji: string;
  /** For NIP-30 custom emojis, the image URL. */
  emojiUrl?: string;
  createdAt: number;
}

export interface QuoteEntry {
  pubkey: string;
  eventId: string;
  content: string;
  createdAt: number;
}

interface EventInteractions {
  reposts: RepostEntry[];
  quotes: QuoteEntry[];
  reactions: ReactionEntry[];
}

/** Fetches interaction events (reposts, quotes, reactions) for a given event ID. */
export function useEventInteractions(eventId: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<EventInteractions>({
    queryKey: ['event-interactions', eventId ?? ''],
    queryFn: async ({ signal }) => {
      if (!eventId) return { reposts: [], quotes: [], reactions: [] };

      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);

      // Single query with two filter objects — relay handles as OR
      const allEvents = await nostr.query(
        [
          { kinds: [6, 16, 7], '#e': [eventId], limit: 50 },
          { kinds: [1], '#q': [eventId], limit: 20 },
        ],
        { signal: combined },
      );

      const eTagEvents = allEvents.filter(e => e.kind !== 1 || e.tags.some(([n, v]) => n === 'e' && v === eventId));
      const qTagEvents = allEvents.filter(e => e.kind === 1 && e.tags.some(([n, v]) => n === 'q' && v === eventId));

      const reposts: RepostEntry[] = [];
      const quotes: QuoteEntry[] = [];
      const reactions: ReactionEntry[] = [];

      for (const e of eTagEvents) {
        switch (e.kind) {
          case 6:
          case 16:
            reposts.push({
              eventId: e.id,
              pubkey: e.pubkey,
              createdAt: e.created_at,
            });
            break;
          case 7: {
            const rawEmoji = e.content.trim();
            const emoji = (rawEmoji === '+' || rawEmoji === '') ? '👍' : rawEmoji;
            const isCustom = isCustomEmoji(emoji);
            const emojiUrl = isCustom ? getCustomEmojiUrl(emoji, e.tags) : undefined;
            // Skip malformed custom emoji reactions (shortcode without emoji tag)
            if (isCustom && !emojiUrl) break;
            reactions.push({
              eventId: e.id,
              pubkey: e.pubkey,
              emoji,
              emojiUrl,
              createdAt: e.created_at,
            });
            break;
          }
        }
      }

      for (const e of qTagEvents) {
        quotes.push({
          pubkey: e.pubkey,
          eventId: e.id,
          content: e.content,
          createdAt: e.created_at,
        });
      }

      // Sort by most recent first
      reposts.sort((a, b) => b.createdAt - a.createdAt);
      quotes.sort((a, b) => b.createdAt - a.createdAt);
      reactions.sort((a, b) => b.createdAt - a.createdAt);

      return { reposts, quotes, reactions };
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  });
}
