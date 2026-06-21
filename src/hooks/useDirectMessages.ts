import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

/** NIP-04 encrypted direct message kind. */
export const DM_KIND = 4;

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
 * Loads all NIP-04 (kind-4) direct messages for the logged-in user, decrypts
 * them with the signer's `nip04` methods, and groups them into conversations
 * sorted by most-recent activity.
 *
 * Messages are read from the app's configured relays (via `useNostr`), so this
 * automatically honors the user's relay settings. NIP-04 leaks metadata and is
 * deprecated in favor of NIP-44/NIP-17; this exists for interop with clients
 * that still send kind-4 DMs.
 */
export function useDirectMessages() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const self = user?.pubkey;

  return useQuery<Conversation[]>({
    queryKey: ['direct-messages', self],
    enabled: !!self && !!user?.signer.nip04,
    queryFn: async ({ signal }) => {
      if (!self || !user?.signer.nip04) return [];
      const nip04 = user.signer.nip04;

      // Both directions of every conversation we're part of: messages we sent
      // (authors = self) and messages addressed to us (#p = self).
      //
      // We stream with `req()` rather than `query()` and wait for *every*
      // relay to reach EOSE. `query()` resolves on the pool's short EOSE
      // timeout (the first relay to finish), which silently drops DMs that
      // only live on slower relays — one cause of "missing conversations".
      //
      // Relays return newest-first and cap each REQ at `limit`, so a single
      // fetch truncates long histories — the oldest conversations (years back)
      // fall off the end. We page backwards with `until`: after each full page
      // we lower `until` to the oldest event seen and ask again, stopping once
      // a page comes back short (nothing older remains). An overall timeout
      // keeps a stalled relay from hanging the page.
      const byId = new Map<string, NostrEvent>();
      const PAGE_SIZE = 500;
      const MAX_PAGES = 40; // hard ceiling: up to ~20k DMs

      const timeout = AbortSignal.timeout(15000);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort);
      timeout.addEventListener('abort', onAbort);

      try {
        let until: number | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const base = { kinds: [DM_KIND], limit: PAGE_SIZE };
          const window = until === undefined ? {} : { until };
          let pageCount = 0;
          let oldest = Infinity;

          for await (const msg of nostr.req(
            [
              { ...base, ...window, authors: [self] },
              { ...base, ...window, '#p': [self] },
            ],
            { signal: controller.signal },
          )) {
            if (msg[0] === 'EVENT') {
              const event = msg[2];
              // Dedupe by id (a self-sent message can match both filters,
              // and overlapping `until` windows can re-deliver the boundary).
              if (!byId.has(event.id)) pageCount++;
              byId.set(event.id, event);
              if (event.created_at < oldest) oldest = event.created_at;
            } else if (msg[0] === 'EOSE') {
              // The pool emits a single EOSE once all routed relays are done.
              break;
            }
          }

          // A short page means relays had nothing older to give — we're done.
          // (Two filters at PAGE_SIZE each could yield up to 2*PAGE_SIZE.)
          if (pageCount < PAGE_SIZE || oldest === Infinity) break;
          // Step the window back. `until` is inclusive, so subtract 1 to avoid
          // re-fetching the exact boundary event forever.
          until = oldest - 1;
        }
      } catch {
        // Abort (unmount/timeout) — fall through with whatever we collected.
      } finally {
        signal?.removeEventListener('abort', onAbort);
        timeout.removeEventListener('abort', onAbort);
      }

      // Group by counterparty pubkey.
      const byPeer = new Map<string, NostrEvent[]>();
      for (const event of byId.values()) {
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
      return conversations;
    },
  });
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
export function useDirectMessageThread(conversation: Conversation | null) {
  const { user } = useCurrentUser();
  const self = user?.pubkey;
  const nip04 = user?.signer.nip04;

  return useQuery<DirectMessage[]>({
    queryKey: [
      'direct-message-thread',
      self,
      conversation?.peer,
      conversation?.latest.id,
      conversation?.messageCount,
    ],
    enabled: !!self && !!nip04 && !!conversation,
    queryFn: async () => {
      if (!self || !nip04 || !conversation) return [];
      return Promise.all(
        conversation.events.map((event) => decryptMessage({ event, peer: conversation.peer, self, nip04 })),
      );
    },
  });
}

/**
 * Send a NIP-04 encrypted direct message to a peer. Encrypts the plaintext with
 * the signer's `nip04.encrypt`, then publishes a kind-4 event tagging the
 * recipient. Invalidates the DM query so the new message shows up.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['direct-messages', user?.pubkey] });
    },
  });
}
