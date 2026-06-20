import { useSeoMeta } from '@unhead/react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, MessageSquare, Send } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useDirectMessages,
  useSendDirectMessage,
  type Conversation,
  type DirectMessage,
} from '@/hooks/useDirectMessages';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';

/** Small helper bundling a peer's display name + avatar from kind-0 metadata. */
function usePeerProfile(pubkey: string) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  return {
    name: getDisplayName(metadata, pubkey),
    picture: metadata?.picture,
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
        'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-accent',
      )}
    >
      <Avatar className="size-10 shrink-0">
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
          'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
          message.outgoing
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted text-foreground',
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
function MessageThread({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const { name, picture } = usePeerProfile(conversation.peer);
  const { mutateAsync: send, isPending } = useSendDirectMessage();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b p-4">
        <Avatar className="size-9">
          <AvatarImage src={picture} alt={name} />
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <p className="truncate font-medium">{name}</p>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-2 py-4">
          {conversation.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('messages.composePlaceholder')}
          aria-label={t('messages.composePlaceholder')}
          disabled={isPending}
        />
        <Button type="submit" size="icon" disabled={isPending || !draft.trim()}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="sr-only">{t('messages.send')}</span>
        </Button>
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
    <main>
      <PageHeader
        title={t('messages.title')}
        icon={<MessageSquare className="size-5" />}
        contentClassName="max-w-5xl mx-auto w-full"
      />

      <div className="mx-auto w-full max-w-5xl p-4">
        {!hasDmSupport ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                {t('messages.unsupported')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid h-[70vh] grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[20rem_1fr]">
            {/* Conversation list */}
            <div
              className={cn(
                'flex flex-col border-r',
                selected && 'hidden md:flex',
              )}
            >
              <div className="border-b p-3">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {t('messages.conversations')}
                </h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-1 p-2">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <Skeleton className="size-10 rounded-full" />
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
                <MessageThread conversation={selected} />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <div className="space-y-2">
                    <MessageSquare className="mx-auto size-8 text-muted-foreground" />
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
