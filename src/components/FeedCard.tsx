import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FeedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra class names merged after the defaults. */
  className?: string;
  /** Children — typically a list of NoteCards, member rows, notification rows, etc. */
  children?: React.ReactNode;
}

/**
 * Soft rounded card surface used to wrap vertical feed lists (NoteCard
 * feeds, author lists, notification rows, etc.) so they sit inside a
 * GoFundMe-style canvas instead of running edge-to-edge like a Twitter
 * timeline.
 *
 * Rows inside are expected to supply their own per-row separator
 * (NoteCard self-applies `border-b border-border`). For pure skeleton
 * lists where rows don't self-border, pass `divide` on the className.
 *
 * `overflow-hidden` ensures the last row's bottom border tucks under
 * the card's rounded corner instead of poking out.
 */
export const FeedCard = forwardRef<HTMLDivElement, FeedCardProps>(
  function FeedCard({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'mx-4 sm:mx-6 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
