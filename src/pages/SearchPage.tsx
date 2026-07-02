import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/hooks/useAppContext';
import {
  SlidersHorizontal,
  Search as SearchIcon,
  UserRoundCheck,
  RotateCcw,
  Globe, Users, UserSearch,
  Clock, Flame, TrendingUp,
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { Link, useSearchParams } from 'react-router-dom';
import { NoteCard } from '@/components/NoteCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { HelpTip } from '@/components/HelpTip';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmojifiedText } from '@/components/CustomEmoji';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildKindOptions } from '@/lib/feedFilterUtils';
import { KindPicker, AuthorChip, AuthorFilterDropdown } from '@/components/SavedFeedFiltersEditor';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useAuthor } from '@/hooks/useAuthor';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useFollowList } from '@/hooks/useFollowActions';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';

import { ListPackPicker } from '@/components/SavedFeedFiltersEditor';

import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { cn, parseKindFilter } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { isRepostKind, parseRepostContent } from '@/lib/feedUtils';
import { nip19 } from 'nostr-tools';

type TabType = 'agora' | 'posts' | 'accounts';

const VALID_TABS: TabType[] = ['agora', 'posts', 'accounts'];

function parseTab(value: string | null): TabType {
  // Back-compat: ?tab=communities and ?tab=activity used to be the default tab;
  // alias them both to agora.
  if (value === 'communities' || value === 'activity') return 'agora';
  return VALID_TABS.includes(value as TabType) ? (value as TabType) : 'agora';
}

const VALID_AUTHOR_SCOPES = ['anyone', 'follows', 'people'] as const;
type AuthorScope = typeof VALID_AUTHOR_SCOPES[number];

const VALID_SORTS = ['recent', 'hot', 'trending'] as const;
type SortPref = typeof VALID_SORTS[number];

const DEFAULT_FILTERS = {
  includeReplies: true,
  mediaType: 'all' as const,
  language: 'global',
  platform: 'nostr' as const,
  kindFilter: 'agora',
  customKindText: '',
  authorScope: 'anyone' as AuthorScope,
  sort: 'recent' as SortPref,
};

/** Parse a boolean from a URL param, returning defaultVal if absent/invalid. */
function parseBoolParam(value: string | null, defaultVal: boolean): boolean {
  if (value === null) return defaultVal;
  return value !== 'false';
}

