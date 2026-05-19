import type { NostrEvent } from '@nostrify/nostrify';
import { MessageCircle, MoreHorizontal, Share2, Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useCallback } from 'react';

import { RepostIcon } from '@/components/icons/RepostIcon';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useToast } from '@/hooks/useToast';
import { canZap } from '@/lib/canZap';
import { formatNumber } from '@/lib/formatNumber';
import { hasGoalZapSplits } from '@/lib/goalUtils';
import { shareOrCopy } from '@/lib/share';
import { cn } from '@/lib/utils';

interface PostActionBarProps {
  event: NostrEvent;
  /** Label and action for the first (reply/comments) button. */
  replyLabel?: string;
  onReply: () => void;
  onMore: () => void;
  /** Hide the zap button entirely. Useful for events with their own donation
   * flow (e.g. fundraising campaigns) where a generic Lightning zap is the
   * wrong primary CTA. Defaults to false. */
  hideZap?: boolean;
  /** Extra classes on the outer wrapper div. */
  className?: string;
}

export function PostActionBar({
  event,
  replyLabel = 'Reply',
  onReply,
  onMore,
  hideZap = false,
  className,
}: PostActionBarProps) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  // TODO: Enable zapping split-recipient NIP-75 goals once zap split payments are supported.
  const canZapAuthor = !hideZap && user && canZap(metadata) && !hasGoalZapSplits(event);

  const { data: stats } = useEventStats(event.id, event);
  const repostTotal = (stats?.reposts ?? 0) + (stats?.quotes ?? 0);

  const handleShare = useCallback(async () => {
    let encoded: string;
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
      encoded = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    } else if (event.kind >= 10000 && event.kind < 20000) {
      encoded = nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: '' });
    } else {
      encoded = nip19.neventEncode({ id: event.id, author: event.pubkey });
    }
    const url = `${window.location.origin}/${encoded}`;
    const result = await shareOrCopy(url);
    if (result === 'copied') toast({ title: 'Link copied to clipboard' });
  }, [event, toast]);

  return (
    <div
      className={cn(
        // Soft chip-style action row. Buttons cluster to the left
        // (engagement) with share/more pushed right. No heavy
        // top/bottom border band — pages can add their own separator
        // via `className` if they need one.
        'flex flex-wrap items-center gap-1 sm:gap-2',
        className,
      )}
    >
      {/* Reply / Comments */}
      <button
        className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={replyLabel}
        onClick={onReply}
      >
        <MessageCircle className="size-[18px]" />
        {stats?.replies ? (
          <span className="tabular-nums">{formatNumber(stats.replies)}</span>
        ) : (
          <span className="hidden sm:inline">{replyLabel}</span>
        )}
      </button>

      {/* Repost */}
      <RepostMenu event={event}>
        {(isReposted: boolean) => (
          <button
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium transition-colors',
              isReposted
                ? 'text-accent hover:text-accent/80 hover:bg-accent/10'
                : 'text-muted-foreground hover:text-accent hover:bg-accent/10',
            )}
            title={isReposted ? 'Undo repost' : 'Repost'}
          >
            <RepostIcon className="size-[18px]" />
            {repostTotal > 0 ? (
              <span className="tabular-nums">{formatNumber(repostTotal)}</span>
            ) : (
              <span className="hidden sm:inline">Repost</span>
            )}
          </button>
        )}
      </RepostMenu>

      {/* React */}
      <ReactionButton
        eventId={event.id}
        eventPubkey={event.pubkey}
        eventKind={event.kind}
        reactionCount={stats?.reactions}
        variant="chip"
      />

      {/* Zap */}
      {canZapAuthor && (
        <ZapDialog target={event}>
          <button
            className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
            title="Zap"
          >
            <Zap className="size-[18px]" />
            {stats?.zapAmount ? (
              <span className="tabular-nums">{formatNumber(stats.zapAmount)}</span>
            ) : (
              <span className="hidden sm:inline">Zap</span>
            )}
          </button>
        </ZapDialog>
      )}

      {/* Spacer pushes share/more to the right */}
      <div className="flex-1" />

      {/* Share */}
      <button
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sidebar:hidden"
        title="Share"
        onClick={handleShare}
      >
        <Share2 className="size-[18px]" />
      </button>

      {/* More */}
      <button
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="More"
        onClick={onMore}
      >
        <MoreHorizontal className="size-[18px]" />
      </button>
    </div>
  );
}
