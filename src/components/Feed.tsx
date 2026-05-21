import { useState, useEffect, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { ComposeBox } from '@/components/ComposeBox';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroGlobe } from '@/components/HeroGlobe';
import { LandingHero } from '@/components/LandingHero';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import AuthDialog from '@/components/auth/AuthDialog';
import { useFeed } from '@/hooks/useFeed';
import { useFollowingFeed } from '@/hooks/useFollowingFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useMuteList } from '@/hooks/useMuteList';
import { useAgoraFeed } from '@/hooks/useAgoraFeed';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { isEventMuted } from '@/lib/muteHelpers';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';

type CoreFeedTab = 'follows' | 'network' | 'global' | 'communities' | 'world' | 'agora';
type FeedTab = CoreFeedTab | string; // string = saved feed id

interface FeedProps {
  /** Override the kinds list instead of using feed settings. */
  kinds?: number[];
  /** Additional tag filters to apply (e.g. `{ '#m': ['application/x-webxdc'] }`). */
  tagFilters?: Record<string, string[]>;
  /** Header element rendered above the tabs (e.g. back-arrow + title). */
  header?: React.ReactNode;
  /** Hide the compose box (used on kind-specific pages). */
  hideCompose?: boolean;
  /** Message shown when the feed is empty. */
  emptyMessage?: string;
  /** Unique identifier for this feed page, used to persist the active tab in sessionStorage. Defaults to 'home'. */
  feedId?: string;
}

const FEED_BACKDROP_HUE_INTERVAL_MS = 45_000;
const FEED_BACKDROP_HUE_FADE_MS = 18_000;
const AGORA_DEFAULT_NOTE_TAGS = [['t', 'agora']];

