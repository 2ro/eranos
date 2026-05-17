import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link as RouterLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { useActions, type Action } from '@/hooks/useActions';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { getAllCountries, getGeoDisplayName, countryCodeToFlag } from '@/lib/countries';
import { getDisplayName } from '@/lib/genUserName';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import { CreateActionDialog } from '@/components/CreateActionDialog';

import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Camera, Palette, Info, Clock, Bitcoin, Plus, ChevronRight, Loader2,
  Link as LinkIcon, Check, MoreHorizontal, Trash2, ListFilter,
  Calendar, DollarSign, Globe, Megaphone,
} from 'lucide-react';

const ACTION_ICONS = {
  photo: Camera,
  art: Palette,
  info: Info,
  action: Megaphone,
} as const;

function formatSats(sats: number): string {
  return sats.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons / Cards
// ─────────────────────────────────────────────────────────────────────────────

function ActionSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-40 w-full rounded-none" />
      <CardContent className="space-y-3 pt-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
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

    const confirmed = window.confirm('Delete this action? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // NIP-09 deletion. Include both 'e' and 'a' tags — some relays don't
      // honour a-tag-only deletions for addressable events.
      await createEvent({
        kind: 5,
        content: 'Deleted action',
        tags: [
          ['e', action.event.id],
          ['a', `36639:${action.pubkey}:${action.id}`],
        ],
      });
      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.invalidateQueries({ queryKey: ['agora-action'] });
      toast({ title: 'Action deleted' });
    } catch (error) {
      console.error('Failed to delete action:', error);
      toast({ title: 'Failed to delete action', variant: 'destructive' });
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
              Delete action
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

function ActionCard({ action, isExpired }: { action: Action; isExpired?: boolean }) {
  const author = useAuthor(action.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, action.pubkey);
  const Icon = ACTION_ICONS[action.type];
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

  return (
    <RouterLink to={`/${naddr}`} className="block group">
      <Card
        className={cn(
          'overflow-hidden transition-colors',
          'hover:bg-muted/30',
          isExpired && 'opacity-70',
        )}
      >
        {/* Cover image — full bleed, modest height */}
        <div className="relative w-full h-40 overflow-hidden bg-muted">
          <img
            src={coverImage}
            alt={action.title}
            className={cn(
              'w-full h-full object-cover transition-transform duration-300',
              !isExpired && 'group-hover:scale-[1.02]',
              isExpired && 'grayscale',
            )}
            onError={() => setImageLoadFailed(true)}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Country flag — top-left, sitting on the image */}
          {action.countryCode && (
            <span
              className="absolute top-3 left-3 text-2xl drop-shadow-md"
              title={getGeoDisplayName(action.countryCode)}
            >
              {countryCodeToFlag(action.countryCode)}
            </span>
          )}

          {/* Deadline / expired pill — top-right */}
          {isExpired ? (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-background/90 text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Expired
            </div>
          ) : action.deadline ? (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-background/90 text-xs font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(action.deadline * 1000, 'MMM d')}
            </div>
          ) : null}
        </div>

        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-start gap-2">
            <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className={cn(
                'text-lg font-bold leading-tight line-clamp-2',
                !isExpired && 'group-hover:text-primary transition-colors',
              )}>
                {action.title}
              </h3>
            </div>
            <div onClick={(e) => e.preventDefault()}>
              <ActionShareMenu action={action} />
            </div>
          </div>

          <p className={cn(
            'text-sm line-clamp-3 leading-relaxed',
            isExpired ? 'text-muted-foreground' : 'text-muted-foreground',
          )}>
            {action.description}
          </p>

          {/* Meta row: bounty · author. No nested box. */}
          <div className="flex items-center gap-2 text-sm pt-1 min-w-0">
            <Bitcoin className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold">{formatSats(action.bounty)}</span>
            <span className="text-muted-foreground text-xs">sats</span>
            <span className="text-muted-foreground/50">·</span>
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="text-[9px] bg-muted">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground text-xs truncate">{displayName}</span>
          </div>
        </CardContent>
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

  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [headerCountryPickerOpen, setHeaderCountryPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: actions, isLoading: actionsLoading } = useActions({
    countryCode: selectedCountry,
    limit: 300,
  });

  // Drive the global FAB from the canonical layout API so we get the same
  // circular Plus button every other page has.
  useLayoutOptions({
    showFAB: !!user,
    onFabClick: () => setCreateOpen(true),
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
    title: `Actions${selectedCountry ? ` — ${selectedCountryName}` : ''} | Agora`,
    description: 'Complete activist actions and earn Bitcoin bounties. Take photos, create art, gather information, and take action for change.',
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
    ? 'Active actions'
    : hasUpcoming
      ? 'Upcoming actions'
    : pastActions.length > 0
        ? 'Past actions'
        : 'Actions';
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
            <DollarSign className="mr-2 h-4 w-4" /><span>Highest bounty</span>
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
      <PageHeader title="Actions" icon={<Megaphone className="size-5" />} />

      <div className="px-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <ActionSkeleton key={i} />)}
          </div>
        ) : (actions && actions.length > 0) ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{primarySectionTitle}</h2>
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
              />
            ) : hasUpcoming ? (
              <ActionSection
                items={visibleUpcoming}
                total={upcomingActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllUpcoming}
                onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                isExpired={false}
              />
            ) : pastActions.length > 0 ? (
              <ActionSection
                items={visiblePast}
                total={pastActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllPast}
                onToggle={() => setShowAllPast(!showAllPast)}
                isExpired
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
                />
              </SectionDivider>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Active actions</h2>
              {headerControls}
            </div>

            <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Megaphone className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-xs">
                <h3 className="text-xl font-bold">No actions yet</h3>
                <p className="text-muted-foreground text-sm">
                  {selectedCountry ? `Be the first to create an action for ${selectedCountryName}.` : 'Be the first to create an action.'}
                </p>
              </div>
              {user && (
                <Button onClick={() => setCreateOpen(true)} className="rounded-full">
                  <Plus className="size-4 mr-2" />
                  Create action
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <CreateActionDialog
        countryCode={selectedCountry}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </main>
  );
}

function ActionSection({
  items, total, visible, showAll, onToggle, isExpired,
}: {
  items: Action[]; total: number; visible: number; showAll: boolean; onToggle: () => void; isExpired: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {items.map((action) => (
          <ActionCard
            key={`${action.pubkey}:${action.id}`}
            action={action}
            isExpired={isExpired}
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
