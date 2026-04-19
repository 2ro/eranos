import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MapPin, ChevronDown, UserRound, Ghost, Edit2 } from 'lucide-react';
import type { NostrMetadata } from '@nostrify/nostrify';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useChatSession,
  type EphemeralEventMessage,
} from '@/hooks/useChatSession';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { COUNTRIES } from '@/lib/countries';

/**
 * Convert an ISO 3166-1 alpha-2 code to its flag emoji via the Regional
 * Indicator block. Falls back to the bare code when given garbage.
 */
function getCountryFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return code;
  return code
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

/**
 * Coarse mapping from geohash prefix → ISO 3166-1 alpha-2 country code. The
 * geohash grid system roughly partitions the globe into letter cells, so the
 * first 1-3 characters give us "good enough for chips" country attribution.
 *
 * This is only used for the cosmetic country chip in the chat header — it is
 * not authoritative geography.
 */
const GEOHASH_TO_COUNTRY: Record<string, string> = {
  '9': 'US', '9q': 'US', '9r': 'US', '9x': 'US', '9w': 'US', '9t': 'US',
  '9m': 'US', '9y': 'US', '9z': 'US', '9p': 'US', '9n': 'US',
  '9g': 'MX', '9e': 'MX', '9d': 'MX', '9f': 'MX', '9c': 'MX', '9b': 'MX',
  c: 'CA', b: 'US', d: 'US', dn: 'US', dp: 'US', dr: 'US', dq: 'US',
  dj: 'US', dk: 'US', dm: 'US', f: 'CA',
  u: 'EU', gc: 'GB', gf: 'GB', ey: 'NO', ez: 'NO',
  u0: 'ES', u1: 'ES', u2: 'FR', u3: 'FR', u4: 'FR',
  u6: 'DE', u7: 'DE', u8: 'DE', u9: 'DE',
  uc: 'PL', ud: 'PL', ue: 'SE', ug: 'SE',
  sr: 'IT', sp: 'IT', tf: 'CH',
  '6': 'BR', '7': 'CL',
  w: 'CN', x: 'CN', y: 'CN', xn: 'JP', xp: 'JP',
  t: 'IN', tu: 'IN', tv: 'IN', tw: 'IN', v: 'RU',
  s: 'SA',
  k: 'ZA', e: 'NG',
  q: 'AU', r: 'AU',
};

function getCountryFromGeohash(
  geohash: string,
): { code: string; name: string; flag: string } | null {
  if (!geohash) return null;
  for (let len = Math.min(geohash.length, 3); len >= 1; len--) {
    const prefix = geohash.substring(0, len).toLowerCase();
    const countryCode = GEOHASH_TO_COUNTRY[prefix];
    if (!countryCode) continue;
    const info = COUNTRIES[countryCode];
    return {
      code: countryCode,
      name: info?.name || countryCode,
      flag: getCountryFlag(countryCode),
    };
  }
  return null;
}

function getPubkeySuffix(pubkey: string): string {
  return pubkey.slice(-4);
}

/** Stable colour-from-pubkey for nickname suffix accents. */
function getPubkeyColor(pubkey: string): string {
  const colors = [
    '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80',
    '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa',
    '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6',
  ];
  const hash = pubkey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function truncateNickname(nickname: string | undefined, maxLength = 16): string {
  if (!nickname) return 'anonymous';
  const cleaned = nickname.trim();
  if (!cleaned) return 'anonymous';
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 1) + '...';
}

