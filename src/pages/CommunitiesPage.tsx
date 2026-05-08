import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { Loader2, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useInView } from 'react-intersection-observer';

import { CommunityCard } from '@/components/CommunityCard';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { LoginArea } from '@/components/auth/LoginArea';
import { MembersOnlyToggle } from '@/components/MembersOnlyToggle';
import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { PullToRefresh } from '@/components/PullToRefresh';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityModerationContext, type CommunityModerationContextValue } from '@/contexts/CommunityModerationContext';
import { COMMUNITY_DEFINITION_KIND, EMPTY_MODERATION } from '@/lib/communityUtils';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCommunityActivityFeed } from '@/hooks/useCommunityActivityFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useMembersOnlyFilter } from '@/hooks/useMembersOnlyFilter';
import { useMyCommunities } from '@/hooks/useMyCommunities';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CommunitiesTab = 'activities' | 'mine';

// ─── Skeletons ─────────────────────────────────────────────────────────────────

function CommunityCardSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Skeleton className="h-28 w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function CommunitiesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  useLayoutOptions({
    hasSubHeader: !!user,
  });

  const [activeTab, setActiveTab] = useFeedTab<CommunitiesTab>('communities', [
    'activities',
    'mine',
  ]);

  useSeoMeta({
    title: `Communities | ${config.appName}`,
    description: 'Discover and join hierarchical communities on Nostr',
  });

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title="Communities" icon={<Users className="size-5" />}>
        {user && activeTab === 'activities' && <MembersOnlyToggle />}
      </PageHeader>

      {/* Activities / My Communities tabs */}
      {user && (
        <SubHeaderBar>
          <TabButton
            label="Activities"
            active={activeTab === 'activities'}
            onClick={() => setActiveTab('activities')}
          />
          <TabButton
            label="My Communities"
            active={activeTab === 'mine'}
            onClick={() => setActiveTab('mine')}
          />
        </SubHeaderBar>
      )}

      {/* Arc overhang spacer */}
      {user && <div style={{ height: 20 }} />}

      {/* Tab content */}
      {activeTab === 'mine' ? (
        <MyCommunitiesTab />
      ) : (
        <ActivitiesTab
          onRefresh={() =>
            queryClient.invalidateQueries({
              queryKey: ['community-activity-feed'],
              exact: false,
            })
          }
        />
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// My Communities Tab
// ═══════════════════════════════════════════════════════════════════════════════

function MyCommunitiesTab() {
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <Users className="size-8 text-primary" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h2 className="text-xl font-bold">Your communities</h2>
          <p className="text-muted-foreground text-sm">
            Log in to see communities you've founded or joined.
          </p>
        </div>
        <LoginArea className="max-w-60" />
      </div>
    );
  }

  return <MyCommunitiesContent />;
}

function MyCommunitiesContent() {
  const { data: myCommunities, isLoading } = useMyCommunities();

  if (isLoading) {
    return (
      <div className="px-4 py-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CommunityCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!myCommunities || myCommunities.length === 0) {
    return (
      <FeedEmptyState message="You haven't founded or joined any communities yet." />
    );
  }

  return (
    <div className="px-4 py-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
      {myCommunities.map((entry) => (
        <CommunityCard
          key={entry.community.aTag}
          event={entry.event}
          isFounded={entry.isFounded}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Activities Tab
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract the community a-tag from an event (uppercase A for NIP-22, lowercase a with 34550: prefix for goals). */
function getCommunityATag(event: NostrEvent): string | undefined {
  return event.tags.find(([n]) => n === 'A')?.[1]
    ?? event.tags.find(([n, v]) => n === 'a' && v?.startsWith('34550:'))?.[1];
}

function ActivitiesTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { user } = useCurrentUser();
  const {
    data: activityEvents,
    isLoading,
    moderationByATag,
    rankMapByATag,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCommunityActivityFeed();
  const { membersOnly } = useMembersOnlyFilter();
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Build per-community context values for NoteMoreMenu moderation actions.
  // Keyed by community A tag — each NoteCard is wrapped in its own provider.
  const contextByATag = useMemo(() => {
    const map = new Map<string, CommunityModerationContextValue>();
    for (const [aTag, rankMap] of rankMapByATag) {
      const moderation = moderationByATag.get(aTag) ?? EMPTY_MODERATION;
      map.set(aTag, { communityATag: aTag, moderation, rankMap });
    }
    return map;
  }, [moderationByATag, rankMapByATag]);

  // Apply the members-only presentation filter. Community definitions
  // (kind 34550) are never filtered — they represent the community itself,
  // not user-generated content. Only community-scoped content (kind 1111
  // and future kinds) is filtered to authored-by-member when the toggle
  // is active, matching the NIP's canonical-author guidance.
  const displayedEvents = useMemo(() => {
    if (!activityEvents) return activityEvents;
    if (!membersOnly) return activityEvents;
    return activityEvents.filter((event) => {
      if (event.kind === COMMUNITY_DEFINITION_KIND) return true;
      const aTag = getCommunityATag(event);
      if (!aTag) return true; // No community scope — pass through
      const rankMap = rankMapByATag.get(aTag);
      if (!rankMap) return true; // Moderation data not resolved — avoid hiding
      return rankMap.has(event.pubkey);
    });
  }, [activityEvents, membersOnly, rankMapByATag]);

  if (!user) {
    return (
      <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <Users className="size-8 text-primary" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h2 className="text-xl font-bold">Community activity</h2>
          <p className="text-muted-foreground text-sm">
            Log in to see activity from your communities.
          </p>
        </div>
        <LoginArea className="max-w-60" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <>
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedEvents && displayedEvents.length > 0 ? (
          <div>
            {displayedEvents.map((event) => {
              const aTag = getCommunityATag(event);
              const ctx = aTag ? contextByATag.get(aTag) ?? null : null;
              return (
                <CommunityModerationContext.Provider key={event.id} value={ctx}>
                  <NoteCard event={event} />
                </CommunityModerationContext.Provider>
              );
            })}
          </div>
        ) : membersOnly && activityEvents && activityEvents.length > 0 ? (
          <FeedEmptyState message="No activity from members of your communities yet. Toggle the shield icon to see all community activity." />
        ) : (
          <FeedEmptyState message="No activity from your communities yet." />
        )}
        {!isLoading && hasNextPage && (
          <div ref={scrollRef} className="py-4 flex justify-center">
            {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          </div>
        )}
      </>
    </PullToRefresh>
  );
}
