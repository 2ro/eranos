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

export function PinnedCommentHeader({
  isPinned,
  canManagePins,
  pinPending,
  onTogglePin,
  children,
}: PinnedCommentHeaderProps) {
  if (!isPinned && !canManagePins && !children) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-0 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {isPinned && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            <Pin className="size-3 rotate-45 fill-current" />
            Pinned
          </span>
        )}
        {children}
      </div>
      {canManagePins && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          disabled={pinPending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60',
            isPinned && 'text-primary',
          )}
        >
          <Pin className={cn('size-3 rotate-45', isPinned && 'fill-current')} />
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
      )}
    </div>
  );
}