export function SearchPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('search.seoTitle')} | ${config.appName}`,
    description: t('search.seoDescription'),
  });



  const [searchParams, setSearchParams] = useSearchParams();

  // Derive tab directly from URL — single source of truth
  const activeTab = parseTab(searchParams.get('tab'));

  // SearchPage only tracks the debounced value — raw keystroke state lives in
  // the SearchInput child component so typing doesn't re-render the whole page.
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchParams.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Filter state — all derived from URL params ──────────────────────────
  const includeReplies = parseBoolParam(searchParams.get('replies'), DEFAULT_FILTERS.includeReplies);
  const VALID_MEDIA_TYPES = ['all', 'images', 'videos', 'vines', 'none'] as const;
  type MediaType = typeof VALID_MEDIA_TYPES[number];
  const rawMedia = searchParams.get('media') ?? DEFAULT_FILTERS.mediaType;
  const mediaType: MediaType = (VALID_MEDIA_TYPES as readonly string[]).includes(rawMedia) ? (rawMedia as MediaType) : DEFAULT_FILTERS.mediaType;
  const language = searchParams.get('lang') ?? DEFAULT_FILTERS.language;
  const VALID_PLATFORMS = ['nostr', 'activitypub', 'atproto'] as const;
  type PlatformType = typeof VALID_PLATFORMS[number];
  const rawPlatform = searchParams.get('platform') ?? DEFAULT_FILTERS.platform;
  const platform: PlatformType = (VALID_PLATFORMS as readonly string[]).includes(rawPlatform) ? (rawPlatform as PlatformType) : DEFAULT_FILTERS.platform;
  const kindFilter = searchParams.get('kind') ?? DEFAULT_FILTERS.kindFilter;
  const customKindText = searchParams.get('customKind') ?? DEFAULT_FILTERS.customKindText;
  const rawAuthorScope = searchParams.get('authorScope') ?? DEFAULT_FILTERS.authorScope;
  const authorScope: AuthorScope = (VALID_AUTHOR_SCOPES as readonly string[]).includes(rawAuthorScope)
    ? (rawAuthorScope as AuthorScope)
    : DEFAULT_FILTERS.authorScope;
  // Multiple authors stored as repeated ?author= params
  const authorPubkeys = useMemo(() => searchParams.getAll('author'), [searchParams]);
  const rawSort = searchParams.get('sort') ?? DEFAULT_FILTERS.sort;
  const sort: SortPref = (VALID_SORTS as readonly string[]).includes(rawSort)
    ? (rawSort as SortPref)
    : DEFAULT_FILTERS.sort;
  // ────────────────────────────────────────────────────────────────────────

  // Helper to update a single URL param
  const setParam = useCallback((key: string, value: string, defaultValue: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === defaultValue) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setIncludeReplies = useCallback((v: boolean) => setParam('replies', String(v), String(DEFAULT_FILTERS.includeReplies)), [setParam]);
  const setMediaType = useCallback((v: string) => setParam('media', v, DEFAULT_FILTERS.mediaType), [setParam]);
  const setLanguage = useCallback((v: string) => setParam('lang', v, DEFAULT_FILTERS.language), [setParam]);
  const setPlatform = useCallback((v: string) => setParam('platform', v, DEFAULT_FILTERS.platform), [setParam]);
  const setSort = useCallback((v: string) => setParam('sort', v, DEFAULT_FILTERS.sort), [setParam]);
  const setKindFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === DEFAULT_FILTERS.kindFilter) {
        next.delete('kind');
      } else {
        next.set('kind', v);
      }
      if (v !== 'custom') next.delete('customKind');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const setCustomKindText = useCallback((v: string) => setParam('customKind', v, DEFAULT_FILTERS.customKindText), [setParam]);

  const setAuthorScope = useCallback((scope: AuthorScope) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (scope === DEFAULT_FILTERS.authorScope) {
        next.delete('authorScope');
      } else {
        next.set('authorScope', scope);
      }
      // Clear specific authors when switching away from 'people'
      if (scope !== 'people') {
        next.delete('author');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /** Replace the current author list with the pubkeys from a Follow Set or Pack. */
  const setAuthorsFromList = useCallback((pubkeys: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('author');
      pubkeys.forEach((pk) => next.append('author', pk));
      next.set('authorScope', 'people');
      return next;
    }, { replace: true });
  }, [setSearchParams]);



  // Update tab in URL
  const setActiveTab = useCallback((tab: TabType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'agora') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Guard to prevent the URL→state sync from clobbering the input
  // when we ourselves just wrote to the URL.
  const internalUrlUpdate = useRef(false);

  // Sync search query state → URL (debounced to avoid disrupting typing).
  // Intentionally omits `searchParams` from deps — including it causes a
  // feedback loop: writing to the URL updates searchParams, which re-triggers
  // this effect, forcing extra renders on every keystroke.
  // The functional updater form of setSearchParams already receives the latest
  // params, so we don't need searchParams in scope here.
  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    internalUrlUpdate.current = true;
    setSearchParams((prev) => {
      const currentQ = prev.get('q') ?? '';
      if (trimmed === currentQ) {
        // No change — return the same object so React Router skips a history update.
        internalUrlUpdate.current = false;
        return prev;
      }
      const next = new URLSearchParams(prev);
      if (trimmed) {
        next.set('q', trimmed);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  }, [debouncedSearchQuery, setSearchParams]);

  // Sync URL → debounced query state (e.g., sidebar search or browser navigation)
  useEffect(() => {
    // Skip if we just wrote to the URL ourselves (avoids clobbering mid-typing input)
    if (internalUrlUpdate.current) {
      internalUrlUpdate.current = false;
      return;
    }
    const q = searchParams.get('q') ?? '';
    if (q !== debouncedSearchQuery.trim()) {
      setDebouncedSearchQuery(q);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: Previously this redirected NIP-19/NIP-05 identifiers away from the
  // search page. Now identifiers are handled as autocomplete suggestions in the
  // search dropdowns, and submitting always performs a text search.

  const protocols = useMemo(() => [platform], [platform]);

  const kindOptions = useMemo(() => buildKindOptions(), []);

  // All kind numbers available in the picker — used as the "all kinds" default.
  const allKindNumbers = useMemo(() => kindOptions.map((o) => Number(o.value)), [kindOptions]);

  // Resolve kindsOverride from the current kind filter state.
  // "all" means every kind in the picker list, not undefined (which would
  // let useStreamPosts fall back to only the user's enabled feed-settings
  // kinds). "agora" expands to the curated Agora preset set.
  const kindsOverride = useMemo<number[]>(
    () => kindFilter === 'all' ? allKindNumbers : (parseKindFilter(kindFilter, customKindText) ?? allKindNumbers),
    [kindFilter, customKindText, allKindNumbers],
  );

  // Detect kind + media type conflict: a non-broad kind is selected AND a
  // media type is set. "all" and "agora" are both broad selections that
  // don't conflict with media filters.
  const hasKindMediaConflict = kindFilter !== 'all' && kindFilter !== 'agora' && kindsOverride.length > 0 && mediaType !== 'all';

  // Determine if any filter differs from the default
  const hasActiveFilters = !includeReplies || mediaType !== DEFAULT_FILTERS.mediaType ||
    language !== DEFAULT_FILTERS.language || platform !== DEFAULT_FILTERS.platform ||
    kindFilter !== DEFAULT_FILTERS.kindFilter || authorScope !== DEFAULT_FILTERS.authorScope ||
    sort !== DEFAULT_FILTERS.sort || authorPubkeys.length > 0;

  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('replies');
      next.delete('media');
      next.delete('lang');
      next.delete('platform');
      next.delete('kind');
      next.delete('customKind');
      next.delete('authorScope');
      next.delete('author');
      next.delete('sort');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Build the NIP-50 search string that will be sent to the relay (for display)
  const nip50SearchString = useMemo(() => {
    const bridged = protocols.filter(p => p !== 'nostr');
    const parts: string[] = bridged.length > 0
      ? bridged.map(p => `protocol:${p}`)
      : ['protocol:nostr'];
    if (debouncedSearchQuery.trim()) parts.push(debouncedSearchQuery.trim());
    if (language !== 'global') parts.push(`language:${language}`);
    const isDedicatedKindQuery = (kindFilter === 'all' || kindFilter === 'agora') && (mediaType === 'vines' || mediaType === 'images' || mediaType === 'videos');
    if (!isDedicatedKindQuery && !hasKindMediaConflict) {
      if (mediaType === 'images') { parts.push('media:true'); parts.push('video:false'); }
      else if (mediaType === 'videos') parts.push('video:true');
      else if (mediaType === 'none') parts.push('media:false');
    }
    if (sort === 'hot') parts.push('sort:hot');
    else if (sort === 'trending') parts.push('sort:trending');
    return parts.join(' ');
  }, [debouncedSearchQuery, language, mediaType, protocols, hasKindMediaConflict, sort, kindFilter]);

  // Active filter labels for the summary / empty state hints
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (!includeReplies) labels.push(t('search.chips.noReplies'));
    if (mediaType !== 'all') labels.push({
      images: t('search.chips.images'),
      videos: t('search.chips.videos'),
      vines: t('search.chips.shortsAndDivines'),
      none: t('search.chips.noMedia'),
    }[mediaType] ?? mediaType);
    if (language !== 'global') labels.push(language.toUpperCase());
    if (platform !== 'nostr') labels.push({
      activitypub: t('search.chips.mastodon'),
      atproto: t('search.chips.bluesky'),
    }[platform] ?? platform);
    if (sort !== 'recent') labels.push(sort === 'hot' ? t('search.chips.hot') : t('search.chips.trending'));
    if (kindFilter === 'agora') {
      // 'agora' is the default — no chip needed.
    } else if (kindFilter === 'all') {
      labels.push(t('search.chips.allKinds'));
    } else if (kindFilter === 'custom') {
      if (customKindText) labels.push(t('search.chips.customKind', { kind: customKindText }));
    } else {
      const kindValues = kindFilter.split(',').filter(Boolean);
      if (kindValues.length === 1) {
        const opt = kindOptions.find(o => o.value === kindValues[0]);
        if (opt) labels.push(opt.label);
        else labels.push(t('search.chips.kindNumber', { kind: kindValues[0] }));
      } else if (kindValues.length > 1) {
        labels.push(t('search.chips.kindsCount', { count: kindValues.length }));
      }
    }
    if (authorScope === 'follows') labels.push(t('search.chips.myFollows'));
    if (authorScope === 'people' && authorPubkeys.length > 0) {
      labels.push(t('search.chips.authorsCount', { count: authorPubkeys.length }));
    }
    return labels;
  }, [t, includeReplies, mediaType, language, platform, sort, kindFilter, customKindText, authorScope, authorPubkeys, kindOptions]);

  // Hooks
  const { data: followData } = useFollowList();
  const followPubkeys = useMemo(() => followData?.pubkeys ?? [], [followData?.pubkeys]);
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();

  const listPickerValue = useMatchedListId(authorPubkeys);

  // Resolve author pubkeys for the stream
  const streamAuthorPubkeys = authorScope === 'follows'
    ? followPubkeys
    : authorScope === 'people' && authorPubkeys.length > 0
      ? authorPubkeys
      : undefined;

  const { posts, isLoading: postsLoading, newPostCount, flushStreamBuffer, flushedIds } = useStreamPosts(debouncedSearchQuery, {
    includeReplies,
    mediaType,
    language,
    protocols,
    kindsOverride,
    authorPubkeys: streamAuthorPubkeys,
    sort,
  });
  const { data: profiles, isLoading: profilesLoading, followedPubkeys } = useSearchProfiles(activeTab === 'accounts' ? debouncedSearchQuery : '');

  const handleRefresh = useCallback(async () => {
    flushStreamBuffer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [flushStreamBuffer]);

  return (
    <main className="flex-1 min-w-0">
      <PageHeader title={t('search.title')} icon={<SearchIcon className="size-5" />} />
      <SubHeaderBar>
        <TabButton label={t('search.tabs.agora')} active={activeTab === 'agora'} onClick={() => setActiveTab('agora')} />
        <TabButton label={t('search.filters.langOptions.global')} active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
        <TabButton label={t('search.tabs.accounts')} active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')} />
      </SubHeaderBar>

      {/* Search input bar — always rendered right after tabs, like ComposeBox on Feed */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <SearchInput
            initialValue={debouncedSearchQuery}
            onDebouncedChange={setDebouncedSearchQuery}
          />

          {/* Filter popover (posts & agora tabs) */}
          {(activeTab === 'posts' || activeTab === 'agora') && (
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'shrink-0 h-10 w-10 rounded-lg border bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors',
                    filtersOpen
                      ? 'border-2 border-primary bg-secondary text-primary'
                      : hasActiveFilters
                        ? 'border-primary text-primary'
                        : 'border-border',
                  )}
                  style={{ outline: 'none' }}
                  aria-label={t('search.filtersAria')}
                >
                  <SlidersHorizontal className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{t('search.filters.title')}</span>
                  {hasActiveFilters && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      onClick={resetFilters}
                    >
                      <RotateCcw className="size-3" />
                      {t('search.filters.reset')}
                    </button>
                  )}
                </div>

                {/* Author scope */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('search.filters.from')}</span>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    {([
                      ['anyone', t('search.filters.authorScope.anyone'), Globe],
                      ['follows', t('search.filters.authorScope.follows'), Users],
                      ['people', t('search.filters.authorScope.people'), UserSearch],
                    ] as const).map(([scope, label, Icon]) => (
                      <button
                        key={scope}
                        onClick={() => setAuthorScope(scope as AuthorScope)}
                        className={cn(
                          'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                          authorScope === scope
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {authorScope === 'people' && (
                    <div className="space-y-1.5">
                      {authorPubkeys.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {authorPubkeys.map((pk) => (
                            <AuthorChip key={pk} pubkey={pk} onRemove={() => {
                              const next = authorPubkeys.filter((p) => p !== pk);
                              setSearchParams((prev) => {
                                const n = new URLSearchParams(prev);
                                n.delete('author');
                                next.forEach((p) => n.append('author', p));
                                if (next.length === 0) n.delete('authorScope');
                                return n;
                              }, { replace: true });
                            }} />
                          ))}
                        </div>
                      )}
                      <AuthorFilterDropdown onCommit={(pubkey) => {
                        if (!authorPubkeys.includes(pubkey)) {
                          setSearchParams((prev) => {
                            const n = new URLSearchParams(prev);
                            n.append('author', pubkey);
                            n.set('authorScope', 'people');
                            return n;
                          }, { replace: true });
                        }
                      }} />
                      <ListPackPicker
                        lists={lists}
                        followPacks={followPacks}
                        value={listPickerValue}
                        onSelectPubkeys={setAuthorsFromList}
                      />
                    </div>
                  )}
                </div>
                <Separator />

                {/* Sort */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('search.filters.sort')}</span>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    {([
                      ['recent', t('search.filters.sortOptions.recent'), Clock],
                      ['hot', t('search.filters.sortOptions.hot'), Flame],
                      ['trending', t('search.filters.sortOptions.trending'), TrendingUp],
                    ] as const).map(([s, label, Icon]) => (
                      <button
                        key={s}
                        onClick={() => setSort(s)}
                        className={cn(
                          'flex-1 py-1.5 flex items-center justify-center gap-1 text-xs font-medium transition-colors',
                          sort === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Posts-only filters (hidden on agora tab) */}
                {activeTab === 'posts' && (
                  <>
                    <Separator />

                    {/* Media + Protocol */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">{t('search.filters.media')}</span>
                        <Select value={mediaType} onValueChange={(v) => setMediaType(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('search.filters.mediaOptions.all')}</SelectItem>
                            <SelectItem value="images">{t('search.filters.mediaOptions.images')}</SelectItem>
                            <SelectItem value="videos">{t('search.filters.mediaOptions.videos')}</SelectItem>
                            <SelectItem value="vines">{t('search.filters.mediaOptions.shorts')}</SelectItem>
                            <SelectItem value="none">{t('search.filters.mediaOptions.none')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">{t('search.filters.protocol')} <HelpTip faqId="vs-mastodon-bluesky" iconSize="size-3" /></span>
                        <Select value={platform} onValueChange={(v) => setPlatform(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nostr">{t('search.filters.protocolOptions.nostr')}</SelectItem>
                            <SelectItem value="activitypub">{t('search.filters.protocolOptions.mastodon')}</SelectItem>
                            <SelectItem value="atproto">{t('search.filters.protocolOptions.bluesky')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Language + Kind */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">{t('search.filters.language')}</span>
                        <Select value={language} onValueChange={(v) => setLanguage(v)}>
                          <SelectTrigger className="w-full bg-secondary/50 h-8 text-base md:text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="global">{t('search.filters.langOptions.global')}</SelectItem>
                            <SelectItem value="en">{t('search.filters.langOptions.en')}</SelectItem>
                            <SelectItem value="es">{t('search.filters.langOptions.es')}</SelectItem>
                            <SelectItem value="fr">{t('search.filters.langOptions.fr')}</SelectItem>
                            <SelectItem value="de">{t('search.filters.langOptions.de')}</SelectItem>
                            <SelectItem value="ja">{t('search.filters.langOptions.ja')}</SelectItem>
                            <SelectItem value="zh">{t('search.filters.langOptions.zh')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">{t('search.filters.kind')}</span>
                        <KindPicker value={kindFilter} options={kindOptions} onChange={(v) => setKindFilter(v)} />
                      </div>
                    </div>

                    {kindFilter === 'custom' && (
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={t('search.filters.kindCustomPlaceholder')}
                        value={customKindText}
                        onChange={(e) => setCustomKindText(e.target.value)}
                        className="bg-secondary/50 border-border focus-visible:ring-1 rounded-lg text-base md:text-xs h-8"
                      />
                    )}

                    {/* Include replies toggle */}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{t('search.filters.includeReplies')}</span>
                      <Switch checked={includeReplies} onCheckedChange={setIncludeReplies} className="scale-90" />
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Active filter summary chips (posts & agora tabs) */}
        {(activeTab === 'posts' || activeTab === 'agora') && activeFilterLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {activeFilterLabels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs font-normal">
                {label}
              </Badge>
            ))}
            <button
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {t('search.clear')}
            </button>
          </div>
        )}

        {/* NIP-50 search query debug block (posts & agora tabs) */}
        {(activeTab === 'posts' || activeTab === 'agora') && debouncedSearchQuery.trim() && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-2 px-3 py-2 rounded-md bg-secondary/40 border border-border cursor-default">
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    <span className="text-muted-foreground/60 mr-1">{t('search.searchLabel')}</span>
                    {nip50SearchString}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs font-mono break-all">
                {nip50SearchString}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <PullToRefresh onRefresh={handleRefresh}>
        {/* ─── Agora Tab ─── */}
        {activeTab === 'agora' && (
          <AgoraSearchTab
            searchQuery={debouncedSearchQuery}
            includeReplies={includeReplies}
            mediaType={mediaType}
            language={language}
            protocols={protocols}
            authorPubkeys={streamAuthorPubkeys}
            sort={sort}
            activeFilterLabels={activeFilterLabels}
            hasActiveFilters={hasActiveFilters}
            resetFilters={resetFilters}
          />
        )}

        {/* ─── Posts Tab ─── */}
        {activeTab === 'posts' && (
          <>
            {/* New posts pill — sticks below the SubHeaderBar arc, hides with nav.
                Mobile: top = MobileTopBar (2.5rem) + safe-area + SubHeaderBar (~2.5rem).
                Desktop: top = SubHeaderBar only (~2.5rem), no MobileTopBar. */}
            {newPostCount > 0 && (
              <div
                className={cn(
                  'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
                  'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
                )}
                style={{ marginBottom: '-3rem' }}
              >
                <button
                  onClick={() => {
                    flushStreamBuffer();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="pointer-events-auto px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  {t('search.newPosts', { count: newPostCount })}
                </button>
              </div>
            )}
            {/* Post results — stream */}
            {postsLoading && posts.length === 0 ? (
              <div className="mt-2 divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            ) : posts.length > 0 ? (
              <div className="mt-2">
                {posts.map((event) => {
                  const isNew = flushedIds.has(event.id);
                  if (isRepostKind(event.kind)) {
                    const embedded = parseRepostContent(event);
                    if (embedded) {
                      return <NoteCard key={event.id} event={embedded} repostedBy={event.pubkey} highlight={isNew} />;
                    }
                    return null;
                  }
                  return <NoteCard key={event.id} event={event} highlight={isNew} />;
                })}
              </div>
            ) : debouncedSearchQuery.trim() ? (
              <EmptyState
                message={t('search.empty.posts')}
                activeFilters={activeFilterLabels}
                onResetFilters={hasActiveFilters ? resetFilters : undefined}
              />
            ) : (
              <EmptyState message={t('search.empty.postsPrompt')} />
            )}
          </>
        )}

        {/* ─── Accounts Tab ─── */}
        {activeTab === 'accounts' && (
          <>
            <div>
              {debouncedSearchQuery.trim() ? (
                profilesLoading ? (
                  <div className="mt-2 divide-y divide-border">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <AccountSkeleton key={i} />
                    ))}
                  </div>
                ) : profiles && profiles.length > 0 ? (
                  <div className="mt-2 divide-y divide-border">
                    {profiles.map((profile) => (
                      <AccountItem key={profile.pubkey} profile={profile} isFollowed={followedPubkeys.has(profile.pubkey)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={t('search.empty.accounts')} />
                )
              ) : (
                <FollowsList />
              )}
            </div>
          </>
        )}
      </PullToRefresh>
    </main>
  );
}

/* ── Shared sub-components ── */

function AccountItem({ profile, isFollowed }: { profile: { pubkey: string; metadata: Record<string, unknown>; event?: { tags: string[][] } }; isFollowed: boolean }) {
  const { t } = useTranslation();
  const npub = useMemo(() => nip19.npubEncode(profile.pubkey), [profile.pubkey]);
  const metadata = profile.metadata as { name?: string; nip05?: string; picture?: string; about?: string; bot?: boolean };
  const displayName = metadata?.name || genUserName(profile.pubkey);
  const tags = profile.event?.tags ?? [];

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="relative shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
            title={t('search.following')}
          >
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[15px] truncate">
            <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
          </p>
          {metadata?.bot && <span className="text-xs" title={t('search.botAccount')}>🤖</span>}
        </div>
        {metadata?.nip05 && (
          <VerifiedNip05Text nip05={metadata.nip05} pubkey={profile.pubkey} className="text-sm text-muted-foreground truncate block" />
        )}
        {metadata?.about && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            <EmojifiedText tags={tags}>{metadata.about}</EmojifiedText>
          </p>
        )}
      </div>
    </Link>
  );
}

const FOLLOWS_PAGE_SIZE = 30;

function FollowsList() {
  const { t } = useTranslation();
  const { data: followData } = useFollowList();
  const pubkeys = useMemo(() => followData?.pubkeys ?? [], [followData]);
  const [visibleCount, setVisibleCount] = useState(FOLLOWS_PAGE_SIZE);
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '300px' });

  const visiblePubkeys = useMemo(() => pubkeys.slice(0, visibleCount), [pubkeys, visibleCount]);
  const hasMore = visibleCount < pubkeys.length;

  useEffect(() => {
    if (inView && hasMore) {
      setVisibleCount((c) => Math.min(c + FOLLOWS_PAGE_SIZE, pubkeys.length));
    }
  }, [inView, hasMore, pubkeys.length]);

  if (pubkeys.length === 0) {
    return <EmptyState message={t('search.empty.followsPrompt')} />;
  }

  return (
    <div className="mt-2 divide-y divide-border">
      {visiblePubkeys.map((pubkey) => (
        <FollowItem key={pubkey} pubkey={pubkey} />
      ))}
      {hasMore && (
        <div ref={sentinelRef}>
          {Array.from({ length: 3 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowItem({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const displayName = metadata?.name || genUserName(pubkey);
  const tags = author.data?.event?.tags ?? [];

  if (author.isLoading) {
    return <AccountSkeleton />;
  }

  return (
    <Link
      to={`/${npub}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <div className="relative shrink-0">
        <Avatar className="size-11">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
          title={t('search.following')}
        >
          <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[15px] truncate">
            <EmojifiedText tags={tags}>{displayName}</EmojifiedText>
          </p>
          {metadata?.bot && <span className="text-xs" title={t('search.botAccount')}>🤖</span>}
        </div>
        {metadata?.nip05 && (
          <VerifiedNip05Text nip05={metadata.nip05} pubkey={pubkey} className="text-sm text-muted-foreground truncate block" />
        )}
        {metadata?.about && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            <EmojifiedText tags={tags}>{metadata.about}</EmojifiedText>
          </p>
        )}
      </div>
    </Link>
  );
}

