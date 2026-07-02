import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, EyeOff, HandHeart, PlusCircle } from 'lucide-react';


import { Button } from '@/components/ui/button';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { CampaignsDiscoverySection } from '@/components/discovery/CampaignsDiscoverySection';
import { CampaignListsStrip } from '@/components/campaign-lists/CampaignListsStrip';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { ModeratorCollapsibleSection } from '@/components/moderation';
import { useAllCampaigns, toQuerySort } from '@/hooks/useAllCampaigns';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseSort } from '@/hooks/useDiscoveryFilters';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * Lists every campaign found on relays.
 *
 * The page itself is a thin shell: hero, the moderator-curated topic-list
 * strip ({@link CampaignListsStrip}), the shared
 * {@link CampaignsDiscoverySection} (which owns search / sort / country
 * + idle / active grids), and a moderator-only Hidden collapsible.
 *
 * URL state (`?q=&sort=&country=`) lives inside the section's
 * `useDiscoveryFilters` hook so search results stay shareable. The
 * page reads the same params independently to compute the Hidden
 * collapsible's contents — TanStack Query dedupes the underlying
 * `useAllCampaigns` call, so there's no extra network round-trip.
 *
 * **Censorship-resistance:** the section's Show-hidden toggle is
 * available to every viewer here, not just moderators. The campaigns
 * page is the canonical browseable index, and the moderation labels
 * sit on public relays anyway, so anyone can flip the toggle to see
 * what mods have suppressed. The Hidden collapsible below the
 * section is still mod-only because it's a review workflow for
 * moderators (one-click hide/unhide affordances), not a discovery
 * surface.
 */
export function AllCampaignsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  const [searchParams] = useSearchParams();
  const sort = parseSort(searchParams.get('sort'));
  const urlQuery = searchParams.get('q') ?? '';
  const urlCountry = searchParams.get('country') ?? undefined;

  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const [showHidden, setShowHidden] = useState(false);

  // Mirror the section's underlying query so the Hidden collapsible
  // can list the exact set of hidden items matching the current
  // search / sort / country. TanStack dedupes; this is a cache read
  // on the same key the section uses.
  const { data: campaigns } = useAllCampaigns({
    sort: toQuerySort(sort),
    search: urlQuery,
    countryCode: urlCountry,
    limit: 200,
  });

  const { data: moderation } = useCampaignModeration();

  const { hiddenCount, hiddenCampaigns } = useMemo(() => {
    const all = campaigns ?? [];
    const hiddenCoords = moderation?.hiddenCoords ?? new Set<string>();
    let count = 0;
    const list: ParsedCampaign[] = [];
    for (const c of all) {
      if (hiddenCoords.has(c.aTag)) {
        count += 1;
        list.push(c);
      }
    }
    return { hiddenCount: count, hiddenCampaigns: list };
  }, [campaigns, moderation]);

  useSeoMeta({
    title: `${t('campaigns.all.seoTitle')} | ${config.appName}`,
    description: t('campaigns.all.description'),
  });

  return (
    <main className="min-h-screen pb-16">
      <AllCampaignsHero campaignCount={campaigns?.length ?? 0} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
        {/* Curated topic-list strip. Moderators can create/edit/reorder
            lists here; non-moderators see only the published lists (or
            nothing, if none exist yet). Replaces the previous "Your
            campaigns" shelf — campaign authors can still find their own
            campaigns via their profile page. */}
        <CampaignListsStrip />

        <CampaignsDiscoverySection
          filterPersistence="url"
          showHidden={{
            value: showHidden,
            onChange: setShowHidden,
            count: hiddenCount,
          }}
        />

        {/* Moderator-only: every hidden campaign on the network matching
            the current section filters. The section drops hidden items
            from its main grid unless the toolbar's Show-hidden switch
            is on; this collapsible always exposes them so a moderator
            can act on hidden coords without flipping the visibility
            mode. */}
        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('campaigns.home.hidden')}
            description={t('campaigns.home.hiddenDesc')}
            count={hiddenCampaigns.length}
            isLoading={!moderation}
            emptyText={t('campaigns.home.hiddenEmpty')}
            skeleton={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CampaignCardSkeleton key={i} />
                ))}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {hiddenCampaigns.map((campaign) => (
                <CampaignCard key={campaign.aTag} campaign={campaign} />
              ))}
            </div>
          </ModeratorCollapsibleSection>
        )}
      </div>
    </main>
  );
}

export default AllCampaignsPage;

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

interface AllCampaignsHeroProps {
  /** Total campaigns currently loaded — fuels the live stat pill. */
  campaignCount: number;
}

/**
 * Photo-led hero for the All-Campaigns page. Mirrors the Pledges /
 * Communities hero recipe (rotating banner + atmospheric tint + scrims
 * + overlay copy + glassy CTA) so the three discovery pages share the
 * same visual shape. The campaign home (`/campaigns`) keeps its bespoke
 * lightning-map hero as the brand-leading entry point; this surface
 * gets the photo-led treatment because it's the actual browseable index.
 */
function AllCampaignsHero({ campaignCount }: AllCampaignsHeroProps) {
  const { t } = useTranslation();
  // Cycle through warm hues on the same cadence as the banner so the
  // whole hero feels like one coordinated moment instead of two
  // unrelated rotations.
  const [hueIndex, setHueIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % HOPE_PALETTE.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, []);
  const activeHue = HOPE_PALETTE[hueIndex];

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      {/* Rotating photo banner — uses the default WLC photo set so this
          page matches the Communities hero's photographic vocabulary. */}
      <HeroBanner />

      {/* Warm atmosphere — campaigns-side hue, same as the Pledges hero. */}
      <HeroAtmosphere hue={activeHue} />

      {/* Top scrim so the headline stays legible across every photo. */}
      <div
        className="absolute inset-x-0 top-0 h-64 sm:h-80 pointer-events-none bg-gradient-to-b from-black/70 via-black/40 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom scrim so the stat pill + CTA stay legible. */}
      <div
        className="absolute inset-x-0 bottom-0 h-56 sm:h-72 pointer-events-none bg-gradient-to-t from-black/70 via-black/35 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:py-14 min-h-[380px] sm:min-h-[420px] lg:min-h-[460px] flex flex-col items-center text-center">
        <div className="relative space-y-3 max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white/85 drop-shadow">
            {t('campaigns.all.heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {t('campaigns.all.heroHeading')}
            <br className="sm:hidden" /> {t('campaigns.all.heroHeadingLine2')}
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {t('campaigns.all.heroBody')}
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        {/* Live stat pill — campaigns-on-network count. */}
        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-black/30 backdrop-blur-xl backdrop-saturate-150 border border-white/20 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-3">
            <HandHeart
              className="size-5 text-amber-200 shrink-0 drop-shadow"
              aria-hidden
            />
            <span className="text-sm sm:text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {campaignCount.toLocaleString()}
            </span>
            <span className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {t('campaigns.all.campaignsCount', { count: campaignCount })}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(40_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(40_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <StartCampaignLink>
              <PlusCircle className="mr-2" />
              {t('campaigns.all.startCampaign')}
            </StartCampaignLink>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className={cn(
              'rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-white/5 hover:bg-white/10 backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'motion-safe:transition-colors motion-safe:duration-200',
            )}
          >
            <Link to="/verify">
              <BadgeCheck className="mr-2" />
              {t('campaigns.all.verifyCampaigns')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
