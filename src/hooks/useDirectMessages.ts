import { useNostr } from '@nostrify/react';
import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useAppContext } from './useAppContext';
import { sanitizeText } from '@/lib/grinOnlyPolicy';

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
  backfillComplete: boolean;
  relayCursors?: RelayCursors;
}

interface RelayDirectionCursor {
  sentUntil?: number | null;
  receivedUntil?: number | null;
}

type RelayCursors = Record<string, RelayDirectionCursor>;

interface DirectMessagesCursor {
  sentUntil?: number | null;
  receivedUntil?: number | null;
  relayCursors?: RelayCursors;
}

/** Extract the first `p` tag value (the recipient) from a kind-4 event. */
function recipientOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'p')?.[1];
}

function buildDirectMessageFilters(self: string, cursor: DirectMessagesCursor): NostrFilter[] {
  const filters: NostrFilter[] = [];
  if (cursor.sentUntil !== null) {
    filters.push({
      kinds: [DM_KIND],
      authors: [self],
      limit: PAGE_SIZE,
      ...(cursor.sentUntil === undefined ? {} : { until: cursor.sentUntil }),
    });
  }
  if (cursor.receivedUntil !== null) {
    filters.push({
      kinds: [DM_KIND],
      '#p': [self],
      limit: PAGE_SIZE,
      ...(cursor.receivedUntil === undefined ? {} : { until: cursor.receivedUntil }),
    });
  }
  return filters;
}