function FeedGlobeBackground() {
  const [hueIndex, setHueIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % HOPE_PALETTE.length);
    }, FEED_BACKDROP_HUE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const activeHue = HOPE_PALETTE[hueIndex];

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-secondary/30" aria-hidden="true">
      <HeroAtmosphere hue={activeHue} fadeMs={FEED_BACKDROP_HUE_FADE_MS} className="opacity-55" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/20 to-background/55" />
      <div className="absolute inset-0 flex items-center justify-center">
        <HeroGlobe
          hue={activeHue}
          className="aspect-square max-w-none opacity-70 drop-shadow-2xl"
          style={{ width: 'clamp(552px, 86.4dvw, 984px)' }}
        />
      </div>
      <div className="absolute inset-0 bg-background/70" />
    </div>
  );
}

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage, feedId = 'home' }: FeedProps = {}) {
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [rawActiveTab, handleSetActiveTab] = useFeedTab<FeedTab>(feedId);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const isHomeAgoraFeed = !kinds && !tagFilters;

  // The home feed is Agora-only. Specialized feed pages keep Follows + Global.
  const activeTab: FeedTab = (() => {
    if (isHomeAgoraFeed) return 'agora';
    if (!kinds) {
      if (rawActiveTab === 'global') return 'global';
      if (rawActiveTab === 'follows' && user) return 'follows';
      return user ? 'follows' : 'global';
    }
    if (rawActiveTab === 'global') return 'global';
    if (rawActiveTab === 'follows' && user) return 'follows';
    return user ? 'follows' : 'global';
  })();

  // Migrate legacy hashtag:/geotag: tabs (which used to render their own
  // sub-feeds) back to the home Following feed. Followed hashtags/geotags
  // now contribute to the combined Following feed instead of getting
  // dedicated tabs.
  useEffect(() => {
    if (rawActiveTab.startsWith('hashtag:') || rawActiveTab.startsWith('geotag:')) {
      handleSetActiveTab('follows');
    }
  }, [rawActiveTab, handleSetActiveTab]);

  // Kind-specific pages (e.g. Development, WebXDC) only show Follows + Global tabs.
  const isKindSpecificPage = !!kinds;

  // When the Agora tab is active, show the mixed Agora activity feed.
  // Disabled on kind-specific pages — the Agora tab is not shown there.
  const isAgoraActive = isHomeAgoraFeed;

  // Standard feed query (used when logged in, or on kind-specific pages, or core tabs)
  const isHomeFollowingActive = activeTab === 'follows' && !isKindSpecificPage && !tagFilters;
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'network' || activeTab === 'global' || activeTab === 'communities' || activeTab === 'world' || activeTab === 'agora';
  type UseFeedTab = 'follows' | 'network' | 'global' | 'communities';
  const feedTabForQuery: UseFeedTab =
    activeTab === 'follows'
      ? (isHomeFollowingActive ? 'network' : 'network')
      : activeTab === 'network' || activeTab === 'global' || activeTab === 'communities'
        ? (activeTab as UseFeedTab)
      : 'global';
  const standardFeedOptions = (kinds || tagFilters)
    ? { kinds, tagFilters, enabled: !isHomeFollowingActive && !isAgoraActive }
    : { enabled: !isHomeFollowingActive && !isAgoraActive };
  const feedQuery = useFeed(
    isCoreFeedTab && !isAgoraActive ? feedTabForQuery : 'global',
    standardFeedOptions,
  );

  const followingFeed = useFollowingFeed(isHomeFollowingActive);

  const agoraFeed = useAgoraFeed(isAgoraActive);

  // For non-world tabs, use the standard feed query
  const queryKey = useMemo(
    () => isAgoraActive
        ? ['agora-feed']
        : isHomeFollowingActive
          ? [['feed', 'network'], ['community-activity-feed'], ['following-country-feed']]
          : ['feed', activeTab],
    [isAgoraActive, isHomeFollowingActive, activeTab],
  );

  const handleRefresh = usePageRefresh(queryKey);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage: fetchNextPageStandard,
    hasNextPage: hasNextPageStandard,
    isFetchingNextPage: isFetchingNextPageStandard,
  } = isHomeFollowingActive ? followingFeed : feedQuery;

  // Unify pagination interface
  const fetchNextPage = isAgoraActive ? agoraFeed.fetchNextPage : fetchNextPageStandard;
  const hasNextPage = isAgoraActive ? agoraFeed.hasNextPage : hasNextPageStandard;
  const isFetchingNextPage = isAgoraActive ? agoraFeed.isFetchingNextPage : isFetchingNextPageStandard;

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
  useEffect(() => {
    if (!isHomeFollowingActive && !isAgoraActive && hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [isHomeFollowingActive, isAgoraActive, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Intersection observer for infinite scroll
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten, deduplicate, and filter muted content.
  const feedItems = useMemo(() => {
    if (isAgoraActive) {
      return agoraFeed.events.map((event): FeedItem => ({ event, sortTimestamp: event.created_at }));
    }

    if (!rawData?.pages) return [];
    const seen = new Set<string>();

    return (rawData.pages as unknown as { items: FeedItem[] }[])
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });
  }, [isAgoraActive, agoraFeed.events, rawData?.pages, muteItems]);

  // Show skeletons while loading.
  const showSkeleton = isAgoraActive
      ? agoraFeed.isLoading
      : (isPending || (isLoading && !rawData));

  const useGlobeBackdrop = feedId === 'home' && !kinds && !tagFilters && !header;
  const translucentCardClassName = useGlobeBackdrop
    ? 'bg-transparent border-border/50 hover:bg-transparent'
    : undefined;
  const transparentFeedSurfaceClassName = useGlobeBackdrop ? 'bg-transparent' : undefined;

  return (
    <main className={cn('flex-1 min-w-0 min-h-dvh', useGlobeBackdrop && 'relative isolate overflow-x-clip')}>
      {useGlobeBackdrop && <FeedGlobeBackground />}

      <div className={cn(useGlobeBackdrop && 'relative z-10')}>
        {header}

        {/* CTA (logged out, main feed only) */}
        {!user && !kinds && (
          <LandingHero onJoinClick={() => setAuthDialogOpen(true)} />
        )}

        {!hideCompose && (
          <ComposeBox
            compact
            hideBorder
            className={transparentFeedSurfaceClassName}
            defaultTags={AGORA_DEFAULT_NOTE_TAGS}
            defaultExpanded
            placeholder="What's happening?"
          />
        )}

        {/* Tabs are only kept for specialized feed pages. The home feed is Agora-only. */}
        {user && (isKindSpecificPage || tagFilters) && (
          <SubHeaderBar backgroundFillClassName={transparentFeedSurfaceClassName && 'fill-transparent'}>
            <TabButton label={isKindSpecificPage || tagFilters ? 'Follows' : 'Following'} active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
            <TabButton label="Global" active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
          </SubHeaderBar>
        )}

        <PullToRefresh onRefresh={handleRefresh}>
          {showSkeleton ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <NoteCardSkeleton key={i} className={translucentCardClassName} />
              ))}
            </div>
          ) : feedItems.length > 0 ? (
            <div>
              {feedItems.map((item: FeedItem) => (
                <NoteCard
                  key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                  event={item.event}
                  repostedBy={item.repostedBy}
                  className={translucentCardClassName}
                />
              ))}
              {hasNextPage && (
                <div ref={scrollRef} className="py-4">
                  {isFetchingNextPage && (
                    <div className="flex justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <FeedEmptyState
              message={
                emptyMessage ?? (
                  activeTab === 'follows'
                    ? 'Your feed is empty. Follow some people to see their posts here.'
                    : activeTab === 'agora'
                      ? 'No Agora activity found. Check your relay connections or come back soon.'
                      : 'No posts found. Check your relay connections or come back soon.'
                )
              }
              showDiscover={!emptyMessage && activeTab === 'follows'}
              onSwitchToGlobal={
                activeTab === 'follows'
                  ? () => handleSetActiveTab('global')
                  : undefined
              }
            />
          )}
        </PullToRefresh>

        {/* Auth dialog (only needed on main feed) */}
        {!kinds && (
          <AuthDialog
            isOpen={authDialogOpen}
            onClose={() => setAuthDialogOpen(false)}
          />
        )}
      </div>
    </main>
  );
}

function NoteCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('px-4 py-3 border-b border-border', className)}>
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
