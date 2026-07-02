import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { ComposeBox } from '@/components/ComposeBox';
import { LandingHero } from '@/components/LandingHero';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { FeedModeSwitcher } from '@/components/FeedModeSwitcher';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import AuthDialog from '@/components/auth/AuthDialog';
import { useFeed } from '@/hooks/useFeed';
import { useFollowingFeed } from '@/hooks/useFollowingFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useMuteList } from '@/hooks/useMuteList';
import { useMixedFeed, type FeedMode } from '@/hooks/useMixedFeed';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { cn } from '@/lib/utils';
import { getEventRelaySource } from '@/lib/relayDebug';
import type { FeedItem } from '@/lib/feedUtils';

type CoreFeedTab = 'follows' | 'network' | 'global' | 'communities' | 'world' | 'agora';
type FeedTab = CoreFeedTab | string; // string = saved feed id

interface FeedProps {
  /** Override the kinds list instead of using feed settings. */
  kinds?: number[];
  /** Additional tag filters to apply (e.g. `{ '#m': ['image/jpeg'] }`). */
  tagFilters?: Record<string, string[]>;
  /** Header element rendered above the tabs (e.g. back-arrow + title). */
  header?: React.ReactNode;
  /** Hide the compose box (used on kind-specific pages). */
  hideCompose?: boolean;
  /** Message shown when the feed is empty. */
  emptyMessage?: string;
  /** Unique identifier for this feed page, used to persist the active tab/mode in localStorage. Defaults to 'home'. */
  feedId?: string;
}

const FEED_MODES: readonly FeedMode[] = ['agora', 'all-nostr', 'following'] as const;

