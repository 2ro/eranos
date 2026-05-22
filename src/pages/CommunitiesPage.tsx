import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ChevronDown, ChevronUp, EyeOff, Globe2, HandHeart, Hourglass, PlusCircle, Users } from 'lucide-react';

import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityGrid } from '@/components/discovery/CommunityGrid';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { COOL_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useFeaturedOrganizations } from '@/hooks/useFeaturedOrganizations';
import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { useGlobalDonations } from '@/hooks/useGlobalDonations';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { useToast } from '@/hooks/useToast';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { hasAgoraTag } from '@/lib/agoraNoteTags';
import { formatSatsShort } from '@/lib/formatCampaignAmount';
import type { ParsedCommunity } from '@/lib/communityUtils';

// ─── Page ──────────────────────────────────────────────────────────────────────

export function CommunitiesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const userOrganizations = useUserOrganizations();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Moderator gate. Reuses the campaign moderator pack (Team Soapbox) —
  // see useOrganizationModeration for why the same pack governs both
  // surfaces. The `isMod` boolean drives the visibility of the two
  // collapsible review sections at the bottom of the page; the heavy
  // discovery + moderation queries that power them are themselves
  // mounted INSIDE the moderator-only subtree so non-mod viewers don't
  // pay the cost of fetching 200 orgs and folding labels just to never
  // render anything.
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  useLayoutOptions({
    noMaxWidth: true,
    rightSidebar: null,
    showFAB: false,
  });

  useSeoMeta({
    title: `Organizations | ${config.appName}`,
    description: 'Discover and join organizations on Nostr',
  });

  const handleCreateCommunity = () => {
    if (!user) {
      toast({
        title: 'Log in to create an organization',
        description: 'Creating an organization publishes a Nostr event from your account.',
      });
      return;
    }
    navigate('/communities/new');
  };

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <CommunitiesHero onCreateCommunity={handleCreateCommunity} />

      <div className="max-w-5xl mx-auto space-y-2 sm:space-y-4 pb-8">
        <section className="pt-6">
          <SectionHeader title="My organizations" className="pb-3 sm:px-6" />
          <MyCommunitiesShelf
            userOrganizations={userOrganizations}
            onCreateCommunity={handleCreateCommunity}
          />
        </section>

        <section className="pt-4 pb-8">
          <SectionHeader
            title="Featured organizations"
            className="pb-3 sm:px-6"
          />
          <FeaturedOrganizationsShelf />
        </section>

        {/* Moderator-only review sections: "Needs review" and "Hidden".
            Organizations have a two-axis moderation model (featured /
            hidden — no approval gate), so anything not yet labelled
            simply lives in the public Featured-or-not space. The Needs
            review queue surfaces unlabelled Agora-tagged orgs so
            moderators can pick what to feature or hide. */}
        {isMod && <ModeratorReviewSections />}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Moderator review sections
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders the "Needs review" and "Hidden" rails for moderators only.
 *
 * Organizations don't have an `approved` axis (unlike campaigns) — every
 * Agora-tagged org is publicly visible by default. Moderation reduces to:
 *
 * - **Needs review** — orgs minted through Agora (carry `t:agora`) that
 *   have no featured or hidden label yet. These are candidates for
 *   either lifting into Featured or suppressing with Hidden.
 * - **Hidden** — orgs whose latest hide-axis label is `hidden`.
 *
 * The component owns its own data fetches (discovery pool + moderation
 * rollup) so the page can mount it conditionally on `isMod` and skip
 * both queries entirely for the overwhelmingly common non-moderator
 * case. Mirrors the campaign side's `ModeratorSection` pattern
 * (collapsible, defaults to open when the list is short).
 */
function ModeratorReviewSections() {
  // Wider pull than the public discovery shelf so reviewers see deeper
  // history. Bumping the limit further would just add network cost —
  // anything truly old can be reviewed by visiting it directly.
  const { data: allOrgs, isLoading } = useDiscoverCommunities({ limit: 200 });
  const { data: moderation, isReady } = useOrganizationModeration();

  const needsReviewOrgs = useMemo(() => {
    if (!moderation || !allOrgs) return [] as ParsedCommunity[];
    return allOrgs.filter(
      (org) =>
        // Restrict the review queue to orgs minted through Agora's create
        // flow. Without this gate, every kind 34550 community on the
        // network would appear here — including badge-gated NIP-72
        // communities, music scenes, etc. — none of which Agora moderators
        // should be expected to triage.
        hasAgoraTag(org.tags) &&
        !moderation.featuredCoords.has(org.aTag) &&
        !moderation.hiddenCoords.has(org.aTag),
    );
  }, [moderation, allOrgs]);

  const hiddenOrgs = useMemo(() => {
    if (!moderation || !allOrgs) return [] as ParsedCommunity[];
    return allOrgs.filter((org) => moderation.hiddenCoords.has(org.aTag));
  }, [moderation, allOrgs]);

  const sectionsLoading = isLoading || !isReady;

  return (
    <>
      <ModeratorOrgSection
        icon={<Hourglass className="size-4" />}
        title="Needs review"
        description="Agora organizations that haven't been featured or hidden yet. Lift one into the Featured shelf or suppress it with Hide."
        count={needsReviewOrgs.length}
        orgs={needsReviewOrgs}
        isLoading={sectionsLoading}
        emptyText="Nothing awaiting review."
      />
      <ModeratorOrgSection
        icon={<EyeOff className="size-4" />}
        title="Hidden"
        description="Organizations suppressed from public discovery. Use the kebab menu on a card to unhide."
        count={hiddenOrgs.length}
        orgs={hiddenOrgs}
        isLoading={sectionsLoading}
        emptyText="No organizations are currently hidden."
      />
    </>
  );
}

