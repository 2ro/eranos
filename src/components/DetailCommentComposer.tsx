import type { NostrEvent } from '@nostrify/nostrify';

import { ComposeBox } from '@/components/ComposeBox';

interface DetailCommentComposerProps {
  event: NostrEvent;
  placeholder?: string;
  onSuccess?: () => void;
  className?: string;
}

export function DetailCommentComposer({
  event,
  placeholder,
  onSuccess,
  className,
}: DetailCommentComposerProps) {
  return (
    <div className={className}>
      {/* Four-sided brand-orange border frames the composer as the
          page's focused action. The bottom edge is a hair lighter than
          the top/sides so the frame visually "opens" downward into
          the comment list below without breaking the rectangle.
          `rounded-t-2xl` matches the outer comments-region wrapper. */}
      <ComposeBox
        compact
        defaultExpanded
        hideBorder
        replyTo={event}
        placeholder={placeholder}
        onSuccess={onSuccess}
        className="!bg-[hsl(40_100%_99%)] dark:!bg-[hsl(40_30%_12%)] border-t border-b border-t-primary/40 border-b-primary/20 rounded-t-2xl"
      />
    </div>
  );
}
