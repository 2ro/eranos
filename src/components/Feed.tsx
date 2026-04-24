import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { ComposeBox } from '@/components/ComposeBox';
import { LandingHero } from '@/components/LandingHero';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MapPin } from 'lucide-react';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useFeed } from '@/hooks/useFeed';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import { useInterests } from '@/hooks/useInterests';
import { useMuteList } from '@/hooks/useMuteList';
import { useTabFeed } from '@/hooks/useProfileFeed';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import { useWorldFeed } from '@/hooks/useWorldFeed';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { TabButton } from '@/components/TabButton';
import { useNavHidden } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';
import type { SavedFeed } from '@/contexts/AppContext';

type CoreFeedTab = 'follows' | 'global' | 'communities' | 'world';
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

export function Feed({ kinds, tagFilters, header, hideCompose, emptyMessage, feedId = 'home' }: FeedProps = {}) {
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const { savedFeeds } = useSavedFeeds();
  const { hashtags } = useInterests();
  const { hashtags: geotags } = useInterests('g');
  const navHidden = useNavHidden();

  // Tab settings from localStorage
  const showGlobalFeed = (() => {
    const stored = localStorage.getItem('ditto:showGlobalFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const showWorldFeed = (() => {
    const stored = localStorage.getItem('agora:showWorldFeed');
    return stored !== null ? stored === 'true' : true;
  })();

  const showCommunityFeed = (() => {
    const stored = localStorage.getItem('ditto:showCommunityFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const communityLabel = (() => {
    try {
      const stored = localStorage.getItem('ditto:community');
      if (stored) {
        const community = JSON.parse(stored);
        return community.label || 'Community';
      }
    } catch {
      // Fall through
    }
    return 'Community';
  })();

  const [rawActiveTab, handleSetActiveTab] = useFeedTab<FeedTab>(feedId);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  // Kind-specific pages only support Follows + Global. Clamp any other
  // persisted tab (e.g. 'world', 'communities') back to the appropriate default.
  // Logged-out users on the home feed land on 'world' to see global content.
  const activeTab: FeedTab = (() => {
    if (!kinds) {
      // Migrate legacy 'ditto' tab to 'world'
      if (rawActiveTab === 'ditto') return 'world';
      return rawActiveTab;
    }
    if (rawActiveTab === 'global') return 'global';
    if (rawActiveTab === 'follows' && user) return 'follows';
    return user ? 'follows' : 'global';
  })();

  // Is the active tab a saved feed?
  const activeSavedFeed = useMemo(
    () => savedFeeds.find((f) => f.id === activeTab) ?? null,
    [savedFeeds, activeTab],
  );

  // Is the active tab a hashtag interest?
  const activeHashtag = activeTab.startsWith('hashtag:') ? activeTab.slice(8) : null;

  // Is the active tab a geotag interest?
  const activeGeotag = activeTab.startsWith('geotag:') ? activeTab.slice(7) : null;

  // When logged out (and not on a kind-specific page), show the World feed.
  const useWorldForLoggedOut = !user && !kinds;

  // When the World tab is active (logged in), show the world feed.
  // Disabled on kind-specific pages — the World tab is not shown there.
  const useWorldTab = activeTab === 'world' && !kinds;

  // Is the world feed active?
  const isWorldActive = useWorldForLoggedOut || !!useWorldTab;

  // Standard feed query (used when logged in, or on kind-specific pages, or core tabs)
  const isCoreFeedTab = activeTab === 'follows' || activeTab === 'global' || activeTab === 'communities' || activeTab === 'world';
  type UseFeedTab = 'follows' | 'global' | 'communities';
  const feedTabForQuery: UseFeedTab =
    activeTab === 'follows' || activeTab === 'global' || activeTab === 'communities'
      ? (activeTab as UseFeedTab)
      : 'global';
  const feedQuery = useFeed(
    isCoreFeedTab && !isWorldActive ? feedTabForQuery : 'global',
    (kinds || tagFilters) ? { kinds, tagFilters } : undefined,
  );

  // World feed: all country-tagged events with diversity cap + live streaming.
  const worldFeed = useWorldFeed(isWorldActive);

  // For non-world tabs, use the standard feed query
  const queryKey = useMemo(
    () => isWorldActive ? ['world-feed'] : ['feed', activeTab],
    [isWorldActive, activeTab],
  );

  const handleRefresh = usePageRefresh(queryKey);
  const handleWorldRefresh = useCallback(async () => {
    worldFeed.flushStreamBuffer();
    await handleRefresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [worldFeed.flushStreamBuffer, handleRefresh]);

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage: fetchNextPageStandard,
    hasNextPage: hasNextPageStandard,
    isFetchingNextPage: isFetchingNextPageStandard,
  } = feedQuery;

  // Unify pagination interface
  const fetchNextPage = isWorldActive ? worldFeed.fetchNextPage : fetchNextPageStandard;
  const hasNextPage = isWorldActive ? worldFeed.hasNextPage : hasNextPageStandard;
  const isFetchingNextPage = isWorldActive ? worldFeed.isFetchingNextPage : isFetchingNextPageStandard;

  // Auto-fetch page 2 as soon as page 1 arrives for smoother scrolling
  useEffect(() => {
    if (!isWorldActive && hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [isWorldActive, hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

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
    if (isWorldActive) {
      // World feed: events are already filtered/deduped by useWorldFeed
      return worldFeed.events.map((event): FeedItem => ({ event, sortTimestamp: event.created_at }));
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
  }, [isWorldActive, worldFeed.events, rawData?.pages, muteItems]);

  // Show skeletons while loading.
  const showSkeleton = isWorldActive
    ? worldFeed.isLoading
    : (isPending || (isLoading && !rawData));

  // Kind-specific pages (e.g. Development, WebXDC) only show Follows + Global tabs.
  // Extra tabs (Ditto, Community, saved feeds, hashtags) are only for the home feed.
  const isKindSpecificPage = !!kinds;
  const showSavedFeedTabs = user && !isKindSpecificPage && !tagFilters;

  return (
    <main className="flex-1 min-w-0 min-h-dvh">
      {/* CTA (logged out, main feed only) */}
      {!user && !kinds && (
        <LandingHero
          onLoginClick={() => setLoginDialogOpen(true)}
          onSignupClick={startSignup}
        />
      )}

      {!hideCompose && <ComposeBox compact />}

      {header}

      {/* Tabs (logged in) */}
      {user && (
        <SubHeaderBar>
          <TabButton label="Follows" active={activeTab === 'follows'} onClick={() => handleSetActiveTab('follows')} />
          {!isKindSpecificPage && showWorldFeed && (
            <TabButton label="World" active={activeTab === 'world'} onClick={() => handleSetActiveTab('world')} />
          )}
          {!isKindSpecificPage && showCommunityFeed && (
            <TabButton label={communityLabel} active={activeTab === 'communities'} onClick={() => handleSetActiveTab('communities')} />
          )}
          {(isKindSpecificPage || showGlobalFeed) && (
            <TabButton label="Global" active={activeTab === 'global'} onClick={() => handleSetActiveTab('global')} />
          )}
          {showSavedFeedTabs && savedFeeds.map((feed) => (
            <TabButton
              key={feed.id}
              label={feed.label}
              active={activeTab === feed.id}
              onClick={() => handleSetActiveTab(feed.id)}
            />
          ))}
          {showSavedFeedTabs && hashtags.map((tag) => (
            <TabButton
              key={`hashtag:${tag}`}
              label={`#${tag}`}
              active={activeTab === `hashtag:${tag}`}
              onClick={() => handleSetActiveTab(`hashtag:${tag}`)}
            />
          ))}
          {showSavedFeedTabs && geotags.map((tag) => (
            <TabButton
              key={`geotag:${tag}`}
              label={tag}
              active={activeTab === `geotag:${tag}`}
              onClick={() => handleSetActiveTab(`geotag:${tag}`)}
            >
              <span className="flex items-center justify-center gap-1">
                <MapPin className="size-3.5" />
                {tag}
              </span>
            </TabButton>
          ))}
        </SubHeaderBar>
      )}

      {/* Feed content — saved feed tab gets its own stream */}
      {user && <div style={{ height: ARC_OVERHANG_PX }} />}
      {activeHashtag ? (
        <HashtagFeedContent tag={activeHashtag} />
      ) : activeGeotag ? (
        <GeotagFeedContent tag={activeGeotag} />
      ) : activeSavedFeed ? (
        <SavedFeedContent feed={activeSavedFeed} />
      ) : (
        <PullToRefresh onRefresh={isWorldActive ? handleWorldRefresh : handleRefresh}>
          {/* "X new posts" pill for World tab */}
          {isWorldActive && worldFeed.newPostCount > 0 && (
            <div
              className={cn(
                'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
                'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
                navHidden && 'max-sidebar:opacity-0 max-sidebar:pointer-events-none',
              )}
              style={{ marginBottom: '-3rem' }}
            >
              <button
                onClick={() => {
                  worldFeed.flushStreamBuffer();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="pointer-events-auto px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
              >
                {worldFeed.newPostCount} new post{worldFeed.newPostCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}
          {showSkeleton ? (
            <div className="divide-y divide-border">
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
                  highlight={isWorldActive && worldFeed.flushedIds.has(item.event.id)}
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
                    : activeTab === 'world'
                      ? 'No world posts yet. Check back soon for global activity.'
                      : 'No posts found. Check your relay connections or come back soon.'
                )
              }
              showDiscover={!emptyMessage && activeTab === 'follows'}
              onSwitchToGlobal={
                activeTab === 'follows' && showGlobalFeed
                  ? () => handleSetActiveTab('global')
                  : undefined
              }
            />
          )}
        </PullToRefresh>
      )}

      {/* Login/Signup dialogs (only needed on main feed) */}
      {!kinds && (
        <LoginDialog
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignupClick={startSignup}
        />
      )}
    </main>
  );
}

/** Renders a saved search feed using useTabFeed (TanStack Query cached, infinite scroll). */
function SavedFeedContent({ feed }: { feed: SavedFeed }) {
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();

  // Resolve variable placeholders ($follows etc.) the same way profile tabs do
  const { filter: resolvedFilter, isLoading: isResolving } = useResolveTabFilter(
    feed.filter,
    feed.vars ?? [],
    user?.pubkey ?? '',
  );

  // Augment the resolved filter with protocol:nostr (NIP-50 Ditto extension)
  // to match the behavior of the core feeds and ensure latest native Nostr
  // posts are returned.
  const augmentedFilter = useMemo(() => {
    if (!resolvedFilter) return null;
    const existing = resolvedFilter.search ?? '';
    const search = existing.includes('protocol:nostr')
      ? existing
      : existing
        ? `${existing} protocol:nostr`
        : 'protocol:nostr';
    return { ...resolvedFilter, search };
  }, [resolvedFilter]);

  const {
    data: rawData,
    isLoading: isFeedLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTabFeed(augmentedFilter, `saved-${feed.id}`, !isResolving);

  const isLoading = isResolving || isFeedLoading;

  // Prefix key -- usePageRefresh does prefix matching, so this invalidates
  // the full ['tab-feed', tabKey, kindsKey, authorsKey, searchKey] used by useTabFeed.
  const queryKey = useMemo(
    () => ['tab-feed', `saved-${feed.id}`],
    [feed.id],
  );
  const handleRefresh = usePageRefresh(queryKey);

  // Infinite scroll: fetch next page when sentinel is in view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten pages, deduplicate, and filter muted content
  const feedItems = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return rawData.pages
      .flatMap((page) => page.items)
      .filter((item) => {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        if (shouldHideFeedEvent(item.event)) return false;
        if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) return false;
        return true;
      });
  }, [rawData?.pages, muteItems]);

  if (isLoading && feedItems.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found for "${feed.label}". Try adjusting your relay connections or check back later.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {feedItems.map((item) => (
          <NoteCard
            key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
            event={item.event}
            repostedBy={item.repostedBy}
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
        {!hasNextPage && <div ref={scrollRef} className="py-2" />}
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific hashtag. */
function HashtagFeedContent({ tag }: { tag: string }) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { feedSettings } = useFeedSettings();
  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  const queryKey = useMemo(() => ['hashtag-feed', tag, kindsKey], [tag, kindsKey]);
  const handleRefresh = usePageRefresh(queryKey);

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      return ditto.query(
        [{ kinds, '#t': [tag.toLowerCase()], limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
  });

  const filteredEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    if (muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  if (isLoading && filteredEvents.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found with #${tag}.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
    </PullToRefresh>
  );
}

/** Renders a feed of posts tagged with a specific geohash. */
function GeotagFeedContent({ tag }: { tag: string }) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { feedSettings } = useFeedSettings();
  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  const queryKey = useMemo(() => ['geotag-feed', tag, kindsKey], [tag, kindsKey]);
  const handleRefresh = usePageRefresh(queryKey);

  const { data: events, isLoading } = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const ditto = nostr.group(DITTO_RELAYS);
      const filter = { kinds, limit: 40 } as Record<string, unknown>;
      filter['#g'] = [tag];
      return ditto.query([filter as Parameters<typeof ditto.query>[0][number]], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
    },
  });

  const filteredEvents = useMemo((): NostrEvent[] => {
    if (!events) return [];
    if (muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  if (isLoading && filteredEvents.length === 0) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <NoteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <FeedEmptyState message={`No posts found near ${tag}.`} />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>
        {filteredEvents.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
    </PullToRefresh>
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
