import { useEffect, useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { nip19 } from 'nostr-tools';

import { parseAction, useActions, type Action } from '@/hooks/useActions';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaignModerators } from '@/hooks/useCampaignModerators';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useDebounce } from '@/hooks/useDebounce';
import { useNip50Search, type Nip50Sort } from '@/hooks/useNip50Search';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePledgeModeration } from '@/hooks/usePledgeModeration';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useToast } from '@/hooks/useToast';
import { getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_ACTION_COVERS } from '@/lib/defaultActionCovers';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';
import { DiscoverySearchToolbar } from '@/components/DiscoverySearchToolbar';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { ModerationMenuItems, ModerationOverlay, ModeratorCollapsibleSection } from '@/components/moderation';
import { PledgeCard } from '@/components/PledgeCard';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  HandHeart, PlusCircle, ChevronDown, ChevronUp, Loader2,
  Link as LinkIcon, Check, MoreHorizontal, Trash2,
  Megaphone, Sparkles, EyeOff,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons / Cards
// ─────────────────────────────────────────────────────────────────────────────

function getPledgeCoord(action: Action) {
  return `36639:${action.pubkey}:${action.id}`;
}

function ActionSkeleton() {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm h-full flex flex-col">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex-1 p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}

function ActionShareMenu({ action, displayTitle }: { action: Action; displayTitle: string }) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { data: moderators } = useCampaignModerators();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = user?.pubkey === action.pubkey;
  // Moderator gate is identical to the one in `ModerationMenuItems`,
  // duplicated here so we can decide whether to render the trailing
  // separator that introduces the moderator section. `ModerationMenuItems`
  // returns `null` for non-mods, so without this check we'd render an
  // orphaned separator at the bottom of the dropdown.
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const actionUrl = `${shareOrigin}/${naddr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(actionUrl);
      setCopied(true);
      toast({ title: t('pledges.card.linkCopied') });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({ title: t('pledges.card.linkCopyFailed'), variant: 'destructive' });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !isOwner) return;

    const confirmed = window.confirm(t('pledges.card.confirmDelete'));
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // NIP-09 deletion. Include both 'e' and 'a' tags — some relays don't
      // honour a-tag-only deletions for addressable events.
      await createEvent({
        kind: 5,
        content: t('pledges.card.deletedContent'),
        tags: [
          ['e', action.event.id],
          ['a', getPledgeCoord(action)],
        ],
      });
      // Extract any organization `A` tag the pledge was associated with so
      // the org's activity shelf and community feeds refresh too.
      const orgATag = action.event.tags.find(([n]) => n === 'A')?.[1];
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agora-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['agora-action'] }),
        ...(orgATag
          ? [
              queryClient.invalidateQueries({ queryKey: ['organization-activity', orgATag] }),
              queryClient.invalidateQueries({ queryKey: ['community-actions', orgATag] }),
              queryClient.invalidateQueries({
                predicate: (q) => {
                  const [root, aTagsKey] = q.queryKey;
                  return root === 'community-activity-feed'
                    && typeof aTagsKey === 'string'
                    && aTagsKey.split(',').includes(orgATag);
                },
              }),
            ]
          : []),
      ]);
      toast({ title: t('pledges.card.deleted') });
    } catch (error) {
      console.error('Failed to delete pledge:', error);
      toast({ title: t('pledges.card.deleteFailed'), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('pledges.card.actionsAriaLabel')}
          className="h-8 w-8 bg-background/80 backdrop-blur text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isOwner && (
          <>
            <DropdownMenuItem onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t('pledges.card.deletePledge')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleCopyLink}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-primary" />
          ) : (
            <LinkIcon className="h-4 w-4 mr-2" />
          )}
          {t('pledges.card.copyLink')}
        </DropdownMenuItem>
        {/* Moderator actions appear under a separator when the viewer
            is a Team Soapbox moderator. `ModerationMenuItems` returns
            null for non-mods, so we gate the trailing separator on the
            same `isMod` check to avoid an orphan separator at the
            bottom of non-mod dropdowns. */}
        {isMod && <DropdownMenuSeparator />}
        <ModerationMenuItems
          coord={getPledgeCoord(action)}
          entityTitle={displayTitle}
          surface="pledge"
          axes={['hide', 'featured']}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { data: btcPrice } = useBtcPrice();
  const navigate = useNavigate();

  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);

  // On-page NIP-50 search + sort + show-hidden toolbar state.
  //
  //   Default sort, empty query → curated active / upcoming / past
  //     sections below.
  //   Default sort, with query  → relay search for kind 36639, results
  //     post-filtered against title/content client-side.
  //   Top / New                  → always active. Top sends `sort:top`;
  //     New sends a raw chronological feed of the kind.
  //
  // The country filter is threaded through to the search as a NIP-73
  // `#i` tag filter (`iso3166:XX` + legacy `geo:XX`). Picking a country
  // with an empty query still activates the search view — narrowing a
  // kind by external identifier produces a useful filtered grid even
  // without a typed term.
  const [searchInput, setSearchInput] = useState('');
  const [sortMode, setSortMode] = useState<Nip50Sort>('default');
  const [showHidden, setShowHidden] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 300);
  const trimmedSearch = debouncedSearch.trim();
  const iTags = useMemo<string[] | undefined>(() => {
    if (!selectedCountry) return undefined;
    const code = selectedCountry.toUpperCase();
    return [`iso3166:${code}`, `geo:${code}`];
  }, [selectedCountry]);
  const {
    data: searchHitsRaw,
    isFetching: isSearchFetching,
    isActive: isSearching,
  } = useNip50Search<Action>({
    kind: 36639,
    query: debouncedSearch,
    sort: sortMode,
    parse: parseAction,
    iTags,
    // Pledge titles live in a `title` tag, not `content`. Most NIP-50
    // implementations only match content; widen the net client-side.
    getKeywordHaystack: (event) => {
      const title = event.tags.find(([n]) => n === 'title')?.[1] ?? '';
      return [title, event.content];
    },
  });

  // Moderator gate. Reuses the campaign moderator pack (Team Soapbox) —
  // the pledge moderation namespace rides the same signer set as the
  // campaign and group surfaces.
  const { data: moderators } = useCampaignModerators();
  const isMod = !!user && !!moderators && moderators.includes(user.pubkey);
  const canShowHidden = isMod && showHidden;

  const { data: rawActions, isLoading: actionsLoading } = useActions({
    countryCode: selectedCountry,
    limit: 300,
  });

  const { data: myPledges } = useActions({
    authors: user ? [user.pubkey] : undefined,
    limit: 100,
    enabled: !!user,
  });
  const { data: allPledgesForMods, isLoading: allPledgesLoading } = useActions({
    limit: 300,
    enabled: isMod,
  });

  const { data: pledgeModeration, isReady: pledgeModerationReady } = usePledgeModeration();

  const featuredPledgeCoords = useMemo(() => {
    if (!pledgeModerationReady) return [] as string[];
    return Array.from(pledgeModeration.featuredCoords)
      .filter((coord) => !pledgeModeration.hiddenCoords.has(coord))
      .sort((a, b) => (pledgeModeration.featuredOrder.get(b) ?? 0) - (pledgeModeration.featuredOrder.get(a) ?? 0));
  }, [pledgeModeration, pledgeModerationReady]);

  const { data: featuredPledges, isLoading: featuredPledgesLoading } = useActions({
    coordinates: featuredPledgeCoords,
    limit: featuredPledgeCoords.length || 1,
    enabled: pledgeModerationReady,
  });

  const orderedFeaturedPledges = useMemo(() => {
    if (!featuredPledges) return [] as Action[];
    const order = pledgeModeration.featuredOrder;
    return [...featuredPledges].sort((a, b) => {
      const aCoord = getPledgeCoord(a);
      const bCoord = getPledgeCoord(b);
      return (order.get(bCoord) ?? 0) - (order.get(aCoord) ?? 0);
    });
  }, [featuredPledges, pledgeModeration]);

  const featuredPledgeCoordSet = useMemo(() => new Set(featuredPledgeCoords), [featuredPledgeCoords]);

  const { searchHits, searchHiddenCount } = useMemo(() => {
    if (!searchHitsRaw) return { searchHits: undefined, searchHiddenCount: 0 };
    const hiddenCoords = pledgeModeration?.hiddenCoords ?? new Set<string>();
    let hidden = 0;
    const visible: Action[] = [];
    for (const a of searchHitsRaw) {
      const coord = getPledgeCoord(a);
      if (hiddenCoords.has(coord)) {
        hidden += 1;
        if (canShowHidden) visible.push(a);
      } else {
        visible.push(a);
      }
    }
    return { searchHits: visible, searchHiddenCount: hidden };
  }, [searchHitsRaw, pledgeModeration, canShowHidden]);

  const { actions, listHiddenCount } = useMemo(() => {
    if (!rawActions) return { actions: undefined, listHiddenCount: 0 };
    const hiddenCoords = pledgeModeration?.hiddenCoords ?? new Set<string>();
    let hidden = 0;
    const visible: Action[] = [];

    for (const action of rawActions) {
      const coord = getPledgeCoord(action);
      if (hiddenCoords.has(coord)) {
        hidden += 1;
        if (canShowHidden) visible.push(action);
      } else {
        visible.push(action);
      }
    }

    return { actions: visible, listHiddenCount: hidden };
  }, [rawActions, pledgeModeration, canShowHidden]);

  // Route entry points for "Create pledge" all pass the currently-selected
  // country via ?country= so the dedicated page can pre-fill it, matching
  // the old modal's `countryCode` prop.
  const createActionHref = selectedCountry
    ? `/pledges/new?country=${encodeURIComponent(selectedCountry)}`
    : '/pledges/new';

  const selectedCountryName = selectedCountry
    ? getGeoDisplayName(selectedCountry)
    : t('pledges.list.global');

  useSeoMeta({
    title: `${selectedCountry
      ? t('pledges.list.seoTitleWithCountry', { country: selectedCountryName })
      : t('pledges.list.seoTitle')} | ${config.appName}`,
    description: t('pledges.list.seoDescription'),
  });

  const isLoading = actionsLoading || !pledgeModerationReady;
  const isSearchLoading = isSearchFetching || !pledgeModerationReady;

  const DEFAULT_VISIBLE = 4;
  const [showAllMine, setShowAllMine] = useState(false);
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [showAllPledges, setShowAllPledges] = useState(false);

  const allPledges = useMemo(
    () => (actions ?? []).filter((action) => !featuredPledgeCoordSet.has(getPledgeCoord(action))),
    [actions, featuredPledgeCoordSet],
  );
  const visibleMine = showAllMine ? (myPledges ?? []) : (myPledges ?? []).slice(0, DEFAULT_VISIBLE);
  const visibleFeatured = showAllFeatured ? orderedFeaturedPledges : orderedFeaturedPledges.slice(0, DEFAULT_VISIBLE);
  const visibleAllPledges = showAllPledges ? allPledges : allPledges.slice(0, DEFAULT_VISIBLE);
  const hiddenPledges = useMemo<Action[]>(() => {
    if (!isMod || !pledgeModerationReady) return [];
    return (allPledgesForMods ?? []).filter((pledge) => pledgeModeration.hiddenCoords.has(getPledgeCoord(pledge)));
  }, [allPledgesForMods, isMod, pledgeModeration, pledgeModerationReady]);

  const headerControls = (
    <DiscoverySearchToolbar
      query={searchInput}
      onQueryChange={setSearchInput}
      sort={sortMode}
      onSortChange={setSortMode}
      searchPlaceholderKey="pledges.list.searchPlaceholder"
      searchAriaLabelKey="pledges.list.searchAriaLabel"
      showHidden={isMod ? {
        value: canShowHidden,
        onChange: setShowHidden,
        count: isSearching ? searchHiddenCount : listHiddenCount,
      } : undefined}
      country={selectedCountry}
      onCountryChange={setSelectedCountry}
    />
  );

  return (
    <main className="pb-16 sidebar:pb-0">
      <ActionsHero
        actionCount={actions?.length ?? 0}
        canCreate={!!user}
        onCreateAction={() => navigate(createActionHref)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12">
        {user && myPledges && myPledges.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('pledges.list.myPledges')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('pledges.list.myPledgesTagline')}</p>
            </div>
            <ActionSection
              items={visibleMine}
              total={myPledges.length}
              visible={DEFAULT_VISIBLE}
              showAll={showAllMine}
              onToggle={() => setShowAllMine(!showAllMine)}
              btcPrice={btcPrice}
            />
          </section>
        )}

        {(featuredPledgesLoading || orderedFeaturedPledges.length > 0) && (
          <section className="space-y-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2">
                <Sparkles className="size-6 text-primary" />
                {t('pledges.list.featuredPledges')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{t('pledges.list.featuredPledgesTagline')}</p>
            </div>
            {featuredPledgesLoading && orderedFeaturedPledges.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => <ActionSkeleton key={i} />)}
              </div>
            ) : (
              <ActionSection
                items={visibleFeatured}
                total={orderedFeaturedPledges.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllFeatured}
                onToggle={() => setShowAllFeatured(!showAllFeatured)}
                btcPrice={btcPrice}
              />
            )}
          </section>
        )}

        <section className="space-y-5">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {trimmedSearch
                  ? t('common.search')
                  : isSearching && sortMode === 'top'
                    ? t('common.sortTop')
                    : isSearching && sortMode === 'new'
                      ? t('common.sortNew')
                      : t('pledges.list.allPledges')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isSearching && searchHits
                  ? t('common.searchResultsCount', { count: searchHits.length })
                  : t('pledges.list.allPledgesTagline')}
              </p>
            </div>
            {headerControls}
          </div>

          {isSearching ? (
            <>
              {isSearchLoading && !searchHits ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {Array.from({ length: 8 }).map((_, i) => <ActionSkeleton key={i} />)}
                </div>
              ) : searchHits && searchHits.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {searchHits.map((action) => (
                    <PledgeCard
                      key={`${action.pubkey}:${action.id}`}
                      action={action}
                      btcPrice={btcPrice}
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
              ) : (
                <Card className="border-dashed">
                  <div className="py-12 px-8 text-center space-y-2">
                    {trimmedSearch ? (
                      <>
                        <p className="text-base font-medium">
                          {t('pledges.list.noMatch', { query: trimmedSearch })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('pledges.list.noMatchHint')}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('pledges.list.emptyTitle')}
                      </p>
                    )}
                  </div>
                </Card>
              )}
            </>
          ) : isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => <ActionSkeleton key={i} />)}
            </div>
          ) : allPledges.length > 0 ? (
            <ActionSection
              items={visibleAllPledges}
              total={allPledges.length}
              visible={DEFAULT_VISIBLE}
              showAll={showAllPledges}
              onToggle={() => setShowAllPledges(!showAllPledges)}
              btcPrice={btcPrice}
            />
          ) : (
            <Card className="border-dashed">
              <div className="py-12 px-8 text-center space-y-4">
                <HandHeart className="size-10 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold">{t('pledges.list.emptyTitle')}</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    {selectedCountry
                      ? t('pledges.list.emptyHintCountry', { country: selectedCountryName })
                      : t('pledges.list.emptyHint')}
                  </p>
                </div>
                {user && (
                  <Button onClick={() => navigate(createActionHref)}>
                    <PlusCircle className="size-4 mr-2" />
                    {t('pledges.list.createPledge')}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </section>

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
                {Array.from({ length: 4 }).map((_, i) => <ActionSkeleton key={i} />)}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {hiddenPledges.map((action) => (
                <PledgeCard
                  key={`${action.pubkey}:${action.id}`}
                  action={action}
                  btcPrice={btcPrice}
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
 * copy + glassy CTA), but tuned for the pledge page's "dawn / golden hour" vibe:
 * uses {@link HOPE_PALETTE} instead of the cool palette so the warm
 * hues land on top of the protest photography rather than competing
 * with it.
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
            <Megaphone className="size-5 text-amber-200 shrink-0 drop-shadow" aria-hidden />
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
              'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_10px_28px_-12px_hsl(24_85%_45%/0.4)]',
              'hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_32px_-10px_hsl(24_85%_45%/0.5)]',
              'motion-safe:transition-colors motion-safe:duration-200',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
            aria-label={canCreate ? t('pledges.list.createPledge') : t('pledges.list.loginToCreate')}
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
  items, total, visible, showAll, onToggle, btcPrice,
}: {
  items: Action[]; total: number; visible: number; showAll: boolean; onToggle: () => void; btcPrice: number | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {items.map((action) => (
          <PledgeCard
            key={`${action.pubkey}:${action.id}`}
            action={action}
            btcPrice={btcPrice}
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