async function directMessagesPageFromEvents({
  events,
  self,
  nip04,
  backfillComplete,
  relayCursors,
}: {
  events: NostrEvent[];
  self: string;
  nip04: NonNullable<NostrSigner['nip04']>;
  backfillComplete: boolean;
  relayCursors?: RelayCursors;
}): Promise<DirectMessagesPage> {
  const sentEvents = events.filter((event) => event.pubkey === self);
  const receivedEvents = events.filter((event) => recipientOf(event) === self);
  const nextSentUntil = getNextUntil(sentEvents);
  const nextReceivedUntil = getNextUntil(receivedEvents);

  const byPeer = new Map<string, NostrEvent[]>();
  for (const event of events) {
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

  conversations.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
  return { conversations, sentUntil: nextSentUntil, receivedUntil: nextReceivedUntil, backfillComplete, relayCursors };
}

function hasNextRelayPage(relayCursors: RelayCursors | undefined): boolean {
  if (!relayCursors) return false;
  return Object.values(relayCursors).some((cursor) => cursor.sentUntil !== null || cursor.receivedUntil !== null);
}

function getRelayCursor(events: NostrEvent[], self: string): RelayDirectionCursor {
  return {
    sentUntil: getNextUntil(events.filter((event) => event.pubkey === self)),
    receivedUntil: getNextUntil(events.filter((event) => recipientOf(event) === self)),
  };
}

async function queryRelayDmPage({
  nostr,
  url,
  self,
  cursor,
  signal,
}: {
  nostr: ReturnType<typeof useNostr>['nostr'];
  url: string;
  self: string;
  cursor: DirectMessagesCursor;
  signal: AbortSignal;
}): Promise<{ url: string; events: NostrEvent[]; cursor: RelayDirectionCursor }> {
  const filters = buildDirectMessageFilters(self, cursor);
  if (filters.length === 0) return { url, events: [], cursor: { sentUntil: null, receivedUntil: null } };
  const events = await nostr.relay(url).query(filters, { signal });
  return { url, events, cursor: getRelayCursor(events, self) };
}

function mergeDirectMessagesPage(base: DirectMessagesPage, incoming: DirectMessagesPage): DirectMessagesPage {
  const byPeer = new Map<string, Conversation>();

  for (const conversation of [...base.conversations, ...incoming.conversations]) {
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
    if (conversation.latest.createdAt > existing.latest.createdAt) {
      existing.latest = conversation.latest;
    }
  }

  return {
    conversations: [...byPeer.values()].sort((a, b) => b.latest.createdAt - a.latest.createdAt),
    sentUntil: incoming.sentUntil,
    receivedUntil: incoming.receivedUntil,
    backfillComplete: incoming.backfillComplete,
    relayCursors: { ...(base.relayCursors ?? {}), ...(incoming.relayCursors ?? {}) },
  };
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
 * The first page uses the shared pool so it renders quickly with the app's
 * normal `eoseTimeout`. A background backfill then queries each read relay
 * individually and merges those slower results into the same cache entry. That
 * preserves a fast inbox while still filling conversations that only exist on a
 * slower relay. NIP-04 leaks metadata and is deprecated in favor of NIP-44/NIP-17;
 * this exists for interop with clients that still send kind-4 DMs.
 */
export function useDirectMessages() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const self = user?.pubkey;

  const readRelays = useMemo(
    () => [...new Set(config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url))].sort(),
    [config.relayMetadata.relays],
  );
  const queryKey = useMemo(() => ['direct-messages', self, readRelays] as const, [self, readRelays]);

  const query = useInfiniteQuery<
    DirectMessagesPage,
    Error,
    InfiniteData<DirectMessagesPage, DirectMessagesCursor>,
    readonly unknown[],
    DirectMessagesCursor
  >({
    queryKey,
    enabled: !!self && !!user?.signer.nip04,
    initialPageParam: {},
    queryFn: async ({ signal, pageParam }) => {
      if (!self || !user?.signer.nip04) {
        return { conversations: [], sentUntil: null, receivedUntil: null, backfillComplete: true, relayCursors: {} };
      }
      const nip04 = user.signer.nip04;

      const timeout = AbortSignal.timeout(8000);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort);
      timeout.addEventListener('abort', onAbort);

      const byId = new Map<string, NostrEvent>();
      const relayCursors: RelayCursors = {};
      try {
        const isInitialPage = !pageParam.relayCursors && pageParam.sentUntil === undefined && pageParam.receivedUntil === undefined;
        if (isInitialPage || readRelays.length === 0) {
          const filters = buildDirectMessageFilters(self, pageParam);
          if (filters.length === 0) {
            return { conversations: [], sentUntil: null, receivedUntil: null, backfillComplete: true, relayCursors: {} };
          }
          // Fast path: use the pooled query and let the provider's short
          // eoseTimeout render the inbox immediately. Page 0 is backfilled by
          // the effect below before older-page pagination is enabled.
          const events = await nostr.query(filters, { signal: controller.signal });
          for (const event of events) {
            byId.set(event.id, event);
          }
        } else {
          // Older pages use relay-specific cursors established by page-0
          // backfill. A single global timestamp cursor can skip ranges on dense
          // relays when a sparse relay returns much older events.
          const perRelay = await Promise.allSettled(
            readRelays.map((url) => {
              const cursor = pageParam.relayCursors?.[url] ?? { sentUntil: null, receivedUntil: null };
              return queryRelayDmPage({ nostr, url, self, cursor, signal: controller.signal });
            }),
          );
          perRelay.forEach((result, index) => {
            const url = readRelays[index];
            if (!url) return;
            if (result.status !== 'fulfilled') {
              relayCursors[url] = pageParam.relayCursors?.[url] ?? { sentUntil: undefined, receivedUntil: undefined };
              return;
            }
            relayCursors[result.value.url] = result.value.cursor;
            for (const event of result.value.events) {
              byId.set(event.id, event);
            }
          });
        }
      } catch {
        // Abort (unmount/timeout) — fall through with whatever we collected.
      } finally {
        signal?.removeEventListener('abort', onAbort);
        timeout.removeEventListener('abort', onAbort);
      }

      const isInitialPage = !pageParam.relayCursors && pageParam.sentUntil === undefined && pageParam.receivedUntil === undefined;
      return directMessagesPageFromEvents({
        events: [...byId.values()],
        self,
        nip04,
        backfillComplete: !isInitialPage || readRelays.length === 0,
        relayCursors: Object.keys(relayCursors).length > 0 ? relayCursors : undefined,
      });
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.backfillComplete) return undefined;
      if (hasNextRelayPage(lastPage.relayCursors)) return { relayCursors: lastPage.relayCursors };
      if (lastPage.sentUntil === null && lastPage.receivedUntil === null) return undefined;
      return { sentUntil: lastPage.sentUntil, receivedUntil: lastPage.receivedUntil };
    },
  });

  const firstPageBackfillComplete = query.data?.pages[0]?.backfillComplete;
  const hasFirstPage = !!query.data?.pages[0];

  useEffect(() => {
    if (!self || !user?.signer.nip04 || readRelays.length === 0) return;
    const firstPage = queryClient.getQueryData<InfiniteData<DirectMessagesPage, DirectMessagesCursor>>(queryKey)?.pages[0];
    if (!firstPage || firstPage.backfillComplete) return;

    const nip04 = user.signer.nip04;
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(30_000);
    let cancelled = false;
    const onAbort = () => controller.abort();
    timeout.addEventListener('abort', onAbort);

    void (async () => {
      const finalRelayCursors: RelayCursors = {};
      const tasks = readRelays.map(async (url) => {
        try {
          const result = await queryRelayDmPage({ nostr, url, self, cursor: {}, signal: controller.signal });
          finalRelayCursors[url] = result.cursor;
          const incoming = await directMessagesPageFromEvents({
            events: result.events,
            self,
            nip04,
            backfillComplete: false,
            relayCursors: { [url]: result.cursor },
          });

          if (controller.signal.aborted) return;
          queryClient.setQueryData<InfiniteData<DirectMessagesPage, DirectMessagesCursor>>(queryKey, (data) => {
            if (!data?.pages[0] || data.pages[0].backfillComplete) return data;
            const pages = [...data.pages];
            pages[0] = mergeDirectMessagesPage(pages[0], incoming);
            return { ...data, pages };
          });
        } catch {
          // Do not mark a failed/timed-out relay as exhausted. Undefined means
          // the next pagination pass can retry from the top for this relay;
          // event-id dedupe keeps those retries harmless if some events already
          // arrived through the pooled fast path or another relay.
          finalRelayCursors[url] = { sentUntil: undefined, receivedUntil: undefined };
        }
      });

      await Promise.allSettled(tasks);
      if (!cancelled) {
        for (const url of readRelays) {
          finalRelayCursors[url] ??= { sentUntil: undefined, receivedUntil: undefined };
        }
        queryClient.setQueryData<InfiniteData<DirectMessagesPage, DirectMessagesCursor>>(queryKey, (data) => {
          if (!data?.pages[0] || data.pages[0].backfillComplete) return data;
          const pages = [...data.pages];
          pages[0] = {
            ...pages[0],
            backfillComplete: true,
            relayCursors: { ...(pages[0].relayCursors ?? {}), ...finalRelayCursors },
          };
          return { ...data, pages };
        });
      }
      timeout.removeEventListener('abort', onAbort);
    })();

    return () => {
      cancelled = true;
      timeout.removeEventListener('abort', onAbort);
      controller.abort();
    };
  }, [nostr, hasFirstPage, firstPageBackfillComplete, queryClient, queryKey, readRelays, self, user?.signer.nip04]);

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
      if (conversation.latest.createdAt > existing.latest.createdAt) {
        existing.latest = conversation.latest;
      }
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
    // Redact Lightning money-rail tokens before the decrypted DM reaches the
    // UI; the message text is otherwise preserved (Grin slatepacks untouched).
    content: content === null ? null : sanitizeText(content),
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
