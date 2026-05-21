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
  placeholder = "What's on your mind?",
  onSuccess,
  className,
}: DetailCommentComposerProps) {
  return (
    <div className={className}>
      <ComposeBox
        compact
        defaultExpanded
        hideBorder
        replyTo={event}
        placeholder={placeholder}
        onSuccess={onSuccess}
        className="bg-transparent"
      />
    </div>
  );
}