/**
 * Collapsible moderator-only section listing organizations in a particular
 * moderation state (pending / hidden). Defaults to expanded when the list
 * is short (≤ 6 items), collapsed otherwise — same heuristic as the
 * campaign version.
 */
function ModeratorOrgSection({
  icon,
  title,
  description,
  count,
  orgs,
  isLoading,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  orgs: ParsedCommunity[];
  isLoading: boolean;
  emptyText: string;
}) {
  const [open, setOpen] = useState(count <= 6);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="pt-4 pb-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-end justify-between gap-4 rounded-lg text-left px-4 sm:px-6 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight inline-flex items-center gap-2">
                <span className="text-muted-foreground">{icon}</span>
                {title}
                <span className="text-sm font-medium text-muted-foreground">({count})</span>
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
          {isLoading && orgs.length === 0 ? (
            <CommunityGrid>
              {Array.from({ length: 4 }).map((_, i) => (
                <CommunityMiniCardSkeleton key={i} className="w-full" />
              ))}
            </CommunityGrid>
          ) : orgs.length === 0 ? (
            <div className="px-4 sm:px-6">
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {emptyText}
                </CardContent>
              </Card>
            </div>
          ) : (
            <CommunityGrid>
              {orgs.map((org) => (
                <CommunityMiniCard key={org.aTag} community={org} className="w-full" />
              ))}
            </CommunityGrid>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

interface CommunitiesHeroProps {
  onCreateCommunity: () => void;
}

interface TickerStat {
  id: string;
  value: string;
  label: string;
  icon: React.ReactNode;
}

function CommunitiesHero({ onCreateCommunity }: CommunitiesHeroProps) {
  const { data: featured } = useFeaturedOrganizations();
  const { data: activityByCountry } = useGlobalActivity();
  const { data: donations, isLoading: donationsLoading } = useGlobalDonations();
  const [hueIndex, setHueIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % COOL_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);

  const activeHue = COOL_PALETTE[hueIndex];

  const stats = useMemo<TickerStat[]>(() => {
    const items: TickerStat[] = [];

    if (donations && donations.totalSats > 0) {
      items.push({
        id: 'sats',
        value: formatSatsShort(donations.totalSats),
        label: `raised on-chain across ${donations.campaignCount.toLocaleString()} ${
          donations.campaignCount === 1 ? 'campaign' : 'campaigns'
        }`,
        icon: <HandHeart className="size-5" aria-hidden />,
      });
    }
    if (featured && featured.length > 0) {
      items.push({
        id: 'organizations',
        value: featured.length.toLocaleString(),
        label: `featured ${featured.length === 1 ? 'organization' : 'organizations'} on Nostr`,
        icon: <Users className="size-5" aria-hidden />,
      });
    }
    if (activityByCountry && activityByCountry.size > 0) {
      items.push({
        id: 'countries',
        value: activityByCountry.size.toLocaleString(),
        label: `${activityByCountry.size === 1 ? 'country' : 'countries'} posting today`,
        icon: <Globe2 className="size-5" aria-hidden />,
      });
    }
    return items;
  }, [donations, featured, activityByCountry]);

  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    if (stats.length <= 1) return;
    const id = window.setInterval(() => {
      setTickerIndex((i) => (i + 1) % stats.length);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [stats.length]);

  const currentStat = stats[tickerIndex % Math.max(stats.length, 1)];

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      {/* Rotating photo banner — World Liberty Congress events. Crossfades
          every 7s and pans slowly between cuts. Sits at the bottom of the
          stack so atmosphere, scrims, and content layer above it. */}
      <HeroBanner />

      {/* Cool atmosphere — blue/green hues rotate independently of the
          banner cycle. The explicit `hue` prop overrides the warm
          seed-derived default HeroAtmosphere uses on campaign pages. The
          screen-blend gradients tint the photo without flattening it. */}
      <HeroAtmosphere hue={activeHue} />

      {/* Top scrim so the headline stays legible regardless of which
          photo is currently on top. */}
      <div
        className="absolute inset-x-0 top-0 h-64 sm:h-80 pointer-events-none bg-gradient-to-b from-black/70 via-black/40 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom scrim so the stat pill + CTA stay legible across photos. */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 sm:h-72 pointer-events-none bg-gradient-to-t from-black/70 via-black/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:py-14 min-h-[380px] sm:min-h-[420px] lg:min-h-[460px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white/85 drop-shadow">
            Organize
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            Strength
            <br className="sm:hidden" /> in numbers.
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            Create organizations, gather members, and keep up with what your spaces are doing.
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-background/55 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 px-5 py-3 shadow-lg shadow-teal-500/10"
          aria-live="polite"
        >
          {currentStat ? (
            <div
              key={currentStat.id}
              className="flex items-center justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
            >
              <span className="text-primary shrink-0">{currentStat.icon}</span>
              <span className="text-sm sm:text-base font-semibold tracking-tight">
                {currentStat.value}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                {currentStat.label}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              {donationsLoading ? (
                <>
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Connecting to relays…
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={onCreateCommunity}
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-cyan-100/10 to-emerald-100/10 hover:from-white/20 hover:via-cyan-100/14 hover:to-emerald-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(186_75%_45%/0.45)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(186_75%_45%/0.55)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <PlusCircle className="mr-2" />
            Create an organization
          </Button>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Community shelves
// ═══════════════════════════════════════════════════════════════════════════════

type UserOrganizationsResult = ReturnType<typeof useUserOrganizations>;

function MyCommunitiesShelf({
  userOrganizations,
  onCreateCommunity,
}: {
  userOrganizations: UserOrganizationsResult;
  onCreateCommunity: () => void;
}) {
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="Log in to see your organizations"
        body="Organizations you've founded or moderate will appear here."
        action={<LoginArea className="max-w-60" />}
      />
    );
  }

  return (
    <MyCommunitiesShelfContent
      userOrganizations={userOrganizations}
      onCreateCommunity={onCreateCommunity}
    />
  );
}

function MyCommunitiesShelfContent({
  userOrganizations,
  onCreateCommunity,
}: {
  userOrganizations: UserOrganizationsResult;
  onCreateCommunity: () => void;
}) {
  // "My organizations" = orgs the user founded, moderates, or follows.
  // Sorting is founder first, moderator second, followed-only last, with
  // newest community definition revisions first inside each bucket.
  const { data: organizations, isLoading } = userOrganizations;
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <CommunityGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} className="w-full" />
        ))}
      </CommunityGrid>
    );
  }

  if (!organizations || organizations.length === 0) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="No organizations yet"
        body="Create your own organization to start coordinating campaigns, pledges, and events with your people."
        action={(
          <Button type="button" onClick={onCreateCommunity} className="rounded-full">
            <PlusCircle className="size-4 mr-2" />
            Create an organization
          </Button>
        )}
      />
    );
  }

  const COLLAPSED_COUNT = 4;
  const visible = expanded ? organizations : organizations.slice(0, COLLAPSED_COUNT);
  const canExpand = organizations.length > COLLAPSED_COUNT;

  return (
    <div className="space-y-4">
      <CommunityGrid>
        {visible.map((entry) => (
          <CommunityMiniCard
            key={entry.community.aTag}
            community={entry.community}
            className="w-full"
          />
        ))}
      </CommunityGrid>
      {canExpand && (
        <div className="flex justify-center px-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full text-sm"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4 mr-1.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-4 mr-1.5" />
                Show {organizations.length - COLLAPSED_COUNT} more
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeaturedOrganizationsShelf() {
  const { data: featured, isLoading } = useFeaturedOrganizations();
  const hasFeatured = !!featured && featured.length > 0;

  if (isLoading && !hasFeatured) {
    return (
      <CommunityGrid>
        {Array.from({ length: 8 }).map((_, i) => (
          <CommunityMiniCardSkeleton key={i} className="w-full" />
        ))}
      </CommunityGrid>
    );
  }

  if (!hasFeatured) {
    return (
      <EmptyShelf
        icon={<Users className="size-7 text-primary/70" />}
        title="No featured organizations yet"
        body="Agora moderators feature standout organizations here. Check back soon."
        action={null}
      />
    );
  }

  return (
    <CommunityGrid>
      {featured.map((entry) => (
        <CommunityMiniCard
          key={entry.community.aTag}
          community={entry.community}
          className="w-full"
        />
      ))}
    </CommunityGrid>
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
