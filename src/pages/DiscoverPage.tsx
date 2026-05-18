import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Globe2, HandHeart, Loader2, Users } from 'lucide-react';

import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useDiscoverFeed } from '@/hooks/useDiscoverFeed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { NoteCard } from '@/components/NoteCard';

import { DiscoverHero } from '@/components/discovery/DiscoverHero';
import { CountryPulseStrip } from '@/components/discovery/CountryPulseStrip';
import {
  CommunityMiniCard,
  CommunityMiniCardSkeleton,
} from '@/components/discovery/CommunityMiniCard';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { HorizontalScroll } from '@/components/discovery/HorizontalScroll';

import { CAMPAIGN_KIND, parseCampaign } from '@/lib/campaign';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * `/discover` — the flamboyant public square. Threads together the three
 * surfaces that the rest of the app keeps siloed: campaigns (`/`),
 * communities (`/communities`), and country posts (`/world`,
 * `/i/iso3166:XX`). The aesthetic is borrowed from the campaigns hero
 * but reframed so no single campaign is the protagonist — the globe is.
 *
 * Page composition, top to bottom:
 *
 *  1. {@link DiscoverHero} — spinning globe with three marker layers
 *     (campaigns, communities, country activity), a rotating ticker of
 *     immutable network-wide stats, and two CTAs.
 *  2. {@link CountryPulseStrip} — horizontal strip of country flag chips
 *     ordered by trailing-window activity. Hover lifts, click opens
 *     `/i/iso3166:XX`.
 *  3. **Help raise hope** — horizontal `CampaignCard` shelf. See-all
 *     links to `/`, the funding storefront.
 *  4. **Find your people** — horizontal `CommunityMiniCard` shelf.
 *     See-all links to `/communities`.
 *  5. **Voices from everywhere** — the {@link useDiscoverFeed} infinite
 *     timeline, mixing new campaigns, country posts, community
 *     comments, and Agora actions. Each row uses the kind-appropriate
 *     card (`CampaignCard` for kind 30223, `NoteCard` for everything
 *     else) so the feed itself becomes a tour of the network.
 */
export function DiscoverPage() {
  const { config } = useAppContext();
  const navigate = useNavigate();

  // The hero already publishes a vibrant globe + headline — we don't
  // want a redundant FAB hovering over it on mobile, so showFAB stays
  // off here. The TopNav "Start a campaign" pill + the in-hero CTA
  // cover composition.
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  useSeoMeta({
    title: `Discover | ${config.appName}`,
    description:
      'Campaigns, communities, and conversations from every corner of the globe. Backed by Bitcoin, broadcast on Nostr.',
  });

  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns({ limit: 24 });
  const { data: communities, isLoading: communitiesLoading } = useDiscoverCommunities({
    limit: 18,
  });

  // Featured shelf: take the first 12 non-archived campaigns ordered by
  // recency. `useCampaigns` already filters archives by default.
  const shelfCampaigns = useMemo(() => (campaigns ?? []).slice(0, 12), [campaigns]);
  const shelfCommunities = useMemo(() => (communities ?? []).slice(0, 12), [communities]);

  return (
    <main className="min-h-screen pb-16">
      <DiscoverHero />

      {/* Country pulse strip — sits in its own quiet band so it reads as
          a continuation of the hero's "the world is here" thesis rather
          than the first shelf. The horizontal scroll bleeds off the edge
          deliberately, telegraphing that there's more if you swipe. */}
      <section className="border-b border-border/60 bg-background/60 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 sm:px-6 mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
              Where the world is showing up
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Country activity from the trusted stats network. Tap a flag to
              read what's being said there.
            </p>
          </div>
          <CountryPulseStrip />
        </div>
      </section>

      <div className="max-w-7xl mx-auto space-y-2 sm:space-y-4">
        {/* Campaigns shelf — "Help raise hope." */}
        <section className="pt-6">
          <SectionHeader
            title="Help raise hope"
            seeAllLabel="All campaigns"
            onSeeAll={() => navigate('/')}
            className="pb-3 sm:px-6"
          />
          {campaignsLoading && shelfCampaigns.length === 0 ? (
            <HorizontalScroll className="sm:px-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-72 shrink-0">
                  <CampaignCardSkeleton />
                </div>
              ))}
            </HorizontalScroll>
          ) : shelfCampaigns.length > 0 ? (
            <HorizontalScroll className="sm:px-6">
              {shelfCampaigns.map((campaign) => (
                <div key={campaign.aTag} className="w-72 shrink-0">
                  <CampaignCard campaign={campaign} />
                </div>
              ))}
            </HorizontalScroll>
          ) : (
            <EmptyShelf
              icon={<HandHeart className="size-7 text-primary/70" />}
              title="No live campaigns yet"
              body="Be the first to start a fundraiser. Tell your story, choose your beneficiaries, and share the link."
              ctaLabel="Start a campaign"
              ctaTo="/campaigns/new"
            />
          )}
        </section>

        {/* Communities shelf — "Find your people." */}
        <section className="pt-4">
          <SectionHeader
            title="Find your people"
            seeAllLabel="All communities"
            onSeeAll={() => navigate('/communities')}
            className="pb-3 sm:px-6"
          />
          {communitiesLoading && shelfCommunities.length === 0 ? (
            <HorizontalScroll className="sm:px-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <CommunityMiniCardSkeleton key={i} />
              ))}
            </HorizontalScroll>
          ) : shelfCommunities.length > 0 ? (
            <HorizontalScroll className="sm:px-6">
              {shelfCommunities.map((community) => (
                <CommunityMiniCard key={community.aTag} community={community} />
              ))}
            </HorizontalScroll>
          ) : (
            <EmptyShelf
              icon={<Users className="size-7 text-primary/70" />}
              title="No communities discovered yet"
              body="Communities are flat, badge-gated spaces on Nostr. Found one and invite your people."
              ctaLabel="Browse communities"
              ctaTo="/communities"
            />
          )}
        </section>

        {/* Mixed feed — "Voices from everywhere." */}
        <section className="pt-4 pb-8">
          <div className="px-4 sm:px-6 mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Voices from everywhere
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                New campaigns, posts tagged to a country, comments inside
                communities, and on-the-ground actions — one timeline, sorted
                by what just happened.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex shrink-0">
              <Link to="/world">
                <Globe2 className="size-4 mr-1.5" />
                Open the world
              </Link>
            </Button>
          </div>

          <DiscoverFeed />
        </section>
      </div>
    </main>
  );
}

