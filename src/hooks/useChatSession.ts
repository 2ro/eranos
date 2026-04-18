import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { finalizeEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useEphemeralIdentity,
  type EphemeralIdentity,
} from '@/hooks/useEphemeralIdentity';
import { fetchGeoRelays } from '@/lib/georelays';

/**
 * Per-geohash chat session built on ephemeral kind 20000 events. Handles
 * identity (real signer ↔ ephemeral keypair), relay routing, real-time
 * subscription, optimistic local cache, and message send.
 *
 * Messages live in a TanStack Query cache keyed `['chat-messages', geohash]`
 * so multiple components viewing the same geohash share state without prop
 * drilling.
 */
export interface EphemeralEventMessage {
  event: NostrEvent;
  geohash?: string;
  nickname?: string;
  message: string;
}

type IdentityMode = 'real' | 'ephemeral';
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseChatSessionReturn {
  session: EphemeralIdentity | { privateKey: Uint8Array; pubkey: string; npub: string; nickname: string } | null;
  isLoading: boolean;
  messages: EphemeralEventMessage[];
  sendMessage: (content: string) => Promise<boolean>;
  updateNickname: (nickname: string) => void;
  identityMode: IdentityMode;
  setIdentityMode: (mode: IdentityMode) => void;
  canToggleIdentity: boolean;
  connectionStatus: ConnectionStatus;
}

const ONE_HOUR_SECONDS = 60 * 60;
const NICKNAME_MAX_LENGTH = 16;

const DEFAULT_CHAT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

function truncateNickname(nickname: string | undefined, maxLength = NICKNAME_MAX_LENGTH): string {
  if (!nickname) return 'anonymous';
  const cleaned = nickname.trim();
  if (!cleaned) return 'anonymous';
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 1) + '...';
}

function isCompleteRelayFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('all relays failed') ||
    message.includes('no relays') ||
    message.includes('connection refused')
  );
}

