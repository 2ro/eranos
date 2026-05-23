import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowRight, ChevronDown, EyeOff, HandHeart, Hourglass, PlusCircle, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { HeroLightningMap } from '@/components/HeroLightningMap';
import { cn } from '@/lib/utils';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { type ParsedCampaign } from '@/lib/campaign';

/** Cap on how many featured campaigns we render in the home-page row. */
const MAX_FEATURED = 4;

export function CampaignsPage() {
  useLayoutOptions({ noMaxWidth: true });

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

  return (
    <main className="min-h-screen pb-16">
      {/* Hero.

          Dark, brand-driven, type-led. Three layers:
            1. Near-black backdrop (`bg-[hsl(220_25%_6%)]`) — the canvas
               every other element sits on. No campaign photo, no random
               hue cycling: the hero looks the same on every visit, so
               quality doesn't depend on which campaign is featured.
            2. HeroLightningMap — decorative dark world map with curated
               glowing brand-orange arcs and pulsing city nodes. Pure SVG,
               negligible render cost, animations honor reduced-motion.
            3. Headline column on the left, lifted by a left-edge gradient
               inside HeroLightningMap so type stays readable without any
               text-shadow at all. */}
      <section className="relative overflow-hidden border-b border-border bg-[hsl(220_25%_6%)] text-white">
        <HeroLightningMap />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 min-h-[440px] sm:min-h-[480px] lg:min-h-[520px] flex flex-col justify-center">
          <div className="space-y-6 max-w-2xl">
            <h1
              className="font-display italic text-6xl sm:text-7xl lg:text-8xl font-normal tracking-wide leading-none uppercase"
              style={{
                // Bebas Neue only ships at weight 400. Paint a stroke the
                // same color as the fill to fatten the letterforms without
                // the fuzz a synthetic-bold transform would produce.
                WebkitTextStroke: '0.022em currentColor',
              }}
            >
              Connecting activists to
              {/* "unstoppable" gets a solid brand-orange highlighter
                  block on its own line. The negative left margin
                  (`-ml-1.5`) pulls the box's left edge back by exactly
                  the box's own horizontal padding so the U sits flush
                  with the column's left edge instead of being inset by
                  the highlighter's padding. */}
              <br />
              {/* Asymmetric padding: zero on the left so "unstoppable"'s
                  U sits flush with the column edge (matching the row
                  above), but extra padding on the right so the orange
                  box extends past the word's trailing edge as a
                  deliberate visual flourish. The inner text is then
                  nudged slightly leftward (negative left margin on the
                  inner element) so the U optically aligns with the
                  "C" in "Connecting" — Bebas Neue's italic skew shifts
                  the visual left edge of the U rightward of its
                  geometric box. */}
              <span className="inline-block w-fit pl-0 pr-3 pt-1 pb-0 -mt-1 -mb-3 bg-primary text-white leading-[0.8] align-baseline">
                <span className="-ml-1 inline-block">unstoppable</span>
              </span>{' '}
              funding.
            </h1>
            <p className="text-base sm:text-lg text-white/80 max-w-xl">
              Raise Bitcoin directly from supporters around the world. Every donation
              settles straight to your wallet, with no middlemen, no
              chargebacks, and no platform holding your funds.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {/* Primary CTA — solid brand-orange pill. The dark hero gives
                  the brand color the spotlight without competing with it. */}
              <Button
                size="lg"
                asChild
                className="rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px] motion-safe:transition-colors"
              >
                <Link to="/campaigns/new">
                  <PlusCircle className="mr-2" />
                  Start a campaign
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="rounded-full h-12 px-6 text-base border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white hover:border-white/50 [&_svg]:size-[18px]"
              >
                <Link to="/help">
                  How it works
                  <ArrowRight className="ml-2" />
                </Link>
              </Button>
              {!user && (
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="rounded-full h-12 px-6 text-base border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white hover:border-white/50"
                >
                  <a href="#campaigns">Explore campaigns</a>
                </Button>
              )}
            </div>
          </div>
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
