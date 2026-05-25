import { Pin } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PinnedCommentHeaderProps {
  isPinned: boolean;
  canManagePins: boolean;
  pinPending: boolean;
  onTogglePin: () => void;
  children?: ReactNode;
}

/**
 * Companion overlay for a note in a `ThreadedReplyList`. Positions the
 * pin affordance in the note's top-right corner via the wrapping
 * `group/note` container that `ReplyThread` provides. One slot, three
 * states:
 *
 *  - Not pinned, can manage   → "Pin" button. Hidden until hover on
 *    fine-pointer devices (mouse / trackpad); always visible on touch
 *    devices so mobile moderators can find it.
 *  - Pinned, can manage       → "Unpin" button, always visible.
 *  - Pinned, cannot manage    → "Pinned" badge, always visible.
 *  - Not pinned, cannot manage → nothing rendered.
 *
 * The previous design rendered a full-width header bar above every
 * comment; this slot model removes that vertical noise.
 *
 * `children` (custom inline badges, e.g. a country flag) is rendered
 * as a flow row above the comment, unchanged.
 */
export function PinnedCommentHeader({
  isPinned,
  canManagePins,
  pinPending,
  onTogglePin,
  children,
}: PinnedCommentHeaderProps) {
  if (!isPinned && !canManagePins && !children) return null;

  return (
    <>
      {children && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-0 text-xs text-muted-foreground">
          {children}
        </div>
      )}

      {canManagePins ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          disabled={pinPending}
          className={cn(
            // Positioned absolutely against the per-note
            // `group/note` wrapper from `ReplyThread`.
            'absolute top-2 right-2 z-10',
            'inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2 py-1 text-xs font-medium shadow-sm backdrop-blur',
            'motion-safe:transition-opacity motion-safe:duration-150',
            // Pinned: always visible so the state is legible at a
            // glance. Not pinned: hidden until hover on hover-capable
            // pointers (mouse/trackpad); always visible on coarse
            // pointers (touch) so mobile moderators can pin.
            isPinned
              ? 'text-primary opacity-100'
              : 'text-muted-foreground opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/note:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
            'hover:bg-primary/10 hover:text-primary',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
          aria-label={isPinned ? 'Unpin comment' : 'Pin comment'}
        >
          <Pin className={cn('size-3.5 rotate-45', isPinned && 'fill-current')} />
          <span>{isPinned ? 'Unpin' : 'Pin'}</span>
        </button>
      ) : isPinned ? (
        <span
          className={cn(
            'absolute top-2 right-2 z-10',
            'inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary backdrop-blur',
          )}
        >
          <Pin className="size-3.5 rotate-45 fill-current" />
          Pinned
        </span>
      ) : null}
    </>
  );
}
