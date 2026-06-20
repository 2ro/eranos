import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

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

/** A single conversation: the peer pubkey plus its decrypted messages. */
export interface Conversation {
  peer: string;
  messages: DirectMessage[];
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
      const events = await nostr.query(
        [
          { kinds: [DM_KIND], authors: [self] },
          { kinds: [DM_KIND], '#p': [self] },
        ],
        { signal },
      );

      // Dedupe by id (a self-sent message can match both filters).
      const byId = new Map<string, NostrEvent>();
      for (const event of events) byId.set(event.id, event);

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

        const messages: DirectMessage[] = [];
        for (const event of peerEvents) {
          const outgoing = event.pubkey === self;
          let content: string | null = null;
          try {
            // NIP-04 decrypt takes the *counterparty* pubkey.
            content = await nip04.decrypt(peer, event.content);
          } catch {
            content = null;
          }
          messages.push({
            id: event.id,
            pubkey: event.pubkey,
            peer,
            outgoing,
            createdAt: event.created_at,
            content,
            event,
          });
        }

        const latest = messages[messages.length - 1];
        if (!latest) continue;
        conversations.push({ peer, messages, latest });
      }

      // Most-recently-active conversations first.
      conversations.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
      return conversations;
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