function isFeedMode(value: string): value is FeedMode {
  return (FEED_MODES as readonly string[]).includes(value);
}

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage, feedId = 'home' }: FeedProps = {}) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  const [rawActiveTab, handleSetActiveTab] = useFeedTab<FeedTab>(feedId);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const isHomeAgoraFeed = !kinds && !tagFilters;

  // For the home /feed page we use a three-mode picker instead of the
  // Follows/Global tab pair. Mode persists via the same useFeedTab storage,
  // keyed under the same feedId.
  const homeFeedMode: FeedMode = (() => {
    if (!isHomeAgoraFeed) return 'agora';
    if (isFeedMode(rawActiveTab)) return rawActiveTab;
    // Legacy values get coerced to the Agora default.
    return 'agora';
  })();

  // Specialized feed pages keep the original Follows + Global tabs.
  const activeTab: FeedTab = (() => {
    if (isHomeAgoraFeed) return homeFeedMode;
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

  const handleModeChange = (mode: FeedMode) => {
    handleSetActiveTab(mode);
  };

  // Kind-specific pages (e.g. Development, WebXDC) only show Follows + Global tabs.
  const isKindSpecificPage = !!kinds;

  // -------------------------------------------------------------------------
  // Home feed (mixed-mode): drives off useMixedFeed.
  // -------------------------------------------------------------------------
  const mixedFeed = useMixedFeed(homeFeedMode, isHomeAgoraFeed);

  // -------------------------------------------------------------------------
  // Specialized feed pages: original Follows/Global behavior.
  // -------------------------------------------------------------------------
  const isHomeFollowingActive = activeTab === 'follows' && !isKindSpecificPage && !tagFilters && !isHomeAgoraFeed;
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'network' || activeTab === 'global' || activeTab === 'communities' || activeTab === 'world' || activeTab === 'agora';
  type UseFeedTab = 'follows' | 'network' | 'global' | 'communities';
  const feedTabForQuery: UseFeedTab =
    activeTab === 'follows'
      ? 'network'
      : activeTab === 'network' || activeTab === 'global' || activeTab === 'communities'
        ? (activeTab as UseFeedTab)
      : 'global';
  const standardFeedOptions = (kinds || tagFilters)
    ? { kinds, tagFilters, enabled: !isHomeFollowingActive && !isHomeAgoraFeed }
    : { enabled: !isHomeFollowingActive && !isHomeAgoraFeed };
  const feedQuery = useFeed(
    isCoreFeedTab && !isHomeAgoraFeed ? feedTabForQuery : 'global',
    standardFeedOptions,
  );

  const followingFeed = useFollowingFeed(isHomeFollowingActive);

  // For non-world tabs, use the standard feed query
  const queryKey = useMemo(
    () => isHomeAgoraFeed
        ? ['mixed-feed', homeFeedMode]
        : isHomeFollowingActive
          ? [['feed', 'network'], ['community-activity-feed'], ['following-country-feed']]
          : ['feed', activeTab],
    [isHomeAgoraFeed, homeFeedMode, isHomeFollowingActive, activeTab],
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
  const fetchNextPage = isHomeAgoraFeed ? mixedFeed.fetchNextPage : fetchNextPageStandard;
  const hasNextPage = isHomeAgoraFeed ? mixedFeed.hasNextPage : hasNextPageStandard;
  const isFetchingNextPage = isHomeAgoraFeed ? mixedFeed.isFetchingNextPage : isFetchingNextPageStandard;

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
  useEffect(() => {
    if (!isHomeFollowingActive && !isHomeAgoraFeed && hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [isHomeFollowingActive, isHomeAgoraFeed, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

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
    if (isHomeAgoraFeed) {
      return mixedFeed.items;
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
  }, [isHomeAgoraFeed, mixedFeed.items, rawData?.pages, muteItems]);

  useEffect(() => {
    if (feedItems.length === 0) return;

    console.groupCollapsed('[nostr feed render]', {
      feedId,
      mode: isHomeAgoraFeed ? homeFeedMode : activeTab,
      count: feedItems.length,
    });
    console.table(feedItems.map((item, index) => ({
      index,
      relay: getEventRelaySource(item.event.id) ?? 'unknown',
      kind: item.event.kind,
      id: item.event.id,
      created_at: item.event.created_at,
      repostedBy: item.repostedBy ?? '',
    })));
    console.groupEnd();
  }, [feedId, isHomeAgoraFeed, homeFeedMode, activeTab, feedItems]);

  // Show skeletons while loading.
  const showSkeleton = isHomeAgoraFeed
      ? mixedFeed.isLoading && feedItems.length === 0
      : (isPending || (isLoading && !rawData));

  // Per-mode empty-state copy for the home feed.
  const homeEmptyMessage = (() => {
    if (homeFeedMode === 'agora') {
      return t('feed.empty.homeAgora');
    }
    if (homeFeedMode === 'following') {
      return user
        ? t('feed.empty.homeFollowingLoggedIn')
        : t('feed.empty.homeFollowingLoggedOut');
    }
    return t('feed.empty.homeOther');
  })();

  return (
    <main className="flex-1 min-w-0 min-h-dvh bg-background">
      <div>
        {header}

        {/* CTA (logged out, main feed only) */}
        {!user && !kinds && (
          <LandingHero onJoinClick={() => setAuthDialogOpen(true)} />
        )}

        {/* Home-feed mode switcher: top-left, anchors the page visually */}
        {isHomeAgoraFeed && (
          <div className="px-4 pt-5 pb-3 sm:pt-6">
            <FeedModeSwitcher
              value={homeFeedMode}
              onChange={handleModeChange}
              followingAvailable={!!user}
              onLoginRequested={() => setAuthDialogOpen(true)}
            />
          </div>
        )}

        {/* Tabs are only kept for specialized feed pages. The home feed
            uses the FeedModeSwitcher above. Sits OUTSIDE the muted wrap
            so the tab strip reads as page chrome, not panel chrome. */}
        {user && (isKindSpecificPage || tagFilters) && (
          <SubHeaderBar>
            <TabButton label={isKindSpecificPage || tagFilters ? t('feed.tabs.follows') : t('feed.tabs.following')} active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
            <TabButton label={t('feed.tabs.global')} active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
          </SubHeaderBar>
        )}

        {/* Composer + feed list share a single muted rounded panel so
            the reading area reads as one focused surface, matching the
            comments region on the campaign detail page. The composer
            inside gets a brand-orange border that frames it against
            the muted wrap below. Per-note `border-b` dividers are
            retinted to match the composer's bottom border. */}
        <div className="rounded-2xl bg-muted/60 overflow-hidden border-l border-r border-primary/20 [&_article]:border-b-primary/20 [&_article]:bg-background/40">
          {!hideCompose && (
            <ComposeBox
              compact
              hideBorder
              defaultExpanded
              placeholder={t('feed.compose.placeholder')}
              className="!bg-[hsl(40_100%_99%)] dark:!bg-[hsl(40_30%_12%)] border-t border-b border-t-primary/40 border-b-primary/20 rounded-t-2xl"
            />
          )}

          <PullToRefresh onRefresh={handleRefresh}>
            {showSkeleton ? (
              <div className="divide-y divide-primary/20 [&>div]:border-b-primary/20">
                {Array.from({ length: 5 }).map((_, i) => (
                  <NoteCardSkeleton key={i} />
                ))}
              </div>
            ) : feedItems.length > 0 ? (
              <div>
                {feedItems.map((item: FeedItem) => (
                  <NoteCard
                    key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                    event={item.event}
                    repostedBy={item.repostedBy}
                    className="py-4"
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
            ) : isHomeAgoraFeed ? (
              <HomeFeedEmptyState
                mode={homeFeedMode}
                message={homeEmptyMessage}
                onSwitchToAgora={homeFeedMode !== 'agora' ? () => handleModeChange('agora') : undefined}
                onLoginClick={!user && homeFeedMode === 'following' ? () => setAuthDialogOpen(true) : undefined}
              />
            ) : (
              <FeedEmptyState
                message={
                  emptyMessage ?? (
                    activeTab === 'follows'
                      ? t('feed.empty.follows')
                      : t('feed.empty.global')
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
        </div>

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

interface HomeFeedEmptyStateProps {
  mode: FeedMode;
  message: string;
  onSwitchToAgora?: () => void;
  onLoginClick?: () => void;
}

function HomeFeedEmptyState({ mode, message, onSwitchToAgora, onLoginClick }: HomeFeedEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="py-20 px-8 flex flex-col items-center text-center">
      <p className="text-muted-foreground max-w-sm leading-relaxed">{message}</p>
      <div className="flex flex-col gap-2 mt-6 w-full max-w-xs">
        {onLoginClick && (
          <Button className="rounded-full" onClick={onLoginClick}>
            {t('feed.empty.logIn')}
          </Button>
        )}
        {onSwitchToAgora && (
          <Button
            variant={mode === 'following' ? 'default' : 'ghost'}
            className="rounded-full"
            onClick={onSwitchToAgora}
          >
            {t('feed.empty.browseAgora')}
          </Button>
        )}
      </div>
    </div>
  );
}

function NoteCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('px-4 py-4 border-b border-border', className)}>
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
