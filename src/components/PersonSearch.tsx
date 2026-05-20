import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2, Search, PartyPopper } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useToast } from '@/hooks/useToast';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useSearchPeopleLists, type PeopleListSearchResult } from '@/hooks/useSearchPeopleLists';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function makeFallbackProfile(pubkey: string): SearchProfile {
  return {
    pubkey,
    metadata: {},
    event: {
      id: '',
      pubkey,
      created_at: 0,
      kind: 0,
      tags: [],
      content: '{}',
      sig: '',
    },
  };
}

function profileFromEvent(event: NostrEvent): SearchProfile {
  const parsed = parseAuthorEvent(event);
  return { pubkey: event.pubkey, metadata: parsed.metadata ?? {}, event };
}

/** Inline type-ahead person search. */
export function PersonSearch({
  onAdd,
  onAddMany,
  excludePubkeys,
}: {
  onAdd: (profile: SearchProfile) => void;
  onAddMany: (profiles: SearchProfile[], sourceTitle?: string) => void;
  excludePubkeys: string[];
}) {
  const { nostr } = useNostr();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isAddingPack, setIsAddingPack] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: profiles, isFetching } = useSearchProfiles(query);
  const { data: peopleLists, isFetching: isFetchingPeopleLists } = useSearchPeopleLists(query);

  const excludeSet = useMemo(() => new Set(excludePubkeys), [excludePubkeys]);
  const filteredProfiles = useMemo(
    () => (profiles ?? []).filter((p) => !excludeSet.has(p.pubkey)),
    [profiles, excludeSet],
  );
  const filteredPeopleLists = useMemo(
    () => (peopleLists ?? []).filter((pack) => pack.pubkeys.some((pubkey) => isHexPubkey(pubkey) && !excludeSet.has(pubkey.toLowerCase()))),
    [peopleLists, excludeSet],
  );
  const hasResults = filteredProfiles.length > 0 || filteredPeopleLists.length > 0;
  const isSearching = isFetching || isFetchingPeopleLists || isAddingPack;

  useEffect(() => {
    if (query.trim().length > 0 && hasResults) {
      setDropdownOpen(true);
    } else if (query.trim().length === 0) {
      setDropdownOpen(false);
    }
  }, [hasResults, query]);

  const handleSelect = useCallback((profile: SearchProfile) => {
    onAdd(profile);
    setQuery('');
    setDropdownOpen(false);
    inputRef.current?.focus();
  }, [onAdd]);

  const handleSelectPeopleList = useCallback(async (pack: PeopleListSearchResult) => {
    const eligiblePubkeys = Array.from(new Set(
      pack.pubkeys
        .map((pubkey) => pubkey.toLowerCase())
        .filter((pubkey) => isHexPubkey(pubkey) && !excludeSet.has(pubkey)),
    ));

    if (eligiblePubkeys.length === 0) {
      toast({ title: 'No new people to add', description: 'Everyone in that follow pack is already included.' });
      return;
    }

    if (eligiblePubkeys.length > 20 && !window.confirm(`Add ${eligiblePubkeys.length} people from ${pack.title}?`)) {
      return;
    }

    setIsAddingPack(true);
    try {
      const events = await nostr.query(
        [{ kinds: [0], authors: eligiblePubkeys, limit: eligiblePubkeys.length }],
        { signal: AbortSignal.timeout(8000) },
      );

      const latestByPubkey = new Map<string, NostrEvent>();
      for (const event of events) {
        const existing = latestByPubkey.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) latestByPubkey.set(event.pubkey, event);
      }

      const profilesToAdd = eligiblePubkeys.map((pubkey) => {
        const event = latestByPubkey.get(pubkey);
        return event ? profileFromEvent(event) : makeFallbackProfile(pubkey);
      });

      onAddMany(profilesToAdd, pack.title);
      setQuery('');
      setDropdownOpen(false);
      inputRef.current?.focus();
    } catch (error) {
      toast({
        title: 'Failed to load follow pack members',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAddingPack(false);
    }
  }, [excludeSet, nostr, onAddMany, toast]);

  return (
    <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
          {isSearching && query.trim() && (
            <Loader2 className="absolute right-3 size-4 text-muted-foreground animate-spin" />
          )}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (query.trim().length > 0 && hasResults) {
                setDropdownOpen(true);
              }
            }}
            placeholder="Search people..."
            className="pl-10 pr-10 rounded-full bg-secondary border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-sm"
            autoComplete="off"
          />
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[270] w-[var(--radix-popover-trigger-width)] rounded-xl border-border p-0 shadow-lg overflow-hidden"
      >
        {hasResults ? (
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filteredProfiles.map((profile) => (
              <SearchResultItem key={profile.pubkey} profile={profile} onClick={handleSelect} />
            ))}
            {filteredPeopleLists.map((pack) => (
              <PeopleListSearchResultItem key={`${pack.event.kind}:${pack.event.pubkey}:${pack.event.tags.find(([name]) => name === 'd')?.[1] ?? pack.event.id}`} pack={pack} onClick={handleSelectPeopleList} />
            ))}
          </div>
        ) : query.trim().length >= 2 && !isSearching ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No people or follow packs found
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** A follow pack / follow set search result row. */
function PeopleListSearchResultItem({ pack, onClick }: { pack: PeopleListSearchResult; onClick: (pack: PeopleListSearchResult) => void }) {
  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60"
      onClick={() => onClick(pack)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="size-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <PartyPopper className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{pack.title}</span>
        <span className="text-xs text-muted-foreground truncate block">
          Follow pack · {pack.pubkeys.length} people
        </span>
      </div>
    </button>
  );
}

/** A profile search result row. */
function SearchResultItem({ profile, onClick }: { profile: SearchProfile; onClick: (profile: SearchProfile) => void }) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);

  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60"
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={metadata.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
        </span>
        {metadata.nip05 && (
          <span className="text-xs text-muted-foreground truncate block">
            {metadata.nip05.startsWith('_@') ? metadata.nip05.slice(2) : metadata.nip05}
          </span>
        )}
      </div>
    </button>
  );
}
