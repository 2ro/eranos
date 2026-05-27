import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useAuthor } from '@/hooks/useAuthor';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface BitcoinRecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resolvedPubkey?: string;
}

function shouldSkipProfileSearch(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) return true;

  // Keep Bitcoin and silent-payment recipients as plain text. npub/nprofile
  // intentionally still search so pasted Nostr IDs can resolve to a person row.
  return (
    lower.startsWith('bc1') ||
    lower.startsWith('sp1') ||
    lower.startsWith('bitcoin:') ||
    lower.startsWith('1') ||
    lower.startsWith('3')
  );
}

export function BitcoinRecipientInput({ value, onChange, placeholder, resolvedPubkey }: BitcoinRecipientInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = shouldSkipProfileSearch(value) ? '' : value;
  const { data: profiles, isFetching } = useSearchProfiles(searchQuery);

  const filteredProfiles = useMemo(
    () => (profiles ?? []).slice(0, 6),
    [profiles],
  );
  const hasResults = filteredProfiles.length > 0;
  const shouldShowSearch = searchQuery.trim().length > 0;

  useEffect(() => {
    if (shouldShowSearch && hasResults) {
      setDropdownOpen(true);
    } else if (!shouldShowSearch) {
      setDropdownOpen(false);
    }
  }, [hasResults, shouldShowSearch]);

  const selectProfile = (profile: SearchProfile) => {
    onChange(nip19.npubEncode(profile.pubkey));
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <PopoverTrigger asChild>
          <div className="relative flex items-center">
            <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
            {isFetching && shouldShowSearch && (
              <Loader2 className="absolute right-3 size-4 text-muted-foreground animate-spin" />
            )}
            <Input
              ref={inputRef}
              id="hd-recipient-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => {
                if (shouldShowSearch && hasResults) setDropdownOpen(true);
              }}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              className="pl-10 pr-10 font-mono text-base md:text-sm"
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
          {hasResults && (
            <div className="max-h-[200px] overflow-y-auto py-1">
              {filteredProfiles.map((profile) => (
                <RecipientSearchResult key={profile.pubkey} profile={profile} onClick={selectProfile} />
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {resolvedPubkey && <ResolvedRecipientPreview pubkey={resolvedPubkey} />}
    </div>
  );
}

function ResolvedRecipientPreview({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const avatarUrl = sanitizeUrl(metadata?.picture);
  const encoded = nip19.npubEncode(pubkey);
  const fallbackLabel = `${encoded.slice(0, 12)}…${encoded.slice(-8)}`;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block">{displayName}</span>
        <span className="text-xs text-muted-foreground truncate block">
          {metadata?.nip05?.startsWith('_@') ? metadata.nip05.slice(2) : metadata?.nip05 || fallbackLabel}
        </span>
      </div>
    </div>
  );
}

function RecipientSearchResult({ profile, onClick }: { profile: SearchProfile; onClick: (profile: SearchProfile) => void }) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const avatarUrl = sanitizeUrl(metadata.picture);

  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60"
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
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
