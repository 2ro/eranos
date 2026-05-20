import { useEffect, useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';

import { useActions, type Action } from '@/hooks/useActions';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { getAllCountries, getGeoDisplayName, countryCodeToFlag } from '@/lib/countries';
import { getDisplayName } from '@/lib/genUserName';
import { DEFAULT_ACTION_COVERS, DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatSats, satsToUSDWhole } from '@/lib/bitcoin';
import { HOPE_PALETTE } from '@/lib/hopePalette';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  CalendarClock, Clock, HandHeart, MapPin, Plus, ChevronRight, Loader2,
  Link as LinkIcon, Check, MoreHorizontal, Trash2, ListFilter,
  Calendar, DollarSign, Globe, Megaphone,
} from 'lucide-react';

function formatPledgeAmount(sats: number, btcPrice: number | undefined): string {
  if (btcPrice) return satsToUSDWhole(sats, btcPrice);
  return `${formatSats(sats)} sats`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons / Cards
// ─────────────────────────────────────────────────────────────────────────────

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

function ActionShareMenu({ action }: { action: Action }) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = user?.pubkey === action.pubkey;

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const actionUrl = `${window.location.origin}/${naddr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(actionUrl);
      setCopied(true);
      toast({ title: 'Link copied' });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !isOwner) return;

    const confirmed = window.confirm('Delete this pledge? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // NIP-09 deletion. Include both 'e' and 'a' tags — some relays don't
      // honour a-tag-only deletions for addressable events.
      await createEvent({
        kind: 5,
        content: 'Deleted pledge',
        tags: [
          ['e', action.event.id],
          ['a', `36639:${action.pubkey}:${action.id}`],
        ],
      });
      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.invalidateQueries({ queryKey: ['agora-action'] });
      toast({ title: 'Pledge deleted' });
    } catch (error) {
      console.error('Failed to delete pledge:', error);
      toast({ title: 'Failed to delete pledge', variant: 'destructive' });
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
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
              Delete pledge
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
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDeadline(unixSeconds: number): { label: string; isPast: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return { label: 'Ended', isPast: true };
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: 'Ends today', isPast: false };
  if (days < 30) return { label: `${days} days left`, isPast: false };
  const months = Math.round(days / 30);
  return { label: `${months} mo left`, isPast: false };
}

function ActionCard({ action, isExpired, btcPrice }: { action: Action; isExpired?: boolean; btcPrice: number | undefined }) {
  const author = useAuthor(action.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, action.pubkey);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  // Always show a cover — fall back to the default if the author didn't set
  // one, or the URL failed to validate / load.
  const coverImage = (action.image && !imageLoadFailed)
    ? action.image
    : DEFAULT_COVER_IMAGE;

  const deadline = action.deadline ? formatDeadline(action.deadline) : null;
  const countryLabel = action.countryCode ? getGeoDisplayName(action.countryCode) : undefined;

  return (
    <RouterLink
      to={`/${naddr}`}
      className="group block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
    >
      <Card className={cn('overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col', isExpired && 'opacity-75')}>
        <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
          <img
            src={coverImage}
            alt=""
            className={cn('absolute inset-0 size-full object-cover', isExpired && 'grayscale')}
            onError={() => setImageLoadFailed(true)}
            loading="lazy"
          />
          <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
            {isExpired && (
              <Badge variant="secondary" className="backdrop-blur bg-background/85 border-border/40 text-muted-foreground">
                Ended
              </Badge>
            )}
            <ActionShareMenu action={action} />
          </div>
        </div>

        <div className="flex flex-col gap-3 p-5 flex-1">
          <div className="space-y-2">
            <h3 className="font-bold leading-tight tracking-tight text-lg line-clamp-2">
              {action.title}
            </h3>
            {action.description.trim() && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {action.description}
              </p>
            )}
          </div>

          <div className="flex-1" />

          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Pledged</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {formatPledgeAmount(action.bounty, btcPrice)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1">
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {countryLabel}
              </span>
            )}
            {deadline && (
              <span className={cn('inline-flex items-center gap-1.5', deadline.isPast && 'text-destructive')}>
                <CalendarClock className="size-3.5" />
                {deadline.label}
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground border-t border-border/60 pt-3 truncate">
            by <span className="font-medium text-foreground">{displayName}</span>
          </div>
        </div>
      </Card>
    </RouterLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type SortOption = 'recent' | 'bounty' | 'deadline';

export default function ActionsPage() {
  const { user } = useCurrentUser();
  const { btcPrice } = useBitcoinWallet();
  const navigate = useNavigate();

  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [headerCountryPickerOpen, setHeaderCountryPickerOpen] = useState(false);

  const { data: actions, isLoading: actionsLoading } = useActions({
    countryCode: selectedCountry,
    limit: 300,
  });

  // Route entry points for "Create pledge" all pass the currently-selected
  // country via ?country= so the dedicated page can pre-fill it, matching
  // the old modal's `countryCode` prop.
  const createActionHref = selectedCountry
    ? `/pledges/new?country=${encodeURIComponent(selectedCountry)}`
    : '/pledges/new';

  // Drive the global FAB from the canonical layout API so we get the same
  // circular Plus button every other page has. `noMaxWidth: true` lets
  // the hero banner span the full content column.
  useLayoutOptions({
    noMaxWidth: true,
    showFAB: !!user,
    fabHref: createActionHref,
  });

  const allCountries = useMemo(() => getAllCountries(), []);

  const countryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; flag: string }> = [
      { value: 'global', label: 'Global', flag: '🌍' },
    ];
    allCountries.forEach((country) => {
      options.push({
        value: country.code,
        label: country.name,
        flag: countryCodeToFlag(country.code),
      });
    });
    return options;
  }, [allCountries]);

  const selectedCountryName = selectedCountry
    ? getGeoDisplayName(selectedCountry)
    : 'Global';

  useSeoMeta({
    title: `Pledges${selectedCountry ? ` — ${selectedCountryName}` : ''} | Agora`,
    description: 'Pledge funding for concrete actions, evidence, or outcomes you want to inspire.',
  });

  const isLoading = actionsLoading;

  // Section split (parser already returns: current → upcoming → past).
  // We re-derive here so that local sorting can be applied per section.
  const now = Date.now() / 1000;
  const currentUnsorted = actions?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime <= now && (!c.deadline || c.deadline > now);
  }) ?? [];
  const upcomingUnsorted = actions?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime > now;
  }) ?? [];
  const pastUnsorted = actions?.filter((c) => c.deadline && c.deadline <= now) ?? [];

  const sortActions = (cs: Action[]) => {
    const sorted = [...cs];
    const isPastOnlyList = sorted.length > 0 && sorted.every((c) => !!c.deadline && c.deadline <= now);
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'bounty':
        return sorted.sort((a, b) => b.bounty - a.bounty);
      case 'deadline':
        return sorted.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          // Upcoming/current: soonest deadline first. Past: most recently ended first.
          return isPastOnlyList ? b.deadline - a.deadline : a.deadline - b.deadline;
        });
    }
  };

  const currentActions = sortActions(currentUnsorted);
  const upcomingActions = sortActions(upcomingUnsorted);
  const pastActions = sortActions(pastUnsorted);

  const DEFAULT_VISIBLE = 4;
  const [showAllCurrent, setShowAllCurrent] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const visibleCurrent = showAllCurrent ? currentActions : currentActions.slice(0, DEFAULT_VISIBLE);
  const visibleUpcoming = showAllUpcoming ? upcomingActions : upcomingActions.slice(0, DEFAULT_VISIBLE);
  const visiblePast = showAllPast ? pastActions : pastActions.slice(0, DEFAULT_VISIBLE);
  const hasCurrent = currentActions.length > 0;
  const hasUpcoming = upcomingActions.length > 0;
  const isOnlyPastView = !hasCurrent && !hasUpcoming && pastActions.length > 0;
  const primarySectionTitle = hasCurrent
    ? 'Active pledges'
    : hasUpcoming
      ? 'Upcoming pledges'
    : pastActions.length > 0
        ? 'Past pledges'
        : 'Pledges';
  const deadlineSortLabel = isOnlyPastView ? 'Recently ended' : 'Deadline soon';

  const headerControls = (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto p-2 hover:bg-muted/50 rounded-lg" aria-label="Sort">
            <ListFilter className="h-5 w-5 text-primary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sort by</div>
          <DropdownMenuItem onClick={() => setSortBy('recent')} className={sortBy === 'recent' ? 'bg-primary/10' : ''}>
            <Clock className="mr-2 h-4 w-4" /><span>Most recent</span>
            {sortBy === 'recent' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortBy('bounty')} className={sortBy === 'bounty' ? 'bg-primary/10' : ''}>
            <DollarSign className="mr-2 h-4 w-4" /><span>Highest pledge</span>
            {sortBy === 'bounty' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortBy('deadline')} className={sortBy === 'deadline' ? 'bg-primary/10' : ''}>
            <Calendar className="mr-2 h-4 w-4" /><span>{deadlineSortLabel}</span>
            {sortBy === 'deadline' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={headerCountryPickerOpen} onOpenChange={setHeaderCountryPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto p-2 hover:bg-muted/50 rounded-lg" aria-label="Filter by country">
            {selectedCountry ? (
              <span className="text-2xl">{countryCodeToFlag(selectedCountry)}</span>
            ) : (
              <Globe className="h-5 w-5 text-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {countryOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => {
                      setSelectedCountry(option.value === 'global' ? undefined : option.value);
                      setHeaderCountryPickerOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span>{option.flag}</span>
                    <span className="flex-1">{option.label}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        (selectedCountry || 'global') === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <main className="pb-16 sidebar:pb-0">
      <ActionsHero
        actionCount={actions?.length ?? 0}
        canCreate={!!user}
        onCreateAction={() => navigate(createActionHref)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <ActionSkeleton key={i} />)}
          </div>
        ) : (actions && actions.length > 0) ? (
          <div className="space-y-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{primarySectionTitle}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Help fund the actions worth making.
                </p>
              </div>
              {headerControls}
            </div>

            {hasCurrent ? (
              <ActionSection
                items={visibleCurrent}
                total={currentActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllCurrent}
                onToggle={() => setShowAllCurrent(!showAllCurrent)}
                isExpired={false}
                btcPrice={btcPrice}
              />
            ) : hasUpcoming ? (
              <ActionSection
                items={visibleUpcoming}
                total={upcomingActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllUpcoming}
                onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                isExpired={false}
                btcPrice={btcPrice}
              />
            ) : pastActions.length > 0 ? (
              <ActionSection
                items={visiblePast}
                total={pastActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllPast}
                onToggle={() => setShowAllPast(!showAllPast)}
                isExpired
                btcPrice={btcPrice}
              />
            ) : null}

            {hasCurrent && hasUpcoming && (
              <SectionDivider title="Upcoming">
                <ActionSection
                  items={visibleUpcoming}
                  total={upcomingActions.length}
                  visible={DEFAULT_VISIBLE}
                  showAll={showAllUpcoming}
                  onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                  isExpired={false}
                  btcPrice={btcPrice}
                />
              </SectionDivider>
            )}

            {pastActions.length > 0 && (hasCurrent || hasUpcoming) && (
              <SectionDivider title="Past">
                <ActionSection
                  items={visiblePast}
                  total={pastActions.length}
                  visible={DEFAULT_VISIBLE}
                  showAll={showAllPast}
                  onToggle={() => setShowAllPast(!showAllPast)}
                  isExpired
                  btcPrice={btcPrice}
                />
              </SectionDivider>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Active pledges</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Help fund the actions worth making.
                </p>
              </div>
              {headerControls}
            </div>

            <Card className="border-dashed">
              <div className="py-12 px-8 text-center space-y-4">
                <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold">No pledges yet</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                  {selectedCountry ? `Be the first to create a pledge for ${selectedCountryName}.` : 'Be the first to create a pledge.'}
                  </p>
                </div>
                {user && (
                  <Button onClick={() => navigate(createActionHref)}>
                    <Plus className="size-4 mr-2" />
                    Create pledge
                  </Button>
                )}
              </div>
            </Card>
          </>
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
            Pledge
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            Inspire the change
            <br className="sm:hidden" /> you want to see.
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-2xl mx-auto drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            Fund concrete actions, evidence, and outcomes. People reply with submissions,
            and the community rewards the work that moves the goal forward.
          </p>
        </div>

        <div className="flex-1 min-h-[100px] sm:min-h-[120px]" aria-hidden="true" />

        {/* Live stat pill. Mirrors the Communities hero's pattern but
            only carries a single fact — the current pledge count —
            so it stays calm and the headline does the heavy lifting. */}
        <div
          className="relative w-full max-w-md mx-auto rounded-full bg-background/55 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 px-5 py-3 shadow-lg shadow-amber-500/10"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-3">
            <Megaphone className="size-5 text-primary shrink-0" aria-hidden />
            <span className="text-sm sm:text-base font-semibold tracking-tight">
              {actionCount.toLocaleString()}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
              {actionCount === 1 ? 'pledge open right now' : 'pledges open right now'}
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
            aria-label={canCreate ? 'Create pledge' : 'Log in to create a pledge'}
          >
            <Plus className="mr-2" />
            Create pledge
          </Button>
        </div>
      </div>
    </section>
  );
}

function ActionSection({
  items, total, visible, showAll, onToggle, isExpired, btcPrice,
}: {
  items: Action[]; total: number; visible: number; showAll: boolean; onToggle: () => void; isExpired: boolean; btcPrice: number | undefined;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {items.map((action) => (
          <ActionCard
            key={`${action.pubkey}:${action.id}`}
            action={action}
            isExpired={isExpired}
            btcPrice={btcPrice}
          />
        ))}
      </div>
      {total > visible && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onToggle} className="gap-2">
            {showAll ? (
              <>Show less <ChevronRight className="h-4 w-4 rotate-90" /></>
            ) : (
              <>Show more ({total - visible} more) <ChevronRight className="h-4 w-4 -rotate-90" /></>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionDivider({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <div className="flex-1 border-t border-border/50" />
      </div>
      {children}
    </div>
  );
}
