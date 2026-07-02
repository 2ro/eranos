import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, EyeOff, Globe2, PlusCircle, Users } from 'lucide-react';

import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { Button } from '@/components/ui/button';
import { CommunityGrid } from '@/components/discovery/CommunityGrid';
import {
  CommunityMiniCard,
  CommunityMiniCardSkeleton,
} from '@/components/discovery/CommunityMiniCard';
import { GroupsDiscoverySection } from '@/components/discovery/GroupsDiscoverySection';
import { ModeratorCollapsibleSection } from '@/components/moderation';
import { COOL_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useFeaturedOrganizations } from '@/hooks/useFeaturedOrganizations';
import { useGlobalActivity } from '@/hooks/useGlobalActivity';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { useToast } from '@/hooks/useToast';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import type { ParsedCommunity } from '@/lib/communityUtils';

/**
 * Dedicated `/groups` page.
 *
 * Thin shell around the shared {@link GroupsDiscoverySection}: hero,
 * optional "My groups" shelf, the unified search-and-discover
 * section, and a moderator-only Hidden collapsible.
 *
 * URL state (`?q=&sort=`) lives inside the section's
 * `useDiscoveryFilters` hook so search results stay shareable. The
 * page only owns the Show-hidden flag and the moderator-only data
 * needed for the Hidden collapsible.
 */
export function CommunitiesPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const userOrganizations = useUserOrganizations();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Moderator gate. Reuses the campaign moderator pack (Team Soapbox) —
  // see useOrganizationModeration for why the same pack governs both
  // surfaces.
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  useSeoMeta({
    title: `${t('groups.list.seoTitle')} | ${config.appName}`,
    description: t('groups.list.seoDescription'),
  });

  const handleCreateCommunity = () => {
    if (!user) {
      toast({
        title: t('groups.list.createGroupLoginTitle'),
        description: t('groups.list.createGroupLoginBody'),
      });
      return;
    }
    navigate('/groups/new');
  };

  const [showHidden, setShowHidden] = useState(false);

  // Moderator-only: fetch the full kind-34550 universe so we can list
  // hidden groups and surface a hidden-count badge on the toolbar.
  // Non-moderators don't need this query — the section drives the
  // public idle/active grids straight from featured + search.
  const { data: allOrgs, isLoading: allOrgsLoading } = useDiscoverCommunities({
    limit: 200,
    enabled: isMod,
  });
  const { data: orgModeration } = useOrganizationModeration();
  const { hiddenGroups, hiddenCount } = useMemo(() => {
    const hiddenCoords = orgModeration?.hiddenCoords ?? new Set<string>();
    const list: ParsedCommunity[] = [];
    for (const org of allOrgs ?? []) {
      if (hiddenCoords.has(org.aTag)) list.push(org);
    }
    return { hiddenGroups: list, hiddenCount: list.length };
  }, [allOrgs, orgModeration]);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <CommunitiesHero onCreateCommunity={handleCreateCommunity} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10 sm:space-y-12 pb-8 pt-10 lg:pt-14">
        <MyCommunitiesShelf userOrganizations={userOrganizations} />

        <GroupsDiscoverySection
          filterPersistence="url"
          showHidden={
            isMod
              ? {
                  value: showHidden,
                  onChange: setShowHidden,
                  count: hiddenCount,
                }
              : undefined
          }
        />

        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('groups.list.hidden')}
            description={t('groups.list.hiddenDesc')}
            count={hiddenGroups.length}
            isLoading={allOrgsLoading}
            emptyText={t('groups.list.hiddenEmpty')}
            skeleton={
              <CommunityGrid>
                {Array.from({ length: 4 }).map((_, i) => (
                  <CommunityMiniCardSkeleton key={i} className="w-full" />
                ))}
              </CommunityGrid>
            }
          >
            <CommunityGrid>
              {hiddenGroups.map((community) => (
                <CommunityMiniCard
                  key={community.aTag}
                  community={community}
                  className="w-full"
                />
              ))}
            </CommunityGrid>
          </ModeratorCollapsibleSection>
        )}
      </div>
    </main>
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
  const { t } = useTranslation();
  const { data: featured } = useFeaturedOrganizations();
  const { data: activityByCountry } = useGlobalActivity();
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

    if (featured && featured.length > 0) {
      items.push({
        id: 'groups',
        value: featured.length.toLocaleString(),
        label: t('groups.list.tickerFeaturedGroups', { count: featured.length }),
        icon: <Users className="size-5" aria-hidden />,
      });
    }
    if (activityByCountry && activityByCountry.size > 0) {
      items.push({
        id: 'countries',
        value: activityByCountry.size.toLocaleString(),
        label: t('groups.list.tickerCountries', { count: activityByCountry.size }),
        icon: <Globe2 className="size-5" aria-hidden />,
      });
    }
    return items;
  }, [featured, activityByCountry, t]);

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
            {t('groups.list.heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {t('groups.list.heroHeading')}
            <br className="sm:hidden" /> {t('groups.list.heroHeadingLine2')}
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {t('groups.list.heroBody')}
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-black/30 backdrop-blur-xl backdrop-saturate-150 border border-white/20 px-5 py-3 shadow-lg shadow-teal-500/10"
          aria-live="polite"
        >
          {currentStat ? (
            <div
              key={currentStat.id}
              className="flex items-center justify-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
            >
              <span className="text-cyan-200 shrink-0 drop-shadow">{currentStat.icon}</span>
              <span className="text-sm sm:text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                {currentStat.value}
              </span>
              <span className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                {currentStat.label}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-white/85 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
                {t('groups.list.connectingRelays')}
              </span>
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
            {t('groups.list.createGroup')}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// "My groups" shelf
// ═══════════════════════════════════════════════════════════════════════════════

type UserOrganizationsResult = ReturnType<typeof useUserOrganizations>;

function MyCommunitiesShelf({
  userOrganizations,
}: {
  userOrganizations: UserOrganizationsResult;
}) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  // "My organizations" = orgs the user founded, moderates, or follows.
  // Sorting is founder first, moderator second, followed-only last,
  // with newest community definition revisions first inside each
  // bucket.
  const { data: organizations } = userOrganizations;
  const [expanded, setExpanded] = useState(false);

  if (!user) return null;
  // Suppress the entire section (header + tagline included) until at
  // least one group is known. Rendering the header while the query is
  // still pending causes a flash when the result resolves to an empty
  // list.
  if (!organizations || organizations.length === 0) return null;

  const COLLAPSED_COUNT = 4;
  const visible = expanded ? organizations : organizations.slice(0, COLLAPSED_COUNT);
  const canExpand = organizations.length > COLLAPSED_COUNT;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t('groups.list.myGroups')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('groups.list.myGroupsTagline')}
        </p>
      </div>
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
          <div className="flex justify-center">
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
                  {t('groups.list.showLess')}
                </>
              ) : (
                <>
                  <ChevronDown className="size-4 mr-1.5" />
                  {t('groups.list.showMore', { count: organizations.length - COLLAPSED_COUNT })}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
