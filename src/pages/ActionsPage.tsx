import { useEffect, useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Megaphone,
  PlusCircle,
} from 'lucide-react';

import { ActionShareMenu } from '@/components/ActionShareMenu';
import { PledgesDiscoverySection } from '@/components/discovery/PledgesDiscoverySection';
import { useActions, type Action } from '@/hooks/useActions';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';
import { getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_ACTION_COVERS } from '@/lib/defaultActionCovers';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { getPledgeCoord } from '@/lib/pledges';
import { cn } from '@/lib/utils';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import {
  ModerationOverlay,
  ModeratorCollapsibleSection,
} from '@/components/moderation';
import { PledgeCard, PledgeCardSkeleton } from '@/components/PledgeCard';
import { Button } from '@/components/ui/button';

/**
 * Dedicated `/pledges` page.
 *
 * Thin shell around the shared {@link PledgesDiscoverySection}:
 * hero, optional "My pledges" shelf, the unified search-and-discover
 * section, and a moderator-only Hidden collapsible.
 *
 * URL state (`?q=&sort=&country=`) lives inside the section's
 * `useDiscoveryFilters` hook so search results stay shareable. The
 * page reads `?country=` independently to thread it into the
 * create-pledge href so "Create pledge" preserves the active country
 * filter into the form.
 */
export default function ActionsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const navigate = useNavigate();

  // Mirror the section's `?country=` so the create-pledge href can
  // carry it forward into the form pre-fill (matches the old modal's
  // `countryCode` prop behaviour). The section's filters hook is the
  // source of truth; we only read here.
  const [searchParams] = useSearchParams();
  const selectedCountry = searchParams.get('country') ?? undefined;

  // Moderator gate. Reuses the campaign moderator pack (Team Soapbox)
  // — the pledge moderation namespace rides the same signer set as
  // the campaign and group surfaces.
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const [showHidden, setShowHidden] = useState(false);

  const { data: myPledges } = useActions({
    authors: user ? [user.pubkey] : undefined,
    limit: 100,
    enabled: !!user,
  });
  // Moderator-only feed of every pledge on the network — drives the
  // Hidden collapsible and the toolbar's hidden-count badge.
  const { data: allPledgesForMods, isLoading: allPledgesLoading } = useActions({
    limit: 300,
    enabled: isMod,
  });
  const { data: pledgeModeration, isReady: pledgeModerationReady } =
    usePledgeModeration();

  const hiddenPledges = useMemo<Action[]>(() => {
    if (!isMod || !pledgeModerationReady) return [];
    return (allPledgesForMods ?? []).filter((pledge) =>
      pledgeModeration.hiddenCoords.has(getPledgeCoord(pledge)),
    );
  }, [allPledgesForMods, isMod, pledgeModeration, pledgeModerationReady]);

  // Route entry points for "Create pledge" all pass the currently
  // selected country via ?country= so the dedicated page can
  // pre-fill it, matching the old modal's `countryCode` prop.
  const createActionHref = selectedCountry
    ? `/pledges/new?country=${encodeURIComponent(selectedCountry)}`
    : '/pledges/new';

  const selectedCountryName = selectedCountry
    ? getGeoDisplayName(selectedCountry)
    : t('pledges.list.global');

  useSeoMeta({
    title: `${
      selectedCountry
        ? t('pledges.list.seoTitleWithCountry', { country: selectedCountryName })
        : t('pledges.list.seoTitle')
    } | ${config.appName}`,
    description: t('pledges.list.seoDescription'),
  });

  const DEFAULT_VISIBLE = 4;
  const [showAllMine, setShowAllMine] = useState(false);
  const visibleMine = showAllMine
    ? (myPledges ?? [])
    : (myPledges ?? []).slice(0, DEFAULT_VISIBLE);

  return (
    <main className="pb-16 sidebar:pb-0">
      <ActionsHero
        actionCount={allPledgesForMods?.length ?? myPledges?.length ?? 0}
        canCreate={!!user}
        onCreateAction={() => navigate(createActionHref)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12">
        {user && myPledges && myPledges.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {t('pledges.list.myPledges')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('pledges.list.myPledgesTagline')}
              </p>
            </div>
            <ActionSection
              items={visibleMine}
              total={myPledges.length}
              visible={DEFAULT_VISIBLE}
              showAll={showAllMine}
              onToggle={() => setShowAllMine(!showAllMine)}
            />
          </section>
        )}

        <PledgesDiscoverySection
          filterPersistence="url"
          showHidden={
            isMod
              ? {
                  value: showHidden,
                  onChange: setShowHidden,
                  count: hiddenPledges.length,
                }
              : undefined
          }
        />

        {isMod && (
          <ModeratorCollapsibleSection
            icon={<EyeOff className="size-4" />}
            title={t('pledges.list.hidden')}
            description={t('pledges.list.hiddenDesc')}
            count={hiddenPledges.length}
            isLoading={allPledgesLoading || !pledgeModerationReady}
            emptyText={t('pledges.list.hiddenEmpty')}
            skeleton={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PledgeCardSkeleton key={i} />
                ))}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {hiddenPledges.map((action) => (
                <PledgeCard
                  key={`${action.pubkey}:${action.id}`}
                  action={action}
                  showAuthor
                  showTranslate
                  topRight={
                    <>
                      <ModerationOverlay
                        coord={getPledgeCoord(action)}
                        entityTitle={action.title}
                        surface="pledge"
                        axes={['hide', 'featured']}
                        showMenu={false}
                        className="flex items-center"
                      />
                      <ActionShareMenu
                        action={action}
                        displayTitle={action.title}
                      />
                    </>
                  }
                />
              ))}
            </div>
          </ModeratorCollapsibleSection>
        )}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Banner rotation for the Pledges hero. We reuse the same gallery the
 * pledge create form offers as a default cover, so the hero feels
 * thematically continuous with the cards below — readers see the
 * vocabulary of imagery they'll be picking from when they create their
 * own pledge. Filtered to a single source extension where multiple
 * exist isn't necessary; the browser handles `.png` / `.jpeg` mixed.
 */
