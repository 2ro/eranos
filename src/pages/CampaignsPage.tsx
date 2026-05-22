import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ChevronDown, EyeOff, HandHeart, Hourglass, PlusCircle, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroGlobe } from '@/components/HeroGlobe';
import { HeroCampaignSpotlight } from '@/components/HeroCampaignSpotlight';
import { CampaignHeroBackground } from '@/components/CampaignHeroBackground';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { hopeHueFor } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { type ParsedCampaign } from '@/lib/campaign';

import { getCoordinates } from '@/lib/coordinates';

/** Cap on how many featured campaigns we render in the home-page row. */
const MAX_FEATURED = 4;

export function CampaignsPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { config } = useAppContext();
  const { user } = useCurrentUser();

  // Moderator pack + per-campaign label state. The label query is gated on
  // moderators arriving, so during a cold load we render skeleton cards
  // until both resolve. Avoids flashing the full unmoderated grid.
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();
  const { data: moderation, isReady: moderationReady } = useCampaignModeration();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  // Featured slot list — derived from moderation labels. Sorted newest-
  // featured first, capped at MAX_FEATURED, and hidden coords removed so a
  // featured-then-hidden campaign disappears from the row.
  const featuredCoords = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.featuredCoords)
      .filter((c) => !moderation.hiddenCoords.has(c))
      .sort((a, b) => (moderation.featuredOrder.get(b) ?? 0) - (moderation.featuredOrder.get(a) ?? 0))
      .slice(0, MAX_FEATURED);
  }, [moderation]);

  const { data: featuredCampaigns, isLoading: featuredLoading } = useCampaigns(
    moderationReady && featuredCoords.length > 0
      ? { coordinates: featuredCoords, limit: MAX_FEATURED }
      : { coordinates: [], limit: MAX_FEATURED },
  );

  // Sort the fetched featured campaigns to match the newest-label order.
  // `useCampaigns` returns them in network order; we want the row to match
  // the moderation-label ordering.
  const orderedFeatured = useMemo<ParsedCampaign[]>(() => {
    if (!moderation || !featuredCampaigns) return [];
    const order = moderation.featuredOrder;
    return [...featuredCampaigns]
      .filter((c) => featuredCoords.includes(c.aTag))
      .sort((a, b) => (order.get(b.aTag) ?? 0) - (order.get(a.aTag) ?? 0))
      .slice(0, MAX_FEATURED);
  }, [featuredCampaigns, featuredCoords, moderation]);

  const featuredCoordSet = useMemo(() => new Set(featuredCoords), [featuredCoords]);

  // The community grid is the approved-and-not-hidden set, minus featured
  // (which gets its own row above). We fetch by coordinate (one filter per
  // author, bundled in one REQ) to avoid pulling the entire kind-30223
  // stream when only a handful are surfaced.
  const approvedNotHidden = useMemo(() => {
    if (!moderation) return [] as string[];
    return Array.from(moderation.approvedCoords).filter((c) => !moderation.hiddenCoords.has(c));
  }, [moderation]);

  // Pass `coordinates: []` only once moderation is ready and the allowlist is
  // empty; before that, pass `undefined` so the query is enabled but doesn't
  // discriminate. We block render of the grid on `moderationReady` anyway.
  const { data: approvedCampaigns, isLoading: approvedLoading } = useCampaigns(
    moderationReady
      ? { coordinates: approvedNotHidden, limit: 60 }
      : { limit: 60 },
  );

  // For moderators we also pull the *entire* recent kind-30223 stream so we
  // can populate the Pending and Hidden sections. This second query only
  // runs for mods and reuses TanStack's cache on identical keys.
  const { data: allCampaignsForMods, isLoading: allLoading } = useCampaigns({
    limit: 200,
  });

  // For non-mod creators: their own campaigns regardless of moderation state,
  // so the "Your campaigns" shelf can explain why theirs aren't on the home
  // page. Skip the query entirely for mods and logged-out viewers.
  const { data: ownCampaigns } = useCampaigns({
    authors: user && !isMod ? [user.pubkey] : undefined,
    limit: 30,
  });

  useSeoMeta({
    title: `Fundraisers | ${config.appName}`,
    description: 'Connecting activists to unstoppable funding.',
  });

  // Main grid excludes featured (they're shown above) and excludes any
  // hidden coord just in case approvedCoords/hiddenCoords overlap (a mod can
  // approve, another can hide — hide wins).
  const mainGridCampaigns = useMemo(
    () =>
      (approvedCampaigns ?? []).filter(
        (c) => !featuredCoordSet.has(c.aTag) && !moderation?.hiddenCoords.has(c.aTag),
      ),
    [approvedCampaigns, featuredCoordSet, moderation],
  );

  // Pending (mod-only): campaigns that exist on the network but lack an
  // approval AND aren't hidden.
  const pendingCampaigns = useMemo(() => {
    if (!isMod || !moderation) return [] as ParsedCampaign[];
    return (allCampaignsForMods ?? []).filter(
      (c) => !moderation.approvedCoords.has(c.aTag) && !moderation.hiddenCoords.has(c.aTag),
    );
  }, [isMod, moderation, allCampaignsForMods]);

  // Hidden (mod-only): campaigns where the latest hide-axis label is `hidden`.
  const hiddenCampaigns = useMemo(() => {
    if (!isMod || !moderation) return [] as ParsedCampaign[];
    return (allCampaignsForMods ?? []).filter((c) => moderation.hiddenCoords.has(c.aTag));
  }, [isMod, moderation, allCampaignsForMods]);

  // "Your campaigns" (non-mod creators only): the logged-in user's own
  // campaigns that aren't yet surfaced — i.e. not approved, or hidden.
  // We exclude already-approved ones so we don't double-render the same
  // card in two sections; if their own campaign is in the main grid they
  // already know it's live.
  const yourPendingCampaigns = useMemo(() => {
    if (isMod || !user || !moderation) return [] as ParsedCampaign[];
    return (ownCampaigns ?? []).filter(
      (c) => !moderation.approvedCoords.has(c.aTag) || moderation.hiddenCoords.has(c.aTag),
    );
  }, [isMod, user, moderation, ownCampaigns]);

  // Build the spotlight pool from the featured campaigns only. A featured
  // campaign without a resolvable country is silently dropped — the globe
  // needs coordinates to pin it, and the banner cycles in lockstep with
  // the globe so the two stay in sync.
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
      const countryCode = c.countryCode;
      if (!countryCode) return;
      const coords = getCoordinates(countryCode);
      if (!coords) return;
      // Deduplicate by country so two featured campaigns in the same
      // country don't pile overlapping markers on the globe. Featured
      // order is preserved — the first one wins.
      if (seenCountry.has(countryCode)) return;
      seenAtag.add(c.aTag);
      seenCountry.add(countryCode);
      out.push({ key: c.aTag, campaign: c, lat: coords.latitude, lng: coords.longitude });
    };

    for (const c of orderedFeatured) {
      add(c);
    }
    return out;
  }, [orderedFeatured]);

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
        <CampaignHeroBackground imageUrl={spotlightCampaign?.banner} />

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
              <div className="pointer-events-auto hero-globe-mask translate-x-[40%] sm:translate-x-[38%] lg:translate-x-[38%] opacity-90">
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
                  style={{ width: 'clamp(620px, 58dvw, 820px)' }}
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
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-20 min-h-[560px] sm:min-h-[600px] lg:min-h-[640px] flex flex-col text-white">
          <div className="relative space-y-5 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] hero-text-shadow">
              Connecting activists to unstoppable funding.
            </h1>
            <p className="text-base sm:text-lg text-white/85 max-w-2xl hero-text-shadow-soft">
              Raise Bitcoin directly from supporters around the world. Every donation settles
              straight to your campaign's beneficiaries, with no middlemen, no chargebacks, and no
              platform holding your funds.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {/* Primary CTA — clean translucent glass pill with a hint
                  of warmth bleeding through. The hopefulness comes from
                  the photo + atmosphere underneath plus a soft warm
                  shadow, not from added gloss. */}
              <Button
                size="lg"
                asChild
                className={cn(
                  // A touch larger than the default lg button — enough
                  // weight to read as primary, not enough to feel chunky.
                  'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
                  // Subtle warm-tinted glass body, kept more transparent.
                  // Hover lifts the tint a hair without changing the pill
                  // character — no shadow bloom, no halo.
                  'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
                  'backdrop-blur-xl backdrop-saturate-150',
                  'border border-white/25 hover:border-white/35',
                  // Single hair-thin inner highlight + a warm-tinted
                  // realistic drop shadow that ties the button to the
                  // hopeful palette. Hover only nudges the shadow.
                  'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(24_85%_45%/0.4)]',
                  'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(24_85%_45%/0.5)]',
                  'motion-safe:transition-colors motion-safe:duration-200',
                )}
              >
                <Link to="/campaigns/new">
                  <PlusCircle className="mr-2" />
                  Start a campaign
                </Link>
              </Button>
              {!user && (
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="rounded-full bg-background/70 backdrop-blur h-12 px-6 text-base text-foreground"
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
        {/* Featured — only rendered when at least one campaign is featured
            (or the featured query is still loading on first paint). */}
        {(featuredCoords.length > 0 || (featuredLoading && !moderationReady)) && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Featured</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Hand-picked campaigns from the Agora team.
                </p>
              </div>
            </div>

            <FeaturedRow
              campaigns={orderedFeatured}
              isLoading={featuredLoading || !moderationReady}
              expectedCount={featuredCoords.length}
            />
          </section>
        )}

        {/* Community Campaigns — approved-and-not-hidden, minus featured.
            Skeletons until the moderator pack + label state both resolve,
            so we never flash an unmoderated grid. */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Community Campaigns</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Help fund the changes worth making.
              </p>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-2" />
                Start a campaign
              </Link>
            </Button>
          </div>

          {moderatorsLoading || !moderationReady || approvedLoading ? (
            <CampaignGridSkeleton />
          ) : mainGridCampaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {mainGridCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          )}

          {/* "Browse all campaigns" link — reveals the page that includes
              campaigns not yet moderated (and, optionally, hidden ones). */}
          <div className="pt-2 text-center sm:text-left">
            <Button asChild variant="ghost" size="sm">
              <Link to="/campaigns/all">Browse all campaigns →</Link>
            </Button>
          </div>
        </section>

        {/* Moderator-only: campaigns awaiting an approval decision. */}
        {isMod && (
          <ModeratorSection
            icon={<Hourglass className="size-4" />}
            title="Pending approval"
            description="Campaigns on the network that no Team Soapbox moderator has approved or hidden yet."
            count={pendingCampaigns.length}
            campaigns={pendingCampaigns}
            isLoading={allLoading}
            emptyText="Nothing awaiting review."
          />
        )}

        {/* Moderator-only: campaigns currently hidden. */}
        {isMod && (
          <ModeratorSection
            icon={<EyeOff className="size-4" />}
            title="Hidden"
            description="Campaigns suppressed from the public homepage. Use the kebab menu on a card to unhide."
            count={hiddenCampaigns.length}
            campaigns={hiddenCampaigns}
            isLoading={allLoading}
            emptyText="No campaigns are currently hidden."
          />
        )}

        {/* Non-mod creator: surface their own not-yet-approved campaigns
            so they understand the campaign is live on the network but
            isn't on the homepage yet. */}
        {!isMod && user && yourPendingCampaigns.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2">
                <ShieldCheck className="size-6 text-primary/70" />
                Your campaigns
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Your campaigns are live on Nostr and donations work via the
                campaign link. They appear on the homepage once a Team
                Soapbox moderator approves them.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {yourPendingCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/**
 * Collapsible moderator-only section listing campaigns in a particular
 * moderation state (pending / hidden). Defaults to expanded when the list
 * is short, collapsed otherwise.
 */
function ModeratorSection({
  icon,
  title,
  description,
  count,
  campaigns,
  isLoading,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  campaigns: ParsedCampaign[];
  isLoading: boolean;
  emptyText: string;
}) {
  const [open, setOpen] = useState(count <= 6);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="space-y-5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-end justify-between gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2">
                <span className="text-muted-foreground">{icon}</span>
                {title}
                <span className="text-base font-medium text-muted-foreground">({count})</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
            </div>
            <ChevronDown
              className={cn(
                'size-5 text-muted-foreground motion-safe:transition-transform shrink-0',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {isLoading && campaigns.length === 0 ? (
            <CampaignGridSkeleton />
          ) : campaigns.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {emptyText}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/**
 * Returns the grid class string for an adaptive featured row.
 * Mobile stays 1-column; desktop expands to 2/3/4 columns based on count.
 * Tailwind JIT requires literal class strings, so we spell each variant
 * out rather than building the class name dynamically.
 */
function featuredGridClass(n: number): string {
  if (n <= 1) return 'grid grid-cols-1 gap-5';
  if (n === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-5';
  if (n === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
}

/** Renders the featured row with an adaptive column count. */
function FeaturedRow({
  campaigns,
  isLoading,
  expectedCount,
}: {
  campaigns: ParsedCampaign[];
  isLoading: boolean;
  /** How many featured slots we expect once data resolves. Drives the skeleton column count. */
  expectedCount: number;
}) {
  if (isLoading && campaigns.length === 0) {
    const skeletonCount = Math.max(1, Math.min(MAX_FEATURED, expectedCount || 2));
    return (
      <div className={featuredGridClass(skeletonCount)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <CampaignCardSkeleton key={i} variant={skeletonCount === 1 ? 'featured' : 'compact'} />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    // Defensive — the parent guards on `featuredCoords.length > 0`, but if
    // a hidden-after-featured race leaves us with no campaigns to render,
    // collapse silently rather than show an empty card.
    return null;
  }

  // 1 featured campaign gets the hero `variant="featured"` treatment;
  // 2-4 use the regular compact card sized to the dynamic grid.
  const useFeaturedVariant = campaigns.length === 1;

  return (
    <div className={featuredGridClass(campaigns.length)}>
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.aTag}
          campaign={campaign}
          variant={useFeaturedVariant ? 'featured' : 'compact'}
        />
      ))}
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
