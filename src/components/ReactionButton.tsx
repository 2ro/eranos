import { useState, useRef, useCallback, useMemo } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { RenderResolvedEmoji } from '@/components/CustomEmoji';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserReaction } from '@/hooks/useUserReaction';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import type { Nip85EventStats } from '@/hooks/useNip85Stats';
import { formatNumber } from '@/lib/formatNumber';
import { impactLight } from '@/lib/haptics';
import { invalidateEventStats } from '@/lib/invalidateEventStats';
import { cn } from '@/lib/utils';

interface ReactionButtonProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /** Current reaction count from stats. */
  reactionCount?: number;
  /** Optional extra class names. */
  className?: string;
  /** Show a filled heart icon instead of outline. */
  filledHeart?: boolean;
  /**
   * Visual variant.
   * - `pill` (default): compact icon-pill matching the legacy NoteCard
   *   action bar.
   * - `chip`: rounded chip with label fallback when there's no count,
   *   matching the GoFundMe-style PostActionBar / NoteCard action row.
   */
  variant?: 'pill' | 'chip';
}

export function ReactionButton({
  eventId,
  eventPubkey,
  eventKind,
  reactionCount = 0,
  className,
  filledHeart = false,
  variant = 'pill',
}: ReactionButtonProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const statsKey = useMemo(
    () => ['nip85-event-stats', eventId, statsPubkey] as const,
    [eventId, statsPubkey],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);
  const userReaction = useUserReaction(eventId);

  const hasReacted = !!userReaction;

  const handleUnreact = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    // Find the user's kind 7 event ID to delete
    const events = await nostr.query([{
      kinds: [7],
      authors: [user.pubkey],
      '#e': [eventId],
      limit: 1,
    }]);

    if (events.length === 0) return;

    const reactionEventId = events[0].id;

    // Snapshot for rollback
    const prevReaction = queryClient.getQueryData(['user-reaction', eventId]);
    const prevStats = queryClient.getQueryData<Nip85EventStats | null>(statsKey);

    // Optimistic update: clear reaction and decrement count
    queryClient.setQueryData(['user-reaction', eventId], null);
    if (prevStats) {
      const nextStats: Nip85EventStats = {
        ...prevStats,
        reactionCount: Math.max(0, prevStats.reactionCount - 1),
      };
      queryClient.setQueryData<Nip85EventStats | null>(statsKey, nextStats);
    }

    publishEvent(
      { kind: 5, content: '', tags: [['e', reactionEventId], ['k', '7']] },
      {
        onSuccess: () => {
          setTimeout(() => {
            invalidateEventStats(queryClient, eventId, statsPubkey);
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
            queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
          }, 3000);
        },
        onError: () => {
          // Rollback
          queryClient.setQueryData(['user-reaction', eventId], prevReaction);
          if (prevStats) {
            queryClient.setQueryData<Nip85EventStats | null>(statsKey, prevStats);
          }
        },
      },
    );
  }, [user, nostr, eventId, publishEvent, queryClient, statsPubkey, statsKey]);

  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (hasReacted) return;
    if (justClosedRef.current) return;
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setMenuOpen(true);
  }, [user, hasReacted]);

  const handleMouseLeave = useCallback(() => {
    // Don't auto-close when the full emoji picker is open
    if (pickerExpandedRef.current) return;
    // Delay closing to allow user to move to the menu
    closeTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 150);
  }, []);

  return (
    <Popover open={menuOpen} onOpenChange={(open) => {
      if (open && justClosedRef.current) return;
      if (!open) pickerExpandedRef.current = false;
      setMenuOpen(open);
    }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'transition-colors focus:outline-none',
            variant === 'chip'
              ? 'inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10'
              : 'flex items-center gap-1.5 p-2 rounded-full text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
            hasReacted && 'text-pink-500',
          )}
          title={t('feed.actions.react')}
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            if (hasReacted) {
              impactLight();
              handleUnreact(e);
              return;
            }
            if (justClosedRef.current) return;
            setMenuOpen((prev) => !prev);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            if (hasReacted) return;
            impactLight();
            setMenuOpen(false);
            const prevStats = queryClient.getQueryData<Nip85EventStats | null>(statsKey);
            queryClient.setQueryData(['user-reaction', eventId], { content: '❤️' });
            if (prevStats) {
              const nextStats: Nip85EventStats = {
                ...prevStats,
                reactionCount: prevStats.reactionCount + 1,
              };
              queryClient.setQueryData<Nip85EventStats | null>(statsKey, nextStats);
            }
            publishEvent(
              {
                kind: 7,
                content: '❤️',
                tags: [['e', eventId], ['p', eventPubkey], ['k', String(eventKind)]],
              },
              {
                onSuccess: () => {
                  setTimeout(() => {
                    invalidateEventStats(queryClient, eventId, statsPubkey);
                    queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
                    queryClient.invalidateQueries({ queryKey: ['user-reaction', eventId] });
                  }, 3000);
                },
                onError: () => {
                  queryClient.setQueryData(['user-reaction', eventId], null);
                  if (prevStats) {
                    queryClient.setQueryData<Nip85EventStats | null>(statsKey, prevStats);
                  }
                },
              },
            );
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {filledHeart ? (
            <Heart className="size-6" fill={hasReacted ? 'currentColor' : 'none'} />
          ) : hasReacted && userReaction ? (
            <RenderResolvedEmoji
              emoji={userReaction}
              className={cn(
                'object-contain leading-none translate-y-px',
                variant === 'chip' ? 'h-[18px] w-[18px]' : 'h-5 w-5',
              )}
            />
          ) : (
            <Heart className={variant === 'chip' ? 'size-[18px]' : 'size-5'} />
          )}
          {reactionCount > 0 ? (
            <span className={cn('tabular-nums', variant === 'chip' ? '' : 'text-sm', hasReacted && 'text-pink-500')}>
              {formatNumber(reactionCount)}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <QuickReactMenu
          eventId={eventId}
          eventPubkey={eventPubkey}
          eventKind={eventKind}
          onExpandChange={(expanded) => {
            pickerExpandedRef.current = expanded;
          }}
          onClose={() => {
            pickerExpandedRef.current = false;
            justClosedRef.current = true;
            setMenuOpen(false);
            setTimeout(() => {
              justClosedRef.current = false;
            }, 300);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