function EmptyState({
  message,
  activeFilters,
  onResetFilters,
}: {
  message: string;
  activeFilters?: string[];
  onResetFilters?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="py-16 px-8 text-center">
      <p className="text-muted-foreground">{message}</p>
      {activeFilters && activeFilters.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground/70 mb-2">{t('search.empty.activeFilters')}</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {activeFilters.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs font-normal">
                {label}
              </Badge>
            ))}
          </div>
          {onResetFilters && (
            <button
              onClick={onResetFilters}
              className="mt-3 text-xs text-primary hover:underline underline-offset-2 transition-colors"
            >
              {t('search.empty.clearAll')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="px-4 py-3">
      {/* Header: avatar + stacked name/handle — matches NoteCard layout */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      {/* Content */}
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Actions */}
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}

/**
 * Owns the raw keystroke state for the search box so that typing only
 * re-renders this small component, not the entire SearchPage.
 * Calls onDebouncedChange after 300 ms of inactivity.
 */
function SearchInput({
  initialValue,
  onDebouncedChange,
  className,
}: {
  initialValue: string;
  onDebouncedChange: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;

  // Sync if the parent resets the value (e.g. browser back/forward)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Debounce: call parent only after 300 ms of no typing
  useEffect(() => {
    const id = setTimeout(() => onDebouncedChangeRef.current(value), 300);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <div className={cn('relative flex-1', className)}>
      <Input
        type="text"
        placeholder={t('search.inputPlaceholder')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pr-10 bg-secondary/50 border-border focus-visible:ring-1 rounded-lg"
      />
      <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

/** Agora tab — isolated component so useStreamPosts only subscribes when active.
 *  Pins kinds to [33863 Campaigns, 36639 Pledges, 34550 Groups/Communities] —
 *  the non-kind-1 Agora content stream — and narrows to events whose NIP-89
 *  `client` tag is the running app name (e.g. "Eranos"). Kind 1 posts and the
 *  unconstrained Nostr firehose live on the Nostr tab instead. */
function AgoraSearchTab({
  searchQuery,
  includeReplies,
  mediaType,
  language,
  protocols,
  authorPubkeys,
  sort,
  activeFilterLabels,
  hasActiveFilters,
  resetFilters,
}: {
  searchQuery: string;
  includeReplies: boolean;
  mediaType: 'all' | 'images' | 'videos' | 'vines' | 'none';
  language: string;
  protocols: string[];
  authorPubkeys: string[] | undefined;
  sort: 'recent' | 'hot' | 'trending';
  activeFilterLabels: string[];
  hasActiveFilters: boolean;
  resetFilters: () => void;
}) {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const clientName = config.clientName ?? config.appName;
  const { posts, isLoading: postsLoading } = useStreamPosts(searchQuery, {
    includeReplies,
    mediaType,
    language,
    protocols,
    kindsOverride: [33863, 36639, 34550],
    authorPubkeys,
    sort,
    clientName,
  });

  if (postsLoading && posts.length === 0) {
    return (
      <div className="mt-2 divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length > 0) {
    return (
      <div className="mt-2">
        {posts.map((event) => (
          <NoteCard key={event.id} event={event} />
        ))}
      </div>
    );
  }

  if (searchQuery.trim()) {
    return (
      <EmptyState
        message={t('search.empty.agora')}
        activeFilters={activeFilterLabels}
        onResetFilters={hasActiveFilters ? resetFilters : undefined}
      />
    );
  }

  return <EmptyState message={t('search.empty.agoraPrompt')} />;
}
