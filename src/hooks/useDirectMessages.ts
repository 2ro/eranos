import { useNostr } from '@nostrify/react';
import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from './useAppContext';

/** NIP-04 encrypted direct message kind. */
export const DM_KIND = 4;

const PAGE_SIZE = 200;

/** A decrypted (or undecryptable) message in a conversation. */
export interface DirectMessage {
  id: string;
  /** Author of the event (the sender). */
  pubkey: string;
  /** The counterparty in this conversation (always the *other* person). */
  peer: string;
  /** Whether the logged-in user authored this message. */
  outgoing: boolean;
  createdAt: number;
  /** Decrypted plaintext, or `null` if decryption failed. */
  content: string | null;
  event: NostrEvent;
}

/** A single conversation summary with enough data to lazily decrypt its thread. */
export interface Conversation {
  peer: string;
  events: NostrEvent[];
  messageCount: number;
  latest: DirectMessage;
}

/** Minimal thread target; used for existing conversations and blank outbound threads. */
export interface DirectMessageThreadTarget {
  peer: string;
  events: NostrEvent[];
  messageCount: number;
}

interface DirectMessagesPage {
  conversations: Conversation[];
  sentUntil: number | null;
  receivedUntil: number | null;
}

interface DirectMessagesCursor {
  sentUntil?: number | null;
  receivedUntil?: number | null;
}

/** Extract the first `p` tag value (the recipient) from a kind-4 event. */
function recipientOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'p')?.[1];
}

/** True if the signer can perform NIP-04 encryption. */
export function useHasDmSupport(): boolean {
  const { user } = useCurrentUser();
  return !!user?.signer.nip04;
}

/**
 * Loads NIP-04 (kind-4) direct messages for the logged-in user in pages,
 * decrypts only each conversation's latest preview, and groups them into
 * conversations sorted by most-recent activity. Full threads decrypt lazily in
 * `useDirectMessageThread` after the user selects a conversation.
 *
 * Messages are read from the app's configured relays. Rather than going
 * through the shared pool (whose `eoseTimeout` resolves a query as soon as the
 * *first* relay sends EOSE — which dropped conversations held only by slower
 * relays and produced a different, incomplete count on every refresh), this
 * fans the query out to each read relay individually and merges the results.
 * Each per-relay `query()` resolves on that relay's own EOSE, so every relay
 * gets to deliver its events (bounded by an overall 8s cap). NIP-04 leaks
 * metadata and is deprecated in favor of NIP-44/NIP-17; this exists for interop
 * with clients that still send kind-4 DMs.
 */