// ─── Mixed feed ──────────────────────────────────────────────────────────

/**
 * Renders the {@link useDiscoverFeed} stream. Each event uses the
 * kind-appropriate card so a campaign reveal doesn't look like a generic
 * "Kind 30223" placeholder.
 */
function DiscoverFeed() {
  const { events, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, pageCount } =
    useDiscoverFeed(true);

  const { scrollRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    pageCount,
  });

  if (isLoading && events.length === 0) {
    return (
      <div className="border-t border-border/60 divide-y divide-border/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <FeedRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="border-dashed mx-4 sm:mx-6">
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-md mx-auto">
            Nothing fresh from your relays just yet. Check your relay
            connections, or come back in a moment — the network is always
            moving.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="border-t border-border/60 divide-y divide-border/60">
        {events.map((event) => (
          <DiscoverFeedRow key={event.id} event={event} />
        ))}
      </div>
      {hasNextPage ? (
        <div
          ref={scrollRef}
          className="flex items-center justify-center py-8 text-muted-foreground"
        >
          {isFetchingNextPage && (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-muted-foreground">
          You've reached the end. The world keeps moving — check back soon.
        </div>
      )}
    </>
  );
}

/**
 * Single row inside the Discover feed. Campaign events (kind 30223) get
 * the full `CampaignCard` treatment so their banner and progress show;
 * everything else routes through `NoteCard`, which already handles
 * kind 1111 comments, kind 36639 actions, and the long tail.
 */
function DiscoverFeedRow({ event }: { event: NostrEvent }) {
  if (event.kind === CAMPAIGN_KIND) {
    const campaign = parseCampaign(event);
    if (!campaign || campaign.archived) return null;
    return (
      <div className="p-4 sm:p-5">
        <CampaignCard campaign={campaign} />
      </div>
    );
  }
  return <NoteCard event={event} />;
}

/** Inline skeleton row used while the first page of the mixed feed loads. */
function FeedRowSkeleton() {
  return (
    <div className="px-4 py-3">
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
    </div>
  );
}

// ─── Shared empty shelf ──────────────────────────────────────────────────

function EmptyShelf({
  icon,
  title,
  body,
  ctaLabel,
  ctaTo,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel: string;
  ctaTo: string;
  className?: string;
}) {
  return (
    <div className={cn('px-4 sm:px-6', className)}>
      <Card className="border-dashed">
        <CardContent className="py-10 px-6 text-center space-y-3 flex flex-col items-center">
          <div className="p-3 rounded-full bg-primary/10">{icon}</div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {body}
            </p>
          </div>
          <Button asChild className="rounded-full mt-1">
            <Link to={ctaTo}>{ctaLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default DiscoverPage;