const ACTIONS_HERO_IMAGES: readonly string[] = DEFAULT_ACTION_COVERS.map(
  (c) => c.url,
);

interface ActionsHeroProps {
  /** Number of pledges currently loaded — fuels the live stat pill. */
  actionCount: number;
  /** When true, the primary CTA opens the create-pledge page. */
  canCreate: boolean;
  /** Fires when the user clicks the primary CTA. */
  onCreateAction: () => void;
}

/**
 * Photo-led hero for the Pledges index. Same structural recipe as the
 * Organize hero (rotating banner + atmospheric tint + scrims + overlay
 * copy + glassy CTA), but tuned for the pledge page's "dawn / golden
 * hour" vibe: uses {@link HOPE_PALETTE} instead of the cool palette
 * so the warm hues land on top of the protest photography rather
 * than competing with it.
 */
function ActionsHero({ actionCount, canCreate, onCreateAction }: ActionsHeroProps) {
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
      {/* Rotating photo banner — uses the same gallery offered as default
          pledge covers, so the hero previews the visual vocabulary of
          the cards below. Crossfades every 7s and pans slowly between
          cuts. */}
      <HeroBanner images={ACTIONS_HERO_IMAGES} />

      {/* Warm atmosphere — golden-hour scrim + radial glow + sunrise rim.
          Drives the hue cycle so the photo never feels static even when
          a single banner image is on screen. */}
      <HeroAtmosphere hue={activeHue} />

      {/* Top scrim so the headline stays legible across every photo in
          the rotation. */}
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
            {t('pledges.list.heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {t('pledges.list.heroHeading')}
            <br className="sm:hidden" /> {t('pledges.list.heroHeadingLine2')}
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {t('pledges.list.heroBody')}
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        {/* Live stat pill. Mirrors the Communities hero's pattern but
            only carries a single fact — the current pledge count —
            so it stays calm and the headline does the heavy lifting. */}
        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-black/30 backdrop-blur-xl backdrop-saturate-150 border border-white/20 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-3">
            <Megaphone
              className="size-5 text-amber-200 shrink-0 drop-shadow"
              aria-hidden
            />
            <span className="text-sm sm:text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {actionCount.toLocaleString()}
            </span>
            <span className="text-xs sm:text-sm text-white/85 line-clamp-1 drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)]">
              {t('pledges.list.openCount', { count: actionCount })}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={onCreateAction}
            disabled={!canCreate}
            className={cn(
              'relative rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px]',
              'bg-gradient-to-br from-white/14 via-amber-100/10 to-rose-100/10 hover:from-white/20 hover:via-amber-100/14 hover:to-rose-100/14',
              'backdrop-blur-xl backdrop-saturate-150',
              'border border-white/25 hover:border-white/35',
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(40_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(40_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
            aria-label={
              canCreate
                ? t('pledges.list.createPledge')
                : t('pledges.list.loginToCreate')
            }
          >
            <PlusCircle className="mr-2" />
            {t('pledges.list.createPledge')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ActionSection({
  items,
  total,
  visible,
  showAll,
  onToggle,
}: {
  items: Action[];
  total: number;
  visible: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {items.map((action) => (
          <PledgeCard
            key={`${action.pubkey}:${action.id}`}
            action={action}
            showAuthor
            showTranslate
            topRight={
              <>
                <ModerationOverlay
                  coord={getPledgeCoord(action)}
                  entityTitle={action.title}
                  surface="pledge"
                  axes={['hide', 'featured']}
                  showMenu={false}
                  className="flex items-center"
                />
                <ActionShareMenu action={action} displayTitle={action.title} />
              </>
            }
          />
        ))}
      </div>
      {total > visible && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onToggle}
            className="rounded-full text-sm"
            aria-expanded={showAll}
          >
            {showAll ? (
              <>
                <ChevronUp className="size-4 mr-1.5" />
                {t('pledges.list.showLess')}
              </>
            ) : (
              <>
                <ChevronDown className="size-4 mr-1.5" />
                {t('pledges.list.showMore', { count: total - visible })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