export function useDirectMessages() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const self = user?.pubkey;

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url),
    [config.relayMetadata.relays],
  );

  const query = useInfiniteQuery<
    DirectMessagesPage,
    Error,
    InfiniteData<DirectMessagesPage, DirectMessagesCursor>,
    readonly unknown[],
    DirectMessagesCursor
  >({
    queryKey: ['direct-messages', self, readRelays],
    enabled: !!self && !!user?.signer.nip04,
    initialPageParam: {},
    queryFn: async ({ signal, pageParam }) => {
      if (!self || !user?.signer.nip04) {
        return { conversations: [], sentUntil: null, receivedUntil: null };
      }
      const nip04 = user.signer.nip04;

      // Ditto's feed paginates with oldest-timestamp cursors instead of loading
      // the full history up front. DMs need separate cursors for sent and
      // received filters so one high-volume direction does not skip the other.
      const filters: NostrFilter[] = [];
      if (pageParam.sentUntil !== null) {
        filters.push({
          kinds: [DM_KIND],
          authors: [self],
          limit: PAGE_SIZE,
          ...(pageParam.sentUntil === undefined ? {} : { until: pageParam.sentUntil }),
        });
      }
      if (pageParam.receivedUntil !== null) {
        filters.push({
          kinds: [DM_KIND],
          '#p': [self],
          limit: PAGE_SIZE,
          ...(pageParam.receivedUntil === undefined ? {} : { until: pageParam.receivedUntil }),
        });
      }

      if (filters.length === 0) {
        return { conversations: [], sentUntil: null, receivedUntil: null };
      }

      const timeout = AbortSignal.timeout(8000);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort);
      timeout.addEventListener('abort', onAbort);

      const byId = new Map<string, NostrEvent>();
      try {
        if (readRelays.length > 0) {
          // Query each read relay individually and merge. Going through the
          // shared pool resolves on the first relay's EOSE (+ a short
          // eoseTimeout), which silently drops DMs held only by slower relays.
          // Per-relay queries each resolve on their own EOSE, so every relay
          // contributes its full set before we merge (deduped by event id).
          const perRelay = await Promise.allSettled(
            readRelays.map((url) =>
              nostr.relay(url).query(filters, { signal: controller.signal }),
            ),
          );
          for (const result of perRelay) {
            if (result.status !== 'fulfilled') continue;
            for (const event of result.value) {
              byId.set(event.id, event);
            }
          }
        } else {
          // No read relays configured — fall back to the default pool.
          const events = await nostr.query(filters, { signal: controller.signal });
          for (const event of events) {
            byId.set(event.id, event);
          }
        }
      } catch {
        // Abort (unmount/timeout) — fall through with whatever we collected.
      } finally {
        signal?.removeEventListener('abort', onAbort);
        timeout.removeEventListener('abort', onAbort);
      }

      const pageEvents = [...byId.values()];
      const sentEvents = pageEvents.filter((event) => event.pubkey === self);
      const receivedEvents = pageEvents.filter((event) => recipientOf(event) === self);
      const nextSentUntil = getNextUntil(sentEvents);
      const nextReceivedUntil = getNextUntil(receivedEvents);

      // Group by counterparty pubkey.
      const byPeer = new Map<string, NostrEvent[]>();
      for (const event of pageEvents) {
        const outgoing = event.pubkey === self;
        const peer = outgoing ? recipientOf(event) : event.pubkey;
        if (!peer) continue;
        const list = byPeer.get(peer) ?? [];
        list.push(event);
        byPeer.set(peer, list);
      }

      const conversations: Conversation[] = [];
      for (const [peer, peerEvents] of byPeer) {
        peerEvents.sort((a, b) => a.created_at - b.created_at);

        const latestEvent = peerEvents[peerEvents.length - 1];
        if (!latestEvent) continue;
        conversations.push({
          peer,
          events: peerEvents,
          messageCount: peerEvents.length,
          latest: await decryptMessage({ event: latestEvent, peer, self, nip04 }),
        });
      }

      // Most-recently-active conversations first.
      conversations.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
      return { conversations, sentUntil: nextSentUntil, receivedUntil: nextReceivedUntil };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.sentUntil === null && lastPage.receivedUntil === null) return undefined;
      return { sentUntil: lastPage.sentUntil, receivedUntil: lastPage.receivedUntil };
    },
  });

  const conversations = useMemo(() => mergeConversationPages(query.data), [query.data]);

  return { ...query, data: conversations, pageCount: query.data?.pages.length ?? 0 };
}

function getNextUntil(events: NostrEvent[]): number | null {
  if (events.length < PAGE_SIZE) return null;
  const oldest = Math.min(...events.map((event) => event.created_at));
  if (!Number.isFinite(oldest)) return null;
  return oldest - 1;
}

function mergeConversationPages(data: { pages: DirectMessagesPage[] } | undefined): Conversation[] | undefined {
  if (!data) return undefined;
  const byPeer = new Map<string, Conversation>();

  for (const page of data.pages) {
    for (const conversation of page.conversations) {
      const existing = byPeer.get(conversation.peer);
      if (!existing) {
        byPeer.set(conversation.peer, { ...conversation, events: [...conversation.events] });
        continue;
      }

      const seen = new Set(existing.events.map((event) => event.id));
      for (const event of conversation.events) {
        if (!seen.has(event.id)) {
          existing.events.push(event);
          seen.add(event.id);
        }
      }
      existing.events.sort((a, b) => a.created_at - b.created_at);
      existing.messageCount = existing.events.length;
    }
  }

  return [...byPeer.values()].sort((a, b) => b.latest.createdAt - a.latest.createdAt);
}

function appendMessage(messages: DirectMessage[] | undefined, message: DirectMessage): DirectMessage[] | undefined {
  if (!messages) return messages;
  if (messages.some((existing) => existing.id === message.id)) return messages;
  return [...messages, message].sort((a, b) => a.createdAt - b.createdAt);
}

function addSentMessageToPages(
  data: InfiniteData<DirectMessagesPage, DirectMessagesCursor> | undefined,
  message: DirectMessage,
): InfiniteData<DirectMessagesPage, DirectMessagesCursor> | undefined {
  if (!data || data.pages.length === 0) return data;

  const pages = data.pages.map((page, index) => {
    if (index !== 0) return page;

    const conversations = [...page.conversations];
    const existingIndex = conversations.findIndex((conversation) => conversation.peer === message.peer);
    if (existingIndex === -1) {
      conversations.unshift({
        peer: message.peer,
        events: [message.event],
        messageCount: 1,
        latest: message,
      });
    } else {
      const conversation = conversations[existingIndex];
      const events = conversation.events.some((event) => event.id === message.id)
        ? conversation.events
        : [...conversation.events, message.event].sort((a, b) => a.created_at - b.created_at);

      conversations[existingIndex] = {
        ...conversation,
        events,
        messageCount: events.length,
        latest: message.createdAt >= conversation.latest.createdAt ? message : conversation.latest,
      };
    }

    conversations.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
    return { ...page, conversations };
  });

  return { ...data, pages };
}

