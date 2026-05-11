import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ComposeBox } from '@/components/ComposeBox';
import { ContentWarningGuard } from '@/components/ContentWarningGuard';
import { NoteContent } from '@/components/NoteContent';
import { useAuthor } from '@/hooks/useAuthor';
import { useCommunityChatMessages, COMMUNITY_CHAT_KIND } from '@/hooks/useCommunityChatMessages';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
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
  const { data: messages, isLoading, isError, error, queryKey } = useCommunityChatMessages(communityATag, moderation);

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

  const chatPublish = useMemo(() => ({
    kind: COMMUNITY_CHAT_KIND,
    tags: [['a', communityATag, '', 'root']],
    suppressSuccessToast: true,
  }), [communityATag]);

  const handlePublished = useCallback((event: NostrEvent) => {
    queryClient.setQueryData<NostrEvent[]>(queryKey, (old = []) => {
      if (old.some((existing) => existing.id === event.id)) return old;
      return [...old, event].sort((a, b) => b.created_at - a.created_at);
    });
  }, [queryClient, queryKey]);

  return (
    <div>
      <div>
        {disabledReason && (
          <p className="px-4 pt-3 text-center text-xs text-muted-foreground">{disabledReason}</p>
        )}
        {canSend && (
          <ComposeBox
            compact
            placeholder="What's up?"
            customPublish={chatPublish}
            hidePoll
            submitLabel="Send"
            onPublished={handlePublished}
          />
        )}
      </div>

      <div>
        {isLoading ? (
          <CommunityChatSkeleton />
        ) : isError ? (
          <div className="py-12 px-4 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load community chat.'}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 rounded-full bg-primary/10 p-3">
              <MessageSquare className="size-6 text-primary" />
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Start the first live conversation here.</p>
          </div>
        ) : (
          <div>
            {messages.map((event, index) => {
              const previous = messages[index - 1];
              const showAvatar = !previous
                || previous.pubkey !== event.pubkey
                || previous.created_at - event.created_at > 300;
              return <CommunityChatMessage key={event.id} event={event} showAvatar={showAvatar} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CommunityChatSkeleton() {
  return (
    <div className="space-y-4 px-2 py-3">
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
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const isOwnMessage = user?.pubkey === event.pubkey;

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-3 transition-colors hover:bg-secondary/40',
        !showAvatar && 'py-2',
        isOwnMessage && 'justify-end',
      )}
    >
      {!isOwnMessage && <ChatMessageAvatar showAvatar={showAvatar} profileUrl={profileUrl} avatarShape={avatarShape} metadata={metadata} displayName={displayName} createdAt={event.created_at} />}
      <div className={cn('min-w-0 flex-1', isOwnMessage && 'flex flex-col items-end')}>
        {showAvatar && (
          <div className={cn('mb-0.5 flex items-baseline gap-2', isOwnMessage && 'justify-end')}>
            <Link
              to={profileUrl}
              className={cn('truncate text-xs font-semibold text-primary hover:underline', isOwnMessage && 'order-2')}
              onClick={(event) => event.stopPropagation()}
            >
              {displayName}
            </Link>
            <span className={cn('text-[10px] text-muted-foreground/60', isOwnMessage && 'order-1')}>{shortTimeAgo(event.created_at)}</span>
          </div>
        )}
        <ContentWarningGuard event={event}>
          <div
            className={cn(
              'inline-block w-fit max-w-[64%] break-words rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-xs',
              isOwnMessage ? 'rounded-tr-md bg-primary text-primary-foreground text-right' : 'rounded-tl-md bg-secondary/60',
            )}
          >
            <NoteContent event={event} disableNoteEmbeds />
          </div>
        </ContentWarningGuard>
      </div>
      {isOwnMessage && <ChatMessageAvatar showAvatar={showAvatar} profileUrl={profileUrl} avatarShape={avatarShape} metadata={metadata} displayName={displayName} createdAt={event.created_at} />}
    </div>
  );
}

function ChatMessageAvatar({
  showAvatar,
  profileUrl,
  avatarShape,
  metadata,
  displayName,
  createdAt,
}: {
  showAvatar: boolean;
  profileUrl: string;
  avatarShape: ReturnType<typeof getAvatarShape>;
  metadata: NostrMetadata | undefined;
  displayName: string;
  createdAt: number;
}) {
  return (
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
          {shortTimeAgo(createdAt)}
        </span>
      )}
    </div>
  );
}
