import { useSeoMeta } from '@unhead/react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Inbox, Loader2, Lock, MessageSquare, Send, ShieldCheck } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

/** Small helper bundling a peer's display name + avatar from kind-0 metadata. */
function usePeerProfile(pubkey: string) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  return {
    name: getDisplayName(metadata, pubkey),
    picture: sanitizeUrl(metadata?.picture),
  };
}

/** A single row in the conversation list (left column). */
function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { name, picture } = usePeerProfile(conversation.peer);
  const { latest } = conversation;

  const preview =
    latest.content ??
    (latest.outgoing ? t('messages.encryptedSent') : t('messages.encryptedReceived'));

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
      {conversation.messageCount > 1 && (
        <Badge variant="secondary" className="hidden shrink-0 rounded-full px-2 text-[10px] text-muted-foreground sm:inline-flex">
          {conversation.messageCount}
        </Badge>
      )}
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
function MessageThread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { t } = useTranslation();
  const { name, picture } = usePeerProfile(conversation.peer);
  const { data: messages, isLoading } = useDirectMessageThread(conversation);
  const { mutateAsync: send, isPending } = useSendDirectMessage();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 border-b bg-card/80 p-4 backdrop-blur">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="size-4" />
          <span className="sr-only">{t('messages.conversations')}</span>
        </Button>
        <Avatar className="size-10 ring-2 ring-background">
          <AvatarImage src={picture} alt={name} />
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{t('messages.subtitle')}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 bg-gradient-to-b from-muted/30 via-background to-background px-4">
        <div className="space-y-3 py-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-2/3 rounded-3xl" />
              <Skeleton className="ml-auto h-16 w-3/5 rounded-3xl" />
              <Skeleton className="h-10 w-1/2 rounded-3xl" />
            </div>
          ) : (
            messages?.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="border-t bg-card/90 p-3 backdrop-blur">
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('messages.composePlaceholder')}
            aria-label={t('messages.composePlaceholder')}
            disabled={isPending}
            rows={1}
            className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
          />
          <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={isPending || !draft.trim()}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="sr-only">{t('messages.send')}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { data: conversations, isLoading } = useDirectMessages();
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);

  useSeoMeta({
    title: `${t('messages.title')} | ${config.appName}`,
    description: t('messages.subtitle'),
  });

  const selected = useMemo(
    () => conversations?.find((c) => c.peer === selectedPeer) ?? null,
    [conversations, selectedPeer],
  );

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const hasDmSupport = !!user.signer.nip04;

  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_32rem)] pb-8">
      <PageHeader
        title={t('messages.title')}
        icon={<MessageSquare className="size-5" />}
        className="bg-transparent"
        contentClassName="max-w-6xl mx-auto w-full"
      />

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="mb-4 flex flex-col gap-3 rounded-3xl border bg-card/80 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('messages.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">{t('messages.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            <span>NIP-04</span>
          </div>
        </div>

        {!hasDmSupport ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                {t('messages.unsupported')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-h-[640px] overflow-hidden rounded-3xl border bg-background shadow-xl shadow-primary/5 md:h-[calc(100dvh-16rem)] md:min-h-[560px] md:grid-cols-[22rem_1fr]">
            {/* Conversation list */}
            <div
              className={cn(
                'min-h-0 flex-col border-r bg-muted/40',
                selected && 'hidden md:flex',
                !selected && 'flex',
              )}
            >
              <div className="border-b bg-card/80 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{t('messages.conversations')}</h2>
                    <p className="text-xs text-muted-foreground">{t('messages.subtitle')}</p>
                  </div>
                  <Inbox className="size-5 text-muted-foreground" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 p-3">
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
                  ) : conversations && conversations.length > 0 ? (
                    conversations.map((conversation) => (
                      <ConversationRow
                        key={conversation.peer}
                        conversation={conversation}
                        active={conversation.peer === selectedPeer}
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
                </div>
              </ScrollArea>
            </div>

            {/* Thread */}
            <div className={cn('min-w-0', !selected && 'hidden md:block')}>
              {selected ? (
                <MessageThread conversation={selected} onBack={() => setSelectedPeer(null)} />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-background via-muted/20 to-primary/5 p-8 text-center">
                  <div className="max-w-sm space-y-3 rounded-3xl border bg-card/80 p-8 shadow-sm">
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
      </div>
    </main>
  );
}

export default MessagesPage;
