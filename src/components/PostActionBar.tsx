import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';
import { MessageCircle, MoreHorizontal, Share2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { RepostIcon } from '@/components/icons/RepostIcon';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { useEventStats } from '@/hooks/useTrending';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { formatNumber } from '@/lib/formatNumber';
import { shareOrCopy } from '@/lib/share';
import { cn } from '@/lib/utils';

interface PostActionBarProps {
  event: NostrEvent;
  /** Label and action for the first (reply/comments) button. */
  replyLabel?: string;
  onReply: () => void;
  onMore: () => void;
  /** Keep the share button visible at sidebar widths. Defaults to false. */
  showShareInSidebar?: boolean;
  /** Optional action rendered next to Share, e.g. Translate. */
  translateAction?: ReactNode;
  /** Extra classes on the outer wrapper div. */
  className?: string;
}

export function PostActionBar({
  event,
  replyLabel,
  onReply,
  onMore,
  showShareInSidebar = false,
  translateAction,
  className,
}: PostActionBarProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const effectiveReplyLabel = replyLabel ?? t('feed.actions.reply');

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
    const url = `${shareOrigin}/${encoded}`;
    const result = await shareOrCopy(url);
    if (result === 'copied') toast({ title: t('feed.actions.linkCopied') });
  }, [event, shareOrigin, toast, t]);

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
        title={effectiveReplyLabel}
        onClick={onReply}
      >
        <MessageCircle className="size-[18px]" />
        {stats?.replies ? (
          <span className="tabular-nums">{formatNumber(stats.replies)}</span>
        ) : (
          <span className="hidden sm:inline">{effectiveReplyLabel}</span>
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
            title={isReposted ? t('feed.actions.undoRepost') : t('feed.actions.repost')}
          >
            <RepostIcon className="size-[18px]" />
            {repostTotal > 0 ? (
              <span className="tabular-nums">{formatNumber(repostTotal)}</span>
            ) : (
              <span className="hidden sm:inline">{t('feed.actions.repost')}</span>
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

      {/* Spacer pushes share/more to the right */}
      <div className="flex-1" />

      {translateAction}

      {/* Share */}
      <button
        className={cn(
          'inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors',
          !showShareInSidebar && 'sidebar:hidden',
        )}
        title={t('feed.actions.share')}
        onClick={handleShare}
      >
        <Share2 className="size-[18px]" />
      </button>

      {/* More */}
      <button
        className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title={t('feed.actions.more')}
        onClick={onMore}
      >
        <MoreHorizontal className="size-[18px]" />
      </button>
    </div>
  );
}
