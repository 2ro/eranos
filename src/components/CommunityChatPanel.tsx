import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { NoteContent } from '@/components/NoteContent';
import { useAuthor } from '@/hooks/useAuthor';
import { useCommunityChatMessages, COMMUNITY_CHAT_KIND } from '@/hooks/useCommunityChatMessages';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import type { CommunityMember, CommunityModeration } from '@/lib/communityUtils';
import { cn } from '@/lib/utils';

interface CommunityChatPanelProps {
  communityATag: string;
  moderation: CommunityModeration;
  rankMap: ReadonlyMap<string, CommunityMember>;
  isMembershipLoading: boolean;
}

function shortTimeAgo(timestamp: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function CommunityChatPanel({
  communityATag,
  moderation,
  rankMap,
  isMembershipLoading,
}: CommunityChatPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { data: messages, isLoading, isError, error, queryKey } = useCommunityChatMessages(communityATag, moderation);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const isBanned = !!user && moderation.bannedPubkeys.has(user.pubkey);
  const isMember = !!user && rankMap.has(user.pubkey) && !isBanned;
  const disabledReason = !user
    ? 'Log in to chat with this community.'
    : isMembershipLoading
      ? 'Loading membership...'
      : isBanned
        ? 'You are banned from this community.'
        : !isMember
          ? 'Only community members can chat.'
          : undefined;
  const canSend = !disabledReason;

  useEffect(() => {
    if (!shouldAutoScrollRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const handleSend = useCallback(async () => {
    const content = message.trim();
    if (!content || !canSend || isPending) return;

    try {
      setMessage('');
      const event = await publishEvent({
        kind: COMMUNITY_CHAT_KIND,
        content,
        tags: [['a', communityATag, '', 'root']],
      });

      queryClient.setQueryData<NostrEvent[]>(queryKey, (old = []) => {
        if (old.some((existing) => existing.id === event.id)) return old;
        return [...old, event].sort((a, b) => a.created_at - b.created_at);
      });
    } catch {
      setMessage(content);
      toast({
        title: 'Failed to send message',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    }
  }, [message, canSend, isPending, publishEvent, communityATag, queryClient, queryKey, toast]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="px-4 py-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageCircle className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-none">Community Chat</h3>
            <p className="mt-1 text-xs text-muted-foreground">Fast, realtime messages for members.</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="h-[min(68vh,560px)] overflow-y-auto px-3 py-3"
          onScroll={handleScroll}
        >
          {isLoading ? (
            <CommunityChatSkeleton />
          ) : isError ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load community chat.'}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="mb-3 rounded-full bg-primary/10 p-3">
                <MessageCircle className="size-6 text-primary" />
              </div>
              <p className="text-sm font-medium">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Start the first live conversation here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((event, index) => {
                const previous = messages[index - 1];
                const showAvatar = !previous
                  || previous.pubkey !== event.pubkey
                  || event.created_at - previous.created_at > 300;
                return <CommunityChatMessage key={event.id} event={event} showAvatar={showAvatar} />;
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          {disabledReason && (
            <p className="mb-2 text-center text-xs text-muted-foreground">{disabledReason}</p>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the community..."
              disabled={!canSend || isPending}
              maxLength={1000}
              className="max-h-32 min-h-11 resize-none rounded-xl text-base md:text-sm"
            />
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-xl"
              onClick={() => void handleSend()}
              disabled={!message.trim() || !canSend || isPending}
              aria-label="Send chat message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommunityChatSkeleton() {
  return (
    <div className="space-y-4 p-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className={cn('h-4', index % 2 === 0 ? 'w-4/5' : 'w-2/3')} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunityChatMessage({ event, showAvatar }: { event: NostrEvent; showAvatar: boolean }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  return (
    <div className={cn('group flex gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/40', !showAvatar && 'py-0.5')}>
      <div className="w-8 shrink-0">
        {showAvatar ? (
          <Link to={profileUrl} onClick={(event) => event.stopPropagation()}>
            <Avatar shape={avatarShape} className="size-8">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <span className="hidden pt-0.5 text-[10px] text-muted-foreground/60 group-hover:block">
            {shortTimeAgo(event.created_at)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {showAvatar && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <Link
              to={profileUrl}
              className="truncate text-xs font-semibold text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {displayName}
            </Link>
            <span className="text-[10px] text-muted-foreground/60">{shortTimeAgo(event.created_at)}</span>
          </div>
        )}
        <div className="break-words text-sm leading-relaxed">
          <NoteContent
            event={event}
            className="inline"
            disableEmbeds
            disableMediaEmbeds
            disableNoteEmbeds
          />
        </div>
      </div>
    </div>
  );
}