export function useChatSession(
  geohash: string,
  initialEvents: EphemeralEventMessage[] = [],
  onNewMessage?: (message: EphemeralEventMessage) => void,
): UseChatSessionReturn {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const ephemeralIdentity = useEphemeralIdentity();

  const [session, setSession] = useState<UseChatSessionReturn['session']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [identityMode, setIdentityModeState] = useState<IdentityMode>('ephemeral');
  const [hasSeededInitialEvents, setHasSeededInitialEvents] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [geoRelaysCache, setGeoRelaysCache] = useState<string[]>([]);
  const [messages, setMessages] = useState<EphemeralEventMessage[]>(initialEvents);

  const canToggleIdentity = !!user?.pubkey;

  const setIdentityMode = useCallback(
    (mode: IdentityMode) => {
      if (mode === 'real' && !user) return;
      setIdentityModeState(mode);
    },
    [user],
  );

  // ── Establish session for the chosen identity mode. ──────────────────────
  // Destructure stable members rather than depending on the whole hook
  // result — even with the memo on useEphemeralIdentity, depending on the
  // wrapper object risks spurious effect re-runs that cascade into Radix
  // ref callbacks and trip the "Maximum update depth" guard.
  const { identity: ghostIdentity, generateIdentity: ghostGenerate } = ephemeralIdentity;
  useEffect(() => {
    if (!geohash) return;
    if (identityMode === 'real' && user?.pubkey) {
      setSession({
        privateKey: new Uint8Array(),
        pubkey: user.pubkey,
        npub: '',
        nickname: 'user',
      });
    } else {
      setSession(ghostIdentity ?? ghostGenerate());
    }
    setIsLoading(false);
  }, [geohash, user, identityMode, ghostIdentity, ghostGenerate]);

  // ── Pull a rotating slice of geo relays so chat can spread reads/writes
  //    across nearby relays without us having to know coordinates here. ────
  useEffect(() => {
    let cancelled = false;
    fetchGeoRelays()
      .then((relays) => {
        if (cancelled || relays.length === 0) return;
        const rotationIndex = Math.floor(Date.now() / 300_000) % Math.max(1, relays.length);
        setGeoRelaysCache(relays.slice(rotationIndex, rotationIndex + 8).map((r) => r.url));
      })
      .catch((error) => console.warn('Failed to fetch geo relays for chat:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const getChatRelays = useCallback((): string[] => {
    const set = new Set<string>(DEFAULT_CHAT_RELAYS);
    geoRelaysCache.forEach((r) => set.add(r));
    return Array.from(set);
  }, [geoRelaysCache]);

  // ── Seed the cache once with whatever the map preview already had so the
  //    dialog opens populated instead of empty-flashing. ────────────────────
  useEffect(() => {
    if (!geohash || hasSeededInitialEvents || initialEvents.length === 0) return;
    const sorted = [...initialEvents].sort((a, b) => a.event.created_at - b.event.created_at);
    queryClient.setQueryData(['chat-messages', geohash], sorted);
    setHasSeededInitialEvents(true);
  }, [geohash, initialEvents, hasSeededInitialEvents, queryClient]);

  // ── Fetch + subscribe for this geohash. ──────────────────────────────────
  useEffect(() => {
    if (!geohash || !nostr) return;

    const chatRelays = getChatRelays();
    const chatKey = ['chat-messages', geohash];
    const abortController = new AbortController();
    let isSubscribed = true;

    const fetchLatestMessages = async () => {
      try {
        setConnectionStatus('connecting');
        const signal = AbortSignal.any([
          abortController.signal,
          AbortSignal.timeout(45_000),
        ]);

        const existing = queryClient.getQueryData<EphemeralEventMessage[]>(chatKey) || [];
        const existingIds = new Set(existing.map((m) => m.event.id));
        const since = Math.floor(Date.now() / 1000) - ONE_HOUR_SECONDS;

        const events = await nostr
          .group(chatRelays)
          .query([{ kinds: [20000], since, limit: 500 }], { signal });

        const fetched = events
          .filter((event) => event.tags.find(([n]) => n === 'g')?.[1] === geohash)
          .map<EphemeralEventMessage>((event) => ({
            event,
            geohash: event.tags.find(([n]) => n === 'g')?.[1],
            nickname: truncateNickname(event.tags.find(([n]) => n === 'n')?.[1]),
            message: event.content,
          }));

        const merged = [
          ...existing,
          ...fetched.filter((m) => !existingIds.has(m.event.id)),
        ].sort((a, b) => a.event.created_at - b.event.created_at);

        if (isSubscribed) {
          queryClient.setQueryData(chatKey, merged);
          setConnectionStatus('connected');
        }
      } catch (error) {
        console.warn('Failed to fetch chat messages:', error);
        if (isSubscribed) setConnectionStatus('error');
      }
    };

    const subscribeToMessages = async () => {
      try {
        const since = Math.floor(Date.now() / 1000);
        const subscription = nostr
          .group(chatRelays)
          .req([{ kinds: [20000], since, limit: 100 }], { signal: abortController.signal });

        for await (const msg of subscription) {
          if (!isSubscribed) break;

          if (msg[0] === 'EVENT') {
            const event = msg[2];
            const eventGeohash = event.tags.find(([n]) => n === 'g')?.[1];
            if (eventGeohash !== geohash) continue;

            const newMessage: EphemeralEventMessage = {
              event,
              geohash: eventGeohash,
              nickname: truncateNickname(event.tags.find(([n]) => n === 'n')?.[1]),
              message: event.content,
            };

            const current = queryClient.getQueryData<EphemeralEventMessage[]>(chatKey) || [];
            if (current.some((m) => m.event.id === event.id)) continue;

            queryClient.setQueryData(chatKey, [...current, newMessage]);
            onNewMessage?.(newMessage);
          } else if (msg[0] === 'EOSE') {
            if (isSubscribed) setConnectionStatus('connected');
          } else if (msg[0] === 'CLOSED') {
            if (isSubscribed) setConnectionStatus('disconnected');
            break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Chat subscription failed:', error);
        }
      }
    };

    fetchLatestMessages();
    subscribeToMessages();

    return () => {
      isSubscribed = false;
      abortController.abort();
    };
  }, [geohash, nostr, queryClient, getChatRelays, onNewMessage]);

  // ── Reset local message buffer when the active geohash changes. ──────────
  useEffect(() => {
    setHasSeededInitialEvents(false);
    setMessages(initialEvents);
    // We intentionally only reset on geohash change; new initialEvents
    // arrays for the same geohash should not blow away live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geohash]);

  // ── Mirror the cache into local state so consumers can re-render. ────────
  useEffect(() => {
    if (!geohash) return;
    const chatKey = ['chat-messages', geohash];
    const cached = queryClient.getQueryData<EphemeralEventMessage[]>(chatKey);
    setMessages(cached ?? initialEvents);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] === 'chat-messages' && event.query.queryKey[1] === geohash) {
        const data = queryClient.getQueryData<EphemeralEventMessage[]>(chatKey);
        if (data) setMessages(data);
      }
    });

    return () => unsubscribe();
  }, [geohash, queryClient, initialEvents]);

  const updateNickname = useCallback(
    (newNickname: string) => {
      if (!session || identityMode !== 'ephemeral') return;
      setSession((prev) => (prev ? { ...prev, nickname: newNickname } : prev));
      ephemeralIdentity.updateNickname(newNickname);
    },
    [session, identityMode, ephemeralIdentity],
  );

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!session || !geohash || !nostr) return false;

      try {
        const baseEvent = {
          kind: 20000,
          pubkey: session.pubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['g', geohash],
            ['n', session.nickname],
          ],
          content,
        };

        let eventToPublish: NostrEvent;
        if (identityMode === 'real' && user?.signer) {
          eventToPublish = await user.signer.signEvent(baseEvent);
        } else if (session.privateKey.length > 0) {
          eventToPublish = finalizeEvent(baseEvent, session.privateKey);
        } else {
          throw new Error('No valid signing method available');
        }

        const chatRelays = getChatRelays();
        const optimistic: EphemeralEventMessage = {
          event: eventToPublish,
          geohash,
          nickname: session.nickname,
          message: content,
        };

        const persistOptimistic = () => {
          const chatKey = ['chat-messages', geohash];
          const existing = queryClient.getQueryData<EphemeralEventMessage[]>(chatKey) || [];
          if (existing.some((m) => m.event.id === optimistic.event.id)) return;
          queryClient.setQueryData(chatKey, [...existing, optimistic]);
        };

        try {
          await nostr.group(chatRelays).event(eventToPublish, {
            signal: AbortSignal.timeout(10_000),
          });
          persistOptimistic();
          return true;
        } catch (publishError) {
          if (isCompleteRelayFailure(publishError)) {
            console.error('All chat relays failed:', publishError);
            return false;
          }
          // Partial failure — at least one relay accepted, treat as success.
          console.warn('Some chat relays failed; treating publish as success:', publishError);
          persistOptimistic();
          return true;
        }
      } catch (error) {
        console.error('Failed to send chat message:', error);
        return false;
      }
    },
    [session, geohash, nostr, queryClient, user, getChatRelays, identityMode],
  );

  return {
    session,
    isLoading,
    messages,
    sendMessage,
    updateNickname,
    identityMode,
    setIdentityMode,
    canToggleIdentity,
    connectionStatus,
  };
}
