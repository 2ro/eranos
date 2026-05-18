import { useEffect, useMemo, useState } from 'react';
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
import { HeroCampaignSpotlight } from '@/components/HeroCampaignSpotlight';
import { CampaignHeroBackground } from '@/components/CampaignHeroBackground';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { hopeHueFor } from '@/lib/hopePalette';
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

  // Build the spotlight pool: every campaign that has both a parseable
  // location AND would make sense to feature. Featured campaigns come first
  // (in their hand-picked order), then everything else, newest first.
  //
  // Each entry resolves a country code from the free-form `location` field
  // and pulls the country's capital coordinates from `getCoordinates`. The
  // globe uses these to place a heart marker; the spotlight card uses the
  // full `campaign` object.
  const spotlightables = useMemo(() => {
    type Entry = {
      key: string;
      campaign: ParsedCampaign;
      lat: number;
      lng: number;
    };
    const out: Entry[] = [];
    const seenAtag = new Set<string>();
    const seenCountry = new Set<string>();

    const add = (c: ParsedCampaign) => {
      if (seenAtag.has(c.aTag)) return;
      if (!c.location) return;
      const match = searchCountry(c.location);
      if (!match) return;
      const coords = getCoordinates(match.country.code);
      if (!coords) return;
      // Deduplicate by country so a single popular country doesn't pile
      // dozens of overlapping markers on top of each other. We keep the
      // first one we see, which — given the iteration order below — means
      // featured wins, then newest.
      if (seenCountry.has(match.country.code)) return;
      seenAtag.add(c.aTag);
      seenCountry.add(match.country.code);
      out.push({ key: c.aTag, campaign: c, lat: coords.latitude, lng: coords.longitude });
    };

    for (const c of visibleFeatured) {
      if (c) add(c);
    }
    for (const c of allCampaigns ?? []) add(c);
    return out;
  }, [visibleFeatured, allCampaigns]);

  const globeMarkers = useMemo(
    () =>
      spotlightables.map((s) => ({
        key: s.key,
        lat: s.lat,
        lng: s.lng,
        label: s.campaign.title,
      })),
    [spotlightables],
  );

  // Selection lives here so the globe and the spotlight card stay in sync.
  // `null` means "auto-cycle through the spotlightables"; clicking a marker
  // pins the selection until the user clicks a different one.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // A separate cursor advances when no marker is selected, so cycling
  // continues to drive the spotlight even while the user is reading.
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    if (selectedKey !== null) return;
    if (spotlightables.length <= 1) return;
    const id = window.setInterval(() => {
      setCycleIndex((i) => (i + 1) % spotlightables.length);
    }, 6_000);
    return () => window.clearInterval(id);
  }, [selectedKey, spotlightables.length]);

  // Resolve the spotlight to actually display.
  const spotlightCampaign = useMemo(() => {
    if (selectedKey) {
      return spotlightables.find((s) => s.key === selectedKey)?.campaign ?? null;
    }
    if (spotlightables.length === 0) return null;
    return spotlightables[cycleIndex % spotlightables.length].campaign;
  }, [selectedKey, cycleIndex, spotlightables]);

  // The key the globe should highlight matches whatever the card shows.
  const highlightedMarkerKey = useMemo(() => {
    if (selectedKey) return selectedKey;
    if (spotlightables.length === 0) return null;
    return spotlightables[cycleIndex % spotlightables.length].key;
  }, [selectedKey, cycleIndex, spotlightables]);

  // Active "hopeful" hue keyed to the spotlit campaign. Both the
  // surrounding atmosphere and the globe consume this so the entire
  // hero shifts color together as campaigns cycle.
  const activeHue = useMemo(
    () => hopeHueFor(spotlightCampaign?.aTag),
    [spotlightCampaign?.aTag],
  );

  return (
    <main className="min-h-screen pb-16">
      {/* Hero.

          Layered, back-to-front:
            1. CampaignHeroBackground — full-bleed crossfading banner image
               from the currently-spotlit campaign, with a warm tint + film
               grain so headlines stay legible.
            2. HeroGlobe — large slow-spinning globe anchored to the right,
               heart markers click-select campaigns.
            3. Headline column — title + paragraph + CTAs, top-left.
            4. HeroCampaignSpotlight — title + summary + "View campaign"
               button for the active campaign, bottom-right.

          Inspired by the Treasures HeroGallery pattern: the photo IS the
          background, everything else floats over it. */}
      <section className="relative overflow-hidden border-b border-border bg-secondary/40">
        <CampaignHeroBackground imageUrl={spotlightCampaign?.image} />

        {/* Per-campaign hopeful color atmosphere. Sits on top of the
            photo and below the globe so its mix-blend-mode: screen layers
            can warm the darks back up — the photo ends up tinted toward
            the active hue without losing headline contrast. */}
        <HeroAtmosphere seed={spotlightCampaign?.aTag} />

        {/* Globe — center sits a little to the left of the TopNav account
            switcher anchor so a larger slice of the sphere reads inside
            the hero rather than off the right edge. */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6">
            <div className="absolute inset-y-0 right-4 sm:right-6 flex items-center">
              <div className="pointer-events-auto translate-x-[40%] sm:translate-x-[38%] lg:translate-x-[38%] opacity-90">
                <HeroGlobe
                  markers={globeMarkers}
                  selectedKey={highlightedMarkerKey}
                  onMarkerClick={(key) =>
                    // Toggle off when the user re-clicks the active
                    // marker, restoring the auto-cycle.
                    setSelectedKey((prev) => (prev === key ? null : key))
                  }
                  hue={activeHue}
                  // Fluid sizing scaled to dynamic viewport width (dvw),
                  // clamped so it never shrinks below phone-comfortable
                  // nor balloons on ultra-wide monitors.
                  className="aspect-square max-w-none drop-shadow-2xl"
                  style={{ width: 'clamp(360px, 46dvw, 820px)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Readability scrim. Layered *above* the globe so the headline
            area stays legible even when a slice of the sphere sits behind
            it. Only shown on tablet and below — at lg+ the globe sits
            outside the headline column, so the scrim would just mute the
            photo for no benefit. */}
        <div
          className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/55 via-black/30 to-transparent lg:hidden"
          aria-hidden="true"
        />

        {/* Foreground content — headline + CTAs at the top, spotlight info
            at the bottom. Shares the `max-w-7xl mx-auto` container with the
            globe so everything aligns to the same left/right axis. */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-20 min-h-[560px] sm:min-h-[600px] lg:min-h-[640px] flex flex-col">
          <div className="relative space-y-5 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] drop-shadow-sm">
              Connecting activists to unstoppable funding.
            </h1>
            <p className="text-base sm:text-lg text-foreground/80 max-w-2xl">
              Raise Bitcoin directly from supporters around the world. Every donation settles
              straight to your campaign's beneficiaries, with no middlemen, no chargebacks, and no
              platform holding your funds.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" asChild className="rounded-full shadow-lg">
                <Link to="/campaigns/new">
                  <PlusCircle className="size-4 mr-2" />
                  Start a campaign
                </Link>
              </Button>
              {!user && (
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="rounded-full bg-background/70 backdrop-blur"
                >
                  <a href="#campaigns">Explore campaigns</a>
                </Button>
              )}
            </div>
          </div>

          {(spotlightCampaign || (featuredLoading && spotlightables.length === 0)) && (
            <div className="relative mt-auto pt-10 max-w-sm">
              <HeroCampaignSpotlight
                campaign={spotlightCampaign}
                isLoading={featuredLoading && spotlightables.length === 0}
              />
            </div>
          )}
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
