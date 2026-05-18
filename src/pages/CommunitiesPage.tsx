import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { Loader2, PlusCircle, Search, Sparkles, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useInView } from 'react-intersection-observer';

import { CreateCommunityDialog } from '@/components/CreateCommunityDialog';
import { FeedEmptyState } from '@/components/FeedEmptyState';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroGlobe, type GlobeMarkerKind } from '@/components/HeroGlobe';
import { LoginArea } from '@/components/auth/LoginArea';
import { MembersOnlyToggle } from '@/components/MembersOnlyToggle';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityModerationContext, type CommunityModerationContextValue } from '@/contexts/CommunityModerationContext';
import { HorizontalScroll } from '@/components/discovery/HorizontalScroll';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { COMMUNITY_DEFINITION_KIND, EMPTY_MODERATION } from '@/lib/communityUtils';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCommunityActivityFeed } from '@/hooks/useCommunityActivityFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useMembersOnlyFilter } from '@/hooks/useMembersOnlyFilter';
import { useMyCommunities } from '@/hooks/useMyCommunities';
import { useToast } from '@/hooks/useToast';

// ─── Skeletons ─────────────────────────────────────────────────────────────────

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useLayoutOptions({
    noMaxWidth: true,
    rightSidebar: null,
    showFAB: false,
  });

  useSeoMeta({
    title: `Communities | ${config.appName}`,
    description: 'Discover and join flat communities on Nostr',
  });

  const handleCreateCommunity = () => {
    if (!user) {
      toast({
        title: 'Log in to create a community',
        description: 'Community creation publishes a Nostr event from your account.',
      });
      return;
    }
    setCreateDialogOpen(true);
  };

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <CommunitiesHero onCreateCommunity={handleCreateCommunity} />

      <div className="max-w-5xl mx-auto space-y-2 sm:space-y-4">
        <section className="pt-6">
          <SectionHeader title="My communities" className="pb-3 sm:px-6" />
          <MyCommunitiesShelf onCreateCommunity={handleCreateCommunity} />
        </section>

        <section className="pt-4">
          <SectionHeader
            title="Discover communities"
            seeAllLabel="Search"
            onSeeAll={() => navigate('/search?tab=communities')}
            className="pb-3 sm:px-6"
          />
          <DiscoverCommunitiesShelf />
        </section>

        <section id="community-activity" className="pt-4 pb-8">
          <div className="max-w-2xl mx-auto">
            <div className="px-4 sm:px-6 mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Voices from everywhere
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  New community posts, goals, actions, and definition updates from the spaces you belong to.
                </p>
              </div>
              {user && <MembersOnlyToggle className="shrink-0" />}
            </div>

            <ActivitiesFeed
              onRefresh={() =>
                queryClient.invalidateQueries({
                  queryKey: ['community-activity-feed'],
                  exact: false,
                })
              }
            />
          </div>
        </section>
      </div>

      <CreateCommunityDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

interface CommunitiesHeroProps {
  onCreateCommunity: () => void;
}

interface GlobeMarker {
  key: string;
  lat: number;
  lng: number;
  label: string;
  kind: GlobeMarkerKind;
}

function CommunitiesHero({ onCreateCommunity }: CommunitiesHeroProps) {
  const { data: communities } = useDiscoverCommunities({ limit: 24 });
  const [hueIndex, setHueIndex] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % HOPE_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);

  const activeHue = HOPE_PALETTE[hueIndex];
  const markers = useMemo<GlobeMarker[]>(() => {
    const scatter: Array<{ lat: number; lng: number }> = [
      { lat: 40.7, lng: -74.0 },
      { lat: -23.5, lng: -46.6 },
      { lat: 51.5, lng: -0.1 },
      { lat: -1.3, lng: 36.8 },
      { lat: 35.7, lng: 139.7 },
      { lat: 28.6, lng: 77.2 },
      { lat: -33.9, lng: 151.2 },
      { lat: 19.4, lng: -99.1 },
    ];

    return (communities ?? []).slice(0, scatter.length).map((community, index) => ({
      key: community.aTag,
      lat: scatter[index].lat,
      lng: scatter[index].lng,
      label: community.name,
      kind: 'community',
    }));
  }, [communities]);

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      <HeroAtmosphere seed={`communities-${activeHue.name}`} />

      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="pointer-events-auto opacity-90">
          <HeroGlobe
            markers={markers}
            hue={activeHue}
            className="aspect-square max-w-none drop-shadow-2xl"
            style={{ width: 'clamp(440px, 62dvw, 720px)' }}
          />
        </div>
      </div>

      <div
        className="absolute inset-x-0 top-0 h-72 sm:h-80 pointer-events-none bg-gradient-to-b from-black/55 via-black/25 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 min-h-[560px] sm:min-h-[640px] lg:min-h-[680px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white/80 drop-shadow">
            Organize
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            Strength
            <br className="sm:hidden" /> in numbers.
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            Create communities, gather members, and keep up with what your spaces are doing.
          </p>
        </div>

        <div className="flex-1 min-h-[180px] sm:min-h-[220px]" aria-hidden="true" />

        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-background/55 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
            <span className="text-primary shrink-0">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <span className="text-sm sm:text-base font-semibold tracking-tight">
              Sovereign
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
              community organization
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={onCreateCommunity}
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(24_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(24_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <PlusCircle className="mr-2" />
            Create a community
          </Button>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Community shelves
// ═══════════════════════════════════════════════════════════════════════════════

function MyCommunitiesShelf({ onCreateCommunity }: { onCreateCommunity: () => void }) {
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="Log in to see your communities"
        body="Founded, joined, and followed communities will appear here."
        action={<LoginArea className="max-w-60" />}
      />
    );
  }

  return <MyCommunitiesShelfContent onCreateCommunity={onCreateCommunity} />;
}

