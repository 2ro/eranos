import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
 * Unified profile feed scoped to one author.
 *
 * Pipes {@link useAgoraFeed} through with `authors=[pubkey]` AND
 * `includeAuthorNotes: true`, so the relay-side filter pulls in:
 *
 *  - Agora-marked content (campaigns, pledges, communities, marked notes,
 *    Agora-rooted comments, donation receipts), and
 *  - every kind 1 / 6 note this author has published, regardless of the
 *    `t:agora` marker.
 *
 * The two sources merge into a single chronological timeline so the
 * profile shows "everything this person has done on the network." Replaces
 * the previous separate Activity + Posts tabs.
 *
 * Single-column inside the tab area because the timeline is mixed-kind
 * and benefits from full-width cards.
 */
export function ProfileActivityTab({ pubkey, displayName }: ProfileActivityTabProps) {
  const { t } = useTranslation();
  const {
    events,
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useAgoraFeed(true, { authors: [pubkey], includeAuthorNotes: true });

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
            <Sparkles className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {t('profile.activity.empty', { name: displayName })}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <NoteCard
            key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
            event={item.event}
            repostedBy={item.repostedBy}
          />
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
