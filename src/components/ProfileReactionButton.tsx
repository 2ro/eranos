import { useState, useRef, useCallback } from 'react';
import { SmilePlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useEmojiUsage } from '@/hooks/useEmojiUsage';
import { useToast } from '@/hooks/useToast';
import { impactLight } from '@/lib/haptics';
import { invalidateEventStats } from '@/lib/invalidateEventStats';
import type { NostrEvent } from '@nostrify/nostrify';

interface ProfileReactionButtonProps {
  /** The kind 0 metadata event for the profile being reacted to. */
  profileEvent: NostrEvent;
  /** Optional extra class names for the trigger button. */
  className?: string;
}

/**
 * Emoji reaction button for user profiles.
 * Opens an emoji picker and publishes a kind 7 reaction targeting
 * the user's kind 0 profile event with `a`, `e`, and `p` tags.
 */
export function ProfileReactionButton({ profileEvent, className }: ProfileReactionButtonProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { trackEmojiUsage } = useEmojiUsage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { config } = useAppContext();
  const statsPubkey = config.nip85StatsPubkey;
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerExpandedRef = useRef(false);
  const justClosedRef = useRef(false);

  const handleReact = useCallback((emoji: string, emojiTag?: string[]) => {
    if (!user) return;
    impactLight();

    trackEmojiUsage(emoji);

    const tags: string[][] = [
      ['e', profileEvent.id],
      ['p', profileEvent.pubkey],
      ['a', `0:${profileEvent.pubkey}:`],
      ['k', '0'],
    ];
    if (emojiTag) tags.push(emojiTag);

    publishEvent(
      {
        kind: 7,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          toast({ title: 'Reaction sent!' });
          // Bump reaction count on the profile. Profile reactions target the
          // kind 0 event by id, so useNip85EventStats refresh covers it. Also
          // refresh the addressable `0:<pubkey>:` key in case any consumer
          // reads profile stats via useNip85AddrStats.
          setTimeout(() => {
            invalidateEventStats(queryClient, profileEvent, statsPubkey);
            queryClient.invalidateQueries({
              queryKey: ['nip85-addr-stats', `0:${profileEvent.pubkey}:`, statsPubkey],
            });
            queryClient.invalidateQueries({
              queryKey: ['nip85-addr-stats', `0:${profileEvent.pubkey}:`],
            });
          }, 3000);
        },
      },
    );
  }, [user, profileEvent, publishEvent, trackEmojiUsage, toast, queryClient, statsPubkey]);

  if (!user) return null;

  return (
    <Popover
      open={menuOpen}
      onOpenChange={(open) => {
        if (open && justClosedRef.current) return;
        if (!open) pickerExpandedRef.current = false;
        setMenuOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={className ?? 'rounded-full size-10'}
          title="React to this profile"
          onClick={(e) => {
            e.stopPropagation();
            if (justClosedRef.current) return;
            setMenuOpen((prev) => !prev);
          }}
        >
          <SmilePlus className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <QuickReactMenu
          eventId={profileEvent.id}
          eventPubkey={profileEvent.pubkey}
          eventKind={0}
          onReact={handleReact}
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
