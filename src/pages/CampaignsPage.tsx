import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueries } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { HandHeart, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroGlobe } from '@/components/HeroGlobe';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import {
  CAMPAIGN_KIND,
  parseCampaign,
  type ParsedCampaign,
} from '@/lib/campaign';
import { FEATURED_CAMPAIGN_NADDRS } from '@/lib/featuredCampaigns';
import { searchCountry } from '@/lib/countries';
import { getCoordinates } from '@/lib/coordinates';

/**
 * Decodes a featured-campaign naddr and returns its coordinate. Returns
 * `null` for blank slots, malformed strings, or naddrs pointing at a
 * different kind.
 */
function parseFeaturedNaddr(naddr: string):
  | { pubkey: string; identifier: string; relays?: string[] }
  | null {
  if (!naddr) return null;
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') return null;
    if (decoded.data.kind !== CAMPAIGN_KIND) return null;
    return {
      pubkey: decoded.data.pubkey,
      identifier: decoded.data.identifier,
      relays: decoded.data.relays,
    };
  } catch {
    return null;
  }
}

/** Loads the featured campaigns in parallel. Invalid slots resolve to `null`. */
function useFeaturedCampaigns() {
  const { nostr } = useNostr();

  const coords = useMemo(
    () => FEATURED_CAMPAIGN_NADDRS.map((s) => parseFeaturedNaddr(s)),
    [],
  );

  const results = useQueries({
    queries: coords.map((coord, index) => ({
      queryKey: ['campaign-featured', index, coord?.pubkey ?? '', coord?.identifier ?? ''],
      queryFn: async (c: { signal: AbortSignal }): Promise<ParsedCampaign | null> => {
        if (!coord) return null;
        const events = await nostr.query(
          [
            {
              kinds: [CAMPAIGN_KIND],
              authors: [coord.pubkey],
              '#d': [coord.identifier],
              limit: 5,
            },
          ],
          { signal: c.signal },
        );
        if (events.length === 0) return null;
        const newest = events.reduce((latest, current) =>
          current.created_at > latest.created_at ? current : latest,
        );
        return parseCampaign(newest);
      },
      enabled: !!coord,
      staleTime: 60_000,
    })),
  });

  return {
    campaigns: results.map((r) => r.data ?? null),
    isLoading: results.some((r) => r.isLoading),
  };
}

export function CampaignsPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { campaigns: featured, isLoading: featuredLoading } = useFeaturedCampaigns();
  const { data: allCampaigns, isLoading: listLoading } = useCampaigns({ limit: 60 });

  useSeoMeta({
    title: `Fundraisers | ${config.appName}`,
    description: 'Connecting activists to unstoppable funding.',
  });

  // Exclude featured campaigns from the main list so they don't appear twice.
  // Archived campaigns are already filtered upstream by useCampaigns, but if a
  // featured slot points at one that's since been archived we drop it here too.
  const visibleFeatured = useMemo(
    () => featured.map((c) => (c && !c.archived ? c : null)),
    [featured],
  );
  const featuredCoords = useMemo(
    () => new Set(visibleFeatured.filter(Boolean).map((c) => c!.aTag)),
    [visibleFeatured],
  );
  const userCampaigns = useMemo(
    () => (allCampaigns ?? []).filter((c) => !featuredCoords.has(c.aTag)),
    [allCampaigns, featuredCoords],
  );

  // Geo-locate campaigns for the hero globe. We match the free-form
  // `location` field against ISO 3166-1 names/codes and fall back to the
  // country capital coordinates. Campaigns without a resolvable location
  // simply don't get a marker.
  const globeMarkers = useMemo(() => {
    const out: { key: string; lat: number; lng: number }[] = [];
    const seen = new Set<string>();
    for (const c of allCampaigns ?? []) {
      if (!c.location) continue;
      const match = searchCountry(c.location);
      if (!match) continue;
      const coords = getCoordinates(match.country.code);
      if (!coords) continue;
      // Deduplicate by country so a single popular country doesn't pile
      // dozens of overlapping markers on top of each other.
      if (seen.has(match.country.code)) continue;
      seen.add(match.country.code);
      out.push({ key: c.aTag, lat: coords.latitude, lng: coords.longitude });
    }
    return out;
  }, [allCampaigns]);

  return (
    <main className="min-h-screen pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/15 via-background to-secondary/40">
        {/* Slow-spinning globe sits behind the text. Positioned to the right
            on wider viewports so it doesn't fight the headline for attention,
            and pulled mostly off-screen on mobile so it still reads as an
            ambient accent without crowding the copy. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-[-30%] sm:right-[-20%] lg:right-[-8%] flex items-center justify-end opacity-60 sm:opacity-70"
          aria-hidden="true"
        >
          <HeroGlobe
            markers={globeMarkers}
            className="aspect-square w-[520px] sm:w-[600px] lg:w-[680px] max-w-none"
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-20">
          <div className="max-w-3xl space-y-5">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              Connecting activists to unstoppable funding.
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
              Raise Bitcoin directly from supporters around the world. Every donation settles
              straight to your campaign's beneficiaries, with no middlemen, no chargebacks, and no
              platform holding your funds.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" asChild className="rounded-full">
                <Link to="/campaigns/new">
                  <PlusCircle className="size-4 mr-2" />
                  Start a campaign
                </Link>
              </Button>
              {!user && (
                <Button variant="outline" size="lg" asChild className="rounded-full">
                  <a href="#campaigns">Explore campaigns</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12" id="campaigns">
        {/* Featured */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Featured</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Hand-picked campaigns from the Agora team.
              </p>
            </div>
          </div>

          <FeaturedRow campaigns={visibleFeatured} isLoading={featuredLoading} />
        </section>

        {/* User-submitted */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">All campaigns</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Community-submitted fundraisers from across Nostr.
              </p>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-2" />
                Start a campaign
              </Link>
            </Button>
          </div>

          {listLoading ? (
            <CampaignGridSkeleton />
          ) : userCampaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {userCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Renders the two featured slots, gracefully handling empty placeholders. */
function FeaturedRow({
  campaigns,
  isLoading,
}: {
  campaigns: (ParsedCampaign | null)[];
  isLoading: boolean;
}) {
  // Filter out empty slots — if a slot's naddr is blank we just hide it rather
  // than show a broken card.
  const items = campaigns.map((c, i) => ({ campaign: c, index: i }));
  const hasAnyFeatured = items.some((it) => it.campaign !== null);

  if (isLoading && !hasAnyFeatured) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <CampaignCardSkeleton variant="featured" />
        <CampaignCardSkeleton variant="featured" />
      </div>
    );
  }

  if (!hasAnyFeatured) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center space-y-2">
          <HandHeart className="size-8 text-muted-foreground/60 mx-auto" />
          <p className="text-muted-foreground max-w-md mx-auto">
            Featured campaigns will appear here once the team has selected them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {items.map(({ campaign }) =>
        campaign ? (
          <CampaignCard key={campaign.aTag} campaign={campaign} variant="featured" />
        ) : null,
      )}
    </div>
  );
}

function CampaignGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <CampaignCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 px-8 text-center space-y-4">
        <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Be the first to start a fundraiser on Agora. Tell your story, choose your
            beneficiaries, and share the link.
          </p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <PlusCircle className="size-4 mr-2" />
            Start a campaign
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default CampaignsPage;
