import { useSeoMeta } from '@unhead/react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { ArrowLeft, ArrowUp, BellOff, Loader2, Lock, MessageSquare, Search, X } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useDirectMessages,
  useDirectMessageThread,
  useSendDirectMessage,
  type Conversation,
  type DirectMessage,
} from '@/hooks/useDirectMessages';
import { useMuteList } from '@/hooks/useMuteList';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

/** Small helper bundling a peer's display name + avatar from kind-0 metadata. */
function usePeerProfile(pubkey: string) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const profileUrl = useProfileUrl(pubkey, metadata);
  return {
    name: getDisplayName(metadata, pubkey),
    picture: sanitizeUrl(metadata?.picture),
    profileUrl,
  };
}

/** A single row in the conversation list (left column). */
function ConversationRow({
  conversation,
  active,
  searchQuery,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  searchQuery: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { name, picture } = usePeerProfile(conversation.peer);
  const { latest } = conversation;

  const preview =
    latest.content ??
    (latest.outgoing ? t('messages.encryptedSent') : t('messages.encryptedReceived'));
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  if (
    normalizedSearch &&
    !name.toLocaleLowerCase().includes(normalizedSearch) &&
    !conversation.peer.toLocaleLowerCase().includes(normalizedSearch) &&
    !preview.toLocaleLowerCase().includes(normalizedSearch)
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition-all',
        'hover:border-border hover:bg-background/85 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'border-primary/20 bg-primary/10 shadow-sm hover:bg-primary/10',
      )}
    >
      <Avatar className="size-11 shrink-0 ring-2 ring-background">
        <AvatarImage src={picture} alt={name} />
        <AvatarFallback>{name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {timeAgo(latest.createdAt)}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {latest.outgoing && <span className="text-muted-foreground/70">{t('messages.youPrefix')} </span>}
          {preview}
        </p>
      </div>
    </button>
  );
}