function directMessageFromPlaintext(event: NostrEvent, peer: string, self: string, content: string): DirectMessage {
  return {
    id: event.id,
    pubkey: event.pubkey,
    peer,
    outgoing: event.pubkey === self,
    createdAt: event.created_at,
    content,
    event,
  };
}

async function decryptMessage({
  event,
  peer,
  self,
  nip04,
}: {
  event: NostrEvent;
  peer: string;
  self: string;
  nip04: NonNullable<NostrSigner['nip04']>;
}): Promise<DirectMessage> {
  const outgoing = event.pubkey === self;
  let content: string | null = null;
  try {
    // NIP-04 decrypt takes the counterparty pubkey for both directions.
    content = await nip04.decrypt(peer, event.content);
  } catch {
    content = null;
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    peer,
    outgoing,
    createdAt: event.created_at,
    content,
    event,
  };
}

/** Decrypts a selected thread on demand instead of blocking the inbox list. */
export function useDirectMessageThread(conversation: DirectMessageThreadTarget | null) {
  const { user } = useCurrentUser();
  const self = user?.pubkey;
  const nip04 = user?.signer.nip04;
  const latestId = conversation?.events.at(-1)?.id ?? '';

  return useQuery<DirectMessage[]>({
    queryKey: [
      'direct-message-thread',
      self,
      conversation?.peer,
      latestId,
      conversation?.messageCount,
    ],
    enabled: !!self && !!nip04 && !!conversation,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!self || !nip04 || !conversation) return [];
      const messages: DirectMessage[] = [];
      for (const event of conversation.events) {
        messages.push(await decryptMessage({ event, peer: conversation.peer, self, nip04 }));
      }
      return messages;
    },
  });
}

/**
 * Send a NIP-04 encrypted direct message to a peer. Encrypts the plaintext with
 * the signer's `nip04.encrypt`, then publishes a kind-4 event tagging the
 * recipient. Seeds the DM caches with the signed event so the active thread can
 * append smoothly without waiting for relays to return the message.
 */
export function useSendDirectMessage() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ peer, text }: { peer: string; text: string }) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Cannot send an empty message');
      if (!user?.signer.nip04) {
        throw new Error('NIP-04 encryption is not supported by your signer');
      }
      const content = await user.signer.nip04.encrypt(peer, trimmed);
      return publish({ kind: DM_KIND, content, tags: [['p', peer]] });
    },
    onSuccess: (event, { peer, text }) => {
      if (!user) return;

      // The inbox query key carries a trailing relay-list segment
      // (['direct-messages', pubkey, readRelays]), so match by prefix rather
      // than an exact key — otherwise the optimistic append silently misses.
      const messagesKeyPrefix = ['direct-messages', user.pubkey] as const;
      const existingEntry = queryClient
        .getQueriesData<InfiniteData<DirectMessagesPage, DirectMessagesCursor>>({ queryKey: messagesKeyPrefix })
        .find(([, data]) => data !== undefined);
      const existingData = existingEntry?.[1];
      const existingConversation = mergeConversationPages(existingData)?.find((conversation) => conversation.peer === peer);
      const messageCount = existingConversation?.events.some((existing) => existing.id === event.id)
        ? existingConversation.messageCount
        : (existingConversation?.messageCount ?? 0) + 1;
      const message = directMessageFromPlaintext(event, peer, user.pubkey, text.trim());
      const existingThread = queryClient
        .getQueriesData<DirectMessage[]>({ queryKey: ['direct-message-thread', user.pubkey, peer] })
        .find(([, messages]) => messages !== undefined)?.[1];

      queryClient.setQueriesData<InfiniteData<DirectMessagesPage, DirectMessagesCursor>>({ queryKey: messagesKeyPrefix }, (data) => (
        data ? addSentMessageToPages(data, message) : data
      ));
      queryClient.setQueryData<DirectMessage[]>([
        'direct-message-thread',
        user.pubkey,
        peer,
        event.id,
        messageCount,
      ], appendMessage(existingThread ?? [], message));
      queryClient.setQueriesData<DirectMessage[]>({
        queryKey: ['direct-message-thread', user.pubkey, peer],
      }, (messages) => appendMessage(messages, message));

      queryClient.invalidateQueries({ queryKey: messagesKeyPrefix, refetchType: 'inactive' });
    },
  });
}
