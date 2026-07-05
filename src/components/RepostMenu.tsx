import { Megaphone, Quote, Undo2 } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { impactLight } from '@/lib/haptics';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useRepostStatus } from '@/hooks/useRepostStatus';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { getRepostKind } from '@/lib/feedUtils';
import { DITTO_RELAY } from '@/lib/appRelays';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { buildAgoraUrl } from '@/lib/appUrls';
import type { Nip85EventStats } from '@/hooks/useNip85Stats';
import { invalidateEventStats } from '@/lib/invalidateEventStats';

interface RepostMenuProps {
  event: NostrEvent;
  children: React.ReactNode | ((isReposted: boolean) => React.ReactNode);
}

export function RepostMenu({ event, children }: RepostMenuProps) {
  const [open, setOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteInitialContent, setQuoteInitialContent] = useState<string | undefined>(undefined);
  const [attachQuotedEvent, setAttachQuotedEvent] = useState(true);
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { mutate: deleteEvent } = useDeleteEvent();
  const repostEventId = useRepostStatus(event.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const statsKey = ['nip85-event-stats', event.id, statsPubkey] as const;

  const isReposted = !!repostEventId;

  const handleRepost = () => {
    if (!user) {
      toast({ title: 'Please log in to repost', variant: 'destructive' });
      return;
    }
    impactLight();

    // Optimistically update stats cache immediately
    const prevStats = queryClient.getQueryData<Nip85EventStats | null>(statsKey);
    if (prevStats) {
      const nextStats: Nip85EventStats = {
        ...prevStats,
        repostCount: prevStats.repostCount + 1,
      };
      queryClient.setQueryData<Nip85EventStats | null>(statsKey, nextStats);
    }

    // Optimistically mark as reposted
    queryClient.setQueryData(['user-repost', event.id], 'optimistic');

    // Kind 6 for kind 1 notes, kind 16 (generic repost) for everything else
    const repostKind = getRepostKind(event.kind);
    const tags: string[][] = [
      ['e', event.id, DITTO_RELAY],
      ['p', event.pubkey],
    ];
    // Kind 16 generic reposts require a 'k' tag with the original event's kind
    if (repostKind === 16) {
      tags.push(['k', String(event.kind)]);
      // Addressable events (30000–39999) should include an 'a' tag per NIP-18
      if (event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
        tags.push(['a', `${event.kind}:${event.pubkey}:${dTag}`, DITTO_RELAY]);
      }
    }

    publishEvent(
      {
        kind: repostKind,
        content: '',
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          toast({ title: 'Reposted!' });
          setOpen(false);
          // Delay invalidation so the relay has time to index the new event.
          setTimeout(() => {
            invalidateEventStats(queryClient, event, statsPubkey);
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
            queryClient.invalidateQueries({ queryKey: ['user-repost', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to repost', variant: 'destructive' });
          // Revert optimistic updates
          if (prevStats) {
            queryClient.setQueryData<Nip85EventStats | null>(statsKey, prevStats);
          }
          queryClient.setQueryData(['user-repost', event.id], null);
        },
      }
    );
  };

  const handleUnrepost = () => {
    if (!user || !repostEventId) return;
    impactLight();

    // Optimistically update stats cache
    const prevStats = queryClient.getQueryData<Nip85EventStats | null>(statsKey);
    if (prevStats) {
      const nextStats: Nip85EventStats = {
        ...prevStats,
        repostCount: Math.max(0, prevStats.repostCount - 1),
      };
      queryClient.setQueryData<Nip85EventStats | null>(statsKey, nextStats);
    }

    // Optimistically mark as not reposted
    const prevRepostStatus = queryClient.getQueryData(['user-repost', event.id]);
    queryClient.setQueryData(['user-repost', event.id], null);

    deleteEvent(
      { eventId: repostEventId, eventKind: getRepostKind(event.kind) },
      {
        onSuccess: () => {
          toast({ title: 'Repost removed' });
          setOpen(false);
          setTimeout(() => {
            invalidateEventStats(queryClient, event, statsPubkey);
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
            queryClient.invalidateQueries({ queryKey: ['user-repost', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to remove repost', variant: 'destructive' });
          // Revert optimistic updates
          if (prevStats) {
            queryClient.setQueryData<Nip85EventStats | null>(statsKey, prevStats);
          }
          queryClient.setQueryData(['user-repost', event.id], prevRepostStatus);
        },
      }
    );
  };

  const handleQuote = () => {
    setQuoteInitialContent(undefined);
    setAttachQuotedEvent(true);
    setOpen(false);
    setQuoteOpen(true);
  };

  const handleBoost = () => {
    setQuoteInitialContent(`\n\n${buildAgoraUrl(encodeEventAddress(event))}`);
    setAttachQuotedEvent(false);
    setOpen(false);
    setQuoteOpen(true);
  };

  const menuContent = (
    <div className="w-full">
      {isReposted ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUnrepost();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-accent hover:bg-secondary/60 transition-colors"
        >
          <Undo2 className="size-5" />
          <span>Undo repost</span>
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRepost();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
        >
          <RepostIcon className="size-5" />
          <span>Repost</span>
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleQuote();
        }}
        className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Quote className="size-5" />
        <span>Quote</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleBoost();
        }}
        className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Megaphone className="size-5" />
        <span>Boost</span>
      </button>
    </div>
  );

  const trigger = typeof children === 'function' ? children(isReposted) : children;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent 
          className="w-48 p-0 rounded-xl overflow-hidden"
          align="start"
          side="top"
          onClick={(e) => e.stopPropagation()}
        >
          {menuContent}
        </PopoverContent>
      </Popover>
      <ReplyComposeModal 
        quotedEvent={attachQuotedEvent ? event : undefined}
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        initialContent={quoteInitialContent}
      />
    </>
  );
}