function MessageAuthor({ pubkey, nickname }: { pubkey: string; nickname?: string }) {
  const author = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName =
    metadata?.display_name || metadata?.name || nickname || getDisplayName(undefined, pubkey);

  return (
    <div className="inline-flex items-center gap-1">
      {metadata?.picture && (
        <Avatar className="h-4 w-4">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="text-[8px]">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <span className="font-medium text-primary">
        {truncateNickname(displayName)}
        <span className="text-[0.85em] opacity-70" style={{ color: getPubkeyColor(pubkey) }}>
          #{getPubkeySuffix(pubkey)}
        </span>
      </span>
    </div>
  );
}

interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  geohash: string;
  initialEvents?: EphemeralEventMessage[];
}

/**
 * Per-geohash chat surface for ephemeral kind 20000 events. Opens from the
 * world map's ephemeral-marker popovers.
 *
 * Logged-in users can toggle between their real Nostr identity and an
 * ephemeral "ghost" handle (signed with an in-memory keypair, nickname
 * persisted in localStorage). Anonymous visitors get the ghost path only.
 */
export function ChatDialog({ isOpen, onClose, geohash, initialEvents = [] }: ChatDialogProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMessageCountRef = useRef(0);

  const { user, metadata } = useCurrentUser();
  const { toast } = useToast();

  const countryInfo = useMemo(() => getCountryFromGeohash(geohash), [geohash]);

  const handleNewMessage = useCallback(
    (incomingMessage: EphemeralEventMessage) => {
      const currentUserPubkey = user?.pubkey;
      if (
        incomingMessage.event.pubkey !== currentUserPubkey &&
        incomingMessage.message.trim()
      ) {
        const senderName = incomingMessage.nickname || 'Anonymous';
        const preview =
          incomingMessage.message.slice(0, 50) +
          (incomingMessage.message.length > 50 ? '...' : '');
        toast({
          title: `New message from ${senderName}`,
          description: preview,
        });
      }
    },
    [user?.pubkey, toast],
  );

  const {
    session,
    sendMessage: sendChatMessage,
    isLoading,
    messages: chatMessages,
    updateNickname,
    identityMode,
    setIdentityMode,
    canToggleIdentity,
    connectionStatus,
  } = useChatSession(geohash, initialEvents, handleNewMessage);

  const isMessagesLoading = isLoading && chatMessages.length === 0;

  const checkIsAtBottom = useCallback(() => {
    if (!scrollRef.current) return true;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return true;
    const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement;
    const isBottom = scrollHeight - scrollTop - clientHeight <= 50;
    setIsAtBottom(isBottom);
    return isBottom;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    previousMessageCountRef.current = 0;

    const handleScroll = () => {
      checkIsAtBottom();
      setShowScrollButton(false);
    };

    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    checkIsAtBottom();

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      document.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, checkIsAtBottom]);

  // Auto-scroll to bottom when new messages arrive, but only if the user is
  // already at the bottom — otherwise reveal the floating "scroll to latest"
  // button so we don't yank them away from history they're reading.
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const wasAtBottom = checkIsAtBottom();
    const newMessageCount = chatMessages.length - previousMessageCountRef.current;
    previousMessageCountRef.current = chatMessages.length;

    if (wasAtBottom && scrollRef.current) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
        }
      }, newMessageCount > 1 ? 100 : 0);
    } else if (!wasAtBottom) {
      setShowScrollButton(true);
    }

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [chatMessages, checkIsAtBottom]);

  useEffect(() => {
    if (isAtBottom) setShowScrollButton(false);
  }, [isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    (viewport as HTMLElement).scrollTop = (viewport as HTMLElement).scrollHeight;
    setShowScrollButton(false);
    setIsAtBottom(true);
  }, []);

  const handleStartEditNickname = () => {
    if (session && identityMode === 'ephemeral') {
      setNewNickname(session.nickname);
      setIsEditingNickname(true);
    }
  };

  const handleSaveNickname = () => {
    if (newNickname.trim() && session) {
      updateNickname(newNickname.trim());
      setIsEditingNickname(false);
    }
  };

  const handleCancelEditNickname = () => {
    setIsEditingNickname(false);
    setNewNickname('');
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !session || isLoading) return;
    try {
      const success = await sendChatMessage(message.trim());
      if (success) {
        setMessage('');
      } else {
        toast({
          title: t('chat.sendFailed', 'Failed to send message'),
          description: t('chat.tryAgain', 'Please try again'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('chat.error', 'Error'),
        description: t('chat.sendFailed', 'Failed to send message'),
        variant: 'destructive',
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[85vh] sm:h-[600px] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b bg-card/50">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <div className="relative">
              <MapPin className="h-5 w-5 text-primary" />
              <div
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-primary animate-pulse' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  connectionStatus === 'error' ? 'bg-red-500' :
                  'bg-gray-500'
                }`}
                title={
                  connectionStatus === 'connected' ? 'Connected' :
                  connectionStatus === 'connecting' ? 'Connecting...' :
                  connectionStatus === 'error' ? 'Connection error' :
                  'Disconnected'
                }
              />
            </div>
            {t('chat.geoChat', 'Geo chat')}
          </DialogTitle>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded">
              {countryInfo && (
                <span className="text-lg leading-none" title={countryInfo.name}>
                  {countryInfo.flag}
                </span>
              )}
              <div className="flex items-center gap-1 font-mono text-xs">
                <MapPin className="h-3 w-3" />
                <span>{geohash}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1">
              {canToggleIdentity ? (
                <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1">
                  <button
                    onClick={() => setIdentityMode('ephemeral')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      identityMode === 'ephemeral'
                        ? 'bg-background shadow-sm text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Ghost className="h-3 w-3" />
                    {isEditingNickname ? (
                      <Input
                        value={newNickname}
                        onChange={(e) => setNewNickname(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveNickname();
                          if (e.key === 'Escape') handleCancelEditNickname();
                        }}
                        onBlur={handleSaveNickname}
                        placeholder={t('chat.newNickname', 'Nickname...')}
                        className="h-5 text-xs w-24 px-1"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span onClick={(e) => { e.stopPropagation(); handleStartEditNickname(); }}>
                        {session?.nickname || 'anonymous'}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setIdentityMode('real')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      identityMode === 'real'
                        ? 'bg-background shadow-sm text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <UserRound className="h-3 w-3" />
                    {getDisplayName(metadata, user?.pubkey || '')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2 py-1">
                  <Ghost className="h-3 w-3 text-muted-foreground" />
                  {isEditingNickname ? (
                    <Input
                      value={newNickname}
                      onChange={(e) => setNewNickname(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNickname();
                        if (e.key === 'Escape') handleCancelEditNickname();
                      }}
                      onBlur={handleSaveNickname}
                      placeholder={t('chat.newNickname', 'Nickname...')}
                      className="h-5 text-xs w-24 px-1"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={handleStartEditNickname}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {session?.nickname || 'anonymous'}
                      <Edit2 className="h-2.5 w-2.5 opacity-50" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-3">
              {(() => {
                const messagesWithContent = chatMessages.filter(
                  (msg) => msg.message && msg.message.trim().length > 0,
                );

                if (isMessagesLoading) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="animate-pulse">{t('chat.connecting', 'Connecting...')}</div>
                    </div>
                  );
                }

                if (messagesWithContent.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <Ghost className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{t('chat.noMessages', 'No messages yet. Be the first to say something!')}</p>
                    </div>
                  );
                }

                return messagesWithContent.map((msg) => {
                  const isOwn =
                    session?.pubkey === msg.event.pubkey ||
                    (identityMode === 'real' && user?.pubkey === msg.event.pubkey);
                  const timestamp = formatDistanceToNow(msg.event.created_at * 1000, { addSuffix: true });

                  return (
                    <div
                      key={msg.event.id}
                      className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      }`}>
                        {!isOwn && (
                          <div className="text-xs mb-1 opacity-80">
                            <MessageAuthor pubkey={msg.event.pubkey} nickname={msg.nickname} />
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground px-2">{timestamp}</span>
                    </div>
                  );
                });
              })()}
            </div>

            {showScrollButton && (
              <Button
                onClick={scrollToBottom}
                size="icon"
                className="fixed bottom-24 right-8 h-10 w-10 rounded-full shadow-lg z-10"
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            )}
          </ScrollArea>

          <div className="border-t p-4 bg-card/50">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  session
                    ? t('chat.typeMessage', 'Type your message...')
                    : t('chat.connecting', 'Connecting...')
                }
                disabled={!session || isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim() || !session || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