function MyCommunitiesShelfContent({ onCreateCommunity }: { onCreateCommunity: () => void }) {
  const { data: myCommunities, isLoading } = useMyCommunities();

  if (isLoading) {
    return (
      <HorizontalScroll className="sm:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} />
        ))}
      </HorizontalScroll>
    );
  }

  if (!myCommunities || myCommunities.length === 0) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="No communities yet"
        body="Create your own community or discover a space your people are already building."
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={onCreateCommunity} className="rounded-full">
              <PlusCircle className="size-4 mr-2" />
              Create a community
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/search?tab=communities">
                <Search className="size-4 mr-2" />
                Search communities
              </Link>
            </Button>
          </div>
        )}
      />
    );
  }

  return (
    <HorizontalScroll className="sm:px-6">
      {myCommunities.slice(0, 12).map((entry) => (
        <CommunityMiniCard key={entry.community.aTag} community={entry.community} />
      ))}
    </HorizontalScroll>
  );
}

function DiscoverCommunitiesShelf() {
  const { data: communities, isLoading } = useDiscoverCommunities({ limit: 18 });
  const shelfCommunities = useMemo(() => (communities ?? []).slice(0, 12), [communities]);

  if (isLoading && shelfCommunities.length === 0) {
    return (
      <HorizontalScroll className="sm:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} />
        ))}
      </HorizontalScroll>
    );
  }

  if (shelfCommunities.length === 0) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="No communities discovered yet"
        body="Communities are flat, badge-gated spaces on Nostr. Found one and invite your people."
        action={(
          <Button asChild className="rounded-full">
            <Link to="/search?tab=communities">Search communities</Link>
          </Button>
        )}
      />
    );
  }

  return (
    <HorizontalScroll className="sm:px-6">
      {shelfCommunities.map((community) => (
        <CommunityMiniCard key={community.aTag} community={community} />
      ))}
    </HorizontalScroll>
  );
}

function EmptyShelf({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="px-4 sm:px-6">
      <Card className="border-dashed">
        <CardContent className="py-10 px-6 text-center space-y-3 flex flex-col items-center">
          <div className="p-3 rounded-full bg-primary/10">{icon}</div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
          </div>
          {action}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Activities feed
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract the community a-tag from an event (uppercase A for NIP-22, lowercase a with 34550: prefix for goals). */
function getCommunityATag(event: NostrEvent): string | undefined {
  return event.tags.find(([n]) => n === 'A')?.[1]
    ?? event.tags.find(([n, v]) => n === 'a' && v?.startsWith('34550:'))?.[1];
}

function ActivitiesFeed({ onRefresh }: { onRefresh: () => Promise<void> }) {
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
      <Card className="border-dashed mx-4 sm:mx-6">
        <CardContent className="py-12 px-8 text-center space-y-4 flex flex-col items-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Users className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h3 className="text-xl font-bold">Community activity</h3>
            <p className="text-muted-foreground text-sm">
              Log in to see activity from your communities.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </CardContent>
      </Card>
    );
  }

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <>
        {isLoading ? (
          <div className="border-t border-border/60 divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <NoteCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedEvents && displayedEvents.length > 0 ? (
          <div className="border-t border-border/60 divide-y divide-border/60">
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
          <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Users className="size-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h2 className="text-xl font-bold">No activity yet</h2>
              <p className="text-muted-foreground text-sm">
                Discover communities to join via the Search page, or create your own with the button above.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button asChild className="rounded-full">
                <Link to="/search?tab=communities">
                  <Search className="size-4 mr-2" />
                  Search communities
                </Link>
              </Button>
            </div>
          </div>
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