/** A single message bubble in the thread (right column). */
function MessageBubble({ message }: { message: DirectMessage }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex', message.outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-3xl px-4 py-2.5 text-sm shadow-sm md:max-w-[70%]',
          message.outgoing
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border bg-card text-foreground',
        )}
      >
        {message.content !== null ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <p className="flex items-center gap-1.5 italic opacity-80">
            <Lock className="size-3.5" />
            {t('messages.decryptFailed')}
          </p>
        )}
        <p
          className={cn(
            'mt-1 text-[10px]',
            message.outgoing ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {timeAgo(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

/** The active conversation thread plus a send composer. */
function MessageThread({
  conversation,
  onBack,
  onMuted,
}: {
  conversation: Conversation;
  onBack: () => void;
  onMuted: (peer: string) => void;
}) {
  const { t } = useTranslation();
  const { name, picture, profileUrl } = usePeerProfile(conversation.peer);
  const { data: messages, isLoading } = useDirectMessageThread(conversation);
  const { mutateAsync: send, isPending } = useSendDirectMessage();
  const { addMute } = useMuteList();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [muteConfirmOpen, setMuteConfirmOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const hasDraft = draft.trim().length > 0;
  const normalizedThreadSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleMessages = normalizedThreadSearch
    ? messages?.filter((message) => message.content?.toLocaleLowerCase().includes(normalizedThreadSearch))
    : messages;

  useEffect(() => {
    setDraft('');
    setSearchOpen(false);
    setSearchQuery('');
  }, [conversation.peer]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isPending) return;
    try {
      await send({ peer: conversation.peer, text });
      setDraft('');
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast({
        title: t('messages.sendFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  const handleMute = async () => {
    try {
      await addMute.mutateAsync({ type: 'pubkey', value: conversation.peer });
      setMuteConfirmOpen(false);
      onMuted(conversation.peer);
      toast({
        title: t('messages.mutedToastTitle'),
        description: t('messages.mutedToastDescription', { name }),
      });
    } catch (err) {
      toast({
        title: t('messages.muteFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-muted/30 via-background to-background">
      <div className="flex items-center gap-3 p-4">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="size-4" />
          <span className="sr-only">{t('messages.conversations')}</span>
        </Button>
        <Link to={profileUrl} aria-label={t('messages.visitProfile', { name })} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="size-10 ring-2 ring-background transition-opacity hover:opacity-85">
            <AvatarImage src={picture} alt={name} />
            <AvatarFallback>{name.charAt(0)}</AvatarFallback>
          </Avatar>
        </Link>
        <p className="min-w-0 flex-1 truncate font-semibold">{name}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setSearchOpen((open) => !open)}
          aria-label={t('messages.searchConversation')}
          aria-pressed={searchOpen}
        >
          {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => setMuteConfirmOpen(true)}
          aria-label={t('messages.muteUser', { name })}
        >
          <BellOff className="size-4" />
        </Button>
      </div>

      {searchOpen && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('messages.searchPlaceholder')}
              aria-label={t('messages.searchConversation')}
              className="h-10 rounded-full border-0 bg-muted/40 pl-9 pr-9 shadow-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('common.clear')}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 px-4">
        <div className="space-y-3 py-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-2/3 rounded-3xl" />
              <Skeleton className="ml-auto h-16 w-3/5 rounded-3xl" />
              <Skeleton className="h-10 w-1/2 rounded-3xl" />
            </div>
          ) : (
            visibleMessages && visibleMessages.length > 0 ? (
              visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />)
            ) : normalizedThreadSearch ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('messages.noSearchResults')}</p>
            ) : null
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('messages.composePlaceholder')}
          aria-label={t('messages.composePlaceholder')}
          disabled={isPending}
          rows={1}
          className="max-h-32 min-h-12 resize-none rounded-full border-0 bg-muted/40 px-4 py-3 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-sm"
        />
        {hasDraft && (
          <button
            type="submit"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-6" strokeWidth={2.5} />}
            <span className="sr-only">{t('messages.send')}</span>
          </button>
        )}
      </form>

      <AlertDialog open={muteConfirmOpen} onOpenChange={setMuteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('messages.muteDialogTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('messages.muteDialogDescription', { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addMute.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleMute();
              }}
              disabled={addMute.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {addMute.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t('messages.confirmMute')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const {
    data: conversations,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    pageCount,
  } = useDirectMessages();
  const { muteItems } = useMuteList();
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hiddenMutedPeers, setHiddenMutedPeers] = useState<Set<string>>(() => new Set());
  const { ref: olderMessagesRef, inView: olderMessagesInView } = useInView({ threshold: 0, rootMargin: '300px' });

  useSeoMeta({
    title: `${t('messages.title')} | ${config.appName}`,
    description: t('messages.subtitle'),
  });

  const mutedPubkeys = useMemo(
    () => new Set(muteItems.filter((item) => item.type === 'pubkey').map((item) => item.value)),
    [muteItems],
  );
  const visibleConversations = useMemo(
    () => conversations?.filter((conversation) => (
      !hiddenMutedPeers.has(conversation.peer) && !mutedPubkeys.has(conversation.peer)
    )),
    [conversations, hiddenMutedPeers, mutedPubkeys],
  );
  const selected = useMemo(
    () => visibleConversations?.find((c) => c.peer === selectedPeer) ?? null,
    [visibleConversations, selectedPeer],
  );

  const handleMuted = (peer: string) => {
    setHiddenMutedPeers((prev) => new Set(prev).add(peer));
    setSelectedPeer(null);
  };

  useEffect(() => {
    if (pageCount === 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [pageCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (olderMessagesInView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [olderMessagesInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const hasDmSupport = !!user.signer.nip04;

  return (
    <main className="h-full overflow-hidden bg-background">
      {!hasDmSupport ? (
        <div className="flex h-full items-center justify-center px-8 py-12 text-center">
          <p className="mx-auto max-w-sm text-muted-foreground">
            {t('messages.unsupported')}
          </p>
        </div>
      ) : (
        <div className="grid h-full min-h-0 overflow-hidden bg-background md:grid-cols-[22rem_1fr]">
          {/* Conversation list */}
          <div
            className={cn(
              'h-full min-h-0 flex-col bg-muted/40',
              selected && 'hidden md:flex',
              !selected && 'flex',
            )}
          >
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('nav.search')}
                    aria-label={t('nav.search')}
                    className="h-10 rounded-full border-0 bg-background pl-9 shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl p-3">
                      <Skeleton className="size-11 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  ))
                ) : visibleConversations && visibleConversations.length > 0 ? (
                  visibleConversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.peer}
                      conversation={conversation}
                      active={conversation.peer === selectedPeer}
                      searchQuery={search}
                      onSelect={() => setSelectedPeer(conversation.peer)}
                    />
                  ))
                ) : (
                  <div className="px-4 py-12 text-center">
                    <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                      {t('messages.empty')}
                    </p>
                  </div>
                )}
                {hasNextPage && visibleConversations && visibleConversations.length > 0 && !search.trim() && (
                  <div ref={olderMessagesRef} className="flex justify-center py-4">
                    {isFetchingNextPage && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Thread */}
          <div className={cn('h-full min-h-0 min-w-0', !selected && 'hidden md:block')}>
            {selected ? (
              <MessageThread conversation={selected} onBack={() => setSelectedPeer(null)} onMuted={handleMuted} />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-background via-muted/20 to-primary/5 p-8 text-center">
                <div className="max-w-sm space-y-3">
                  <MessageSquare className="mx-auto size-10 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {t('messages.selectPrompt')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default MessagesPage;
