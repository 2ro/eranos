import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { useAgoraFeed } from '@/hooks/useAgoraFeed';

interface ProfileActivityTabProps {
  pubkey: string;
  displayName: string;
}

/**
 * Unified Agora activity feed scoped to one author.
 *
 * Pipes {@link useAgoraFeed} through with `authors=[pubkey]`, so the
 * relay-side filter does the work — the result is a mixed-kind timeline
 * of this author's campaigns, pledges, communities, Agora-marked notes,
 * comments, and on-chain zap receipts. `NoteCard` renders all of these
 * kinds; rendering details live there.
 *
 * Single-column inside the tab area because the timeline is mixed-kind
 * and benefits from full-width cards.
 */
export function ProfileActivityTab({ pubkey, displayName }: ProfileActivityTabProps) {
  const {
    events,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useAgoraFeed(true, { authors: [pubkey] });

  const { ref: scrollRef, inView } = useInView({ threshold: 0 });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading && events.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-12">
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            <Sparkles className="size-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              No Agora activity from {displayName} yet. Campaigns, pledges,
              and on-chain donations show up here.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
      {hasNextPage && (
        <div ref={scrollRef} className="flex justify-center py-6">
          {isFetchingNextPage && (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
