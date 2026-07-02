/**
 * SavedFeedFiltersEditor
 *
 * A controlled component that renders filter controls for a standard
 * NIP-01 filter object (TabFilter). Used on the Search page filter
 * popover and in the Settings > Feed saved-feed edit panel.
 *
 * Edits the following filter fields:
 * - `kinds` (array of kind numbers)
 * - `authors` (array of pubkeys)
 * - `search` (NIP-50 search string)
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp,
  Hash, Search as SearchIcon,
  X, Check, User,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { useAuthor } from '@/hooks/useAuthor';
import { cn } from '@/lib/utils';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import type { UserList } from '@/hooks/useUserLists';
import type { FollowPack } from '@/hooks/useFollowPacks';

// ─── Types ───────────────────────────────────────────────────────────────────

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

// ─── Kind options (built once) ───────────────────────────────────────────────

import { AGORA_PRESET_KIND_VALUES } from '@/lib/feedFilterUtils';

// ─── useScrollCarets ─────────────────────────────────────────────────────────

function useScrollCarets() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
    update();
  }, [update]);

  const stopScroll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startScroll = useCallback((direction: 'up' | 'down') => {
    stopScroll();
    intervalRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return stopScroll();
      el.scrollBy({ top: direction === 'up' ? -8 : 8 });
      update();
      const atLimit = direction === 'up' ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (atLimit) stopScroll();
    }, 16);
  }, [update, stopScroll]);

  useEffect(() => stopScroll, [stopScroll]);

  return { refCallback, canScrollUp, canScrollDown, onScroll: update, startScroll, stopScroll };
}

// ─── KindPicker ──────────────────────────────────────────────────────────────

function KindScrollCaret({ direction, onMouseEnter, onMouseLeave }: {
  direction: 'up' | 'down';
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button
      className="flex cursor-default items-center justify-center py-0.5 w-full shrink-0 text-muted-foreground hover:text-foreground"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {direction === 'up' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

function KindPickerItem({ icon: Icon, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }> | null;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors text-left',
        active ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/60 text-foreground',
      )}
    >
      {Icon
        ? <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        : <span className="size-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
      {active && <Check className="size-3 shrink-0 ml-auto text-primary" />}
    </button>
  );
}

export function KindPicker({ value, options, onChange }: {
  value: string;
  options: KindOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { refCallback, canScrollUp, canScrollDown, onScroll, startScroll, stopScroll } = useScrollCarets();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description.toLowerCase().includes(q) || o.value.includes(q),
    );
  }, [options, search]);

  // Partition into Agora preset (top of picker) and the rest.
  // When the user is searching, we skip the partition and show a flat list.
  const presetSet = useMemo(() => new Set(AGORA_PRESET_KIND_VALUES), []);
  const { presetOptions, otherOptions } = useMemo(() => {
    if (search) return { presetOptions: [], otherOptions: filtered };
    const preset: KindOption[] = [];
    const other: KindOption[] = [];
    // Preserve AGORA_PRESET_KIND_VALUES order for the preset section.
    const byValue = new Map(filtered.map((o) => [o.value, o]));
    for (const v of AGORA_PRESET_KIND_VALUES) {
      const opt = byValue.get(v);
      if (opt) preset.push(opt);
    }
    for (const o of filtered) {
      if (!presetSet.has(o.value)) other.push(o);
    }
    return { presetOptions: preset, otherOptions: other };
  }, [filtered, presetSet, search]);

  const selected = value === 'all' || value === 'agora' || value === 'custom' ? null : options.find((o) => o.value === value);
  const SelectedIcon = selected?.icon;

  const handleSelect = (v: string) => { onChange(v); setOpen(false); setSearch(''); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full h-8 px-2.5 rounded-md border bg-secondary/50 text-xs flex items-center gap-1.5 text-left transition-colors hover:bg-secondary border-border',
            open && 'border-ring ring-1 ring-ring',
          )}
        >
          {SelectedIcon
            ? <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" />
            : <Hash className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="flex-1 truncate">
            {value === 'all'
              ? 'All kinds'
              : value === 'agora'
                ? 'Eranos content'
                : value === 'custom'
                  ? 'Custom...'
                  : (selected?.label ?? value)}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(280px, var(--radix-popover-content-available-height, 280px))' }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border shrink-0">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 text-base md:text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search kinds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </div>
        {canScrollUp && <KindScrollCaret direction="up" onMouseEnter={() => startScroll('up')} onMouseLeave={stopScroll} />}
        <div ref={refCallback} className="overflow-y-auto flex-1 min-h-0" onScroll={onScroll}>
          {!search && (
            <>
              <KindPickerItem icon={null} label="Eranos content" active={value === 'agora'} onClick={() => handleSelect('agora')} />
              <KindPickerItem icon={null} label="All kinds" active={value === 'all'} onClick={() => handleSelect('all')} />
            </>
          )}
          {!search && presetOptions.length > 0 && (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Eranos content
              </div>
              {presetOptions.map((opt) => (
                <KindPickerItem key={opt.value} icon={opt.icon ?? null} label={opt.label} active={value === opt.value} onClick={() => handleSelect(opt.value)} />
              ))}
              {otherOptions.length > 0 && (
                <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  All kinds
                </div>
              )}
            </>
          )}
          {otherOptions.map((opt) => (
            <KindPickerItem key={opt.value} icon={opt.icon ?? null} label={opt.label} active={value === opt.value} onClick={() => handleSelect(opt.value)} />
          ))}
          {(!search || 'custom'.includes(search.toLowerCase())) && (
            <KindPickerItem icon={Hash} label="Custom kind..." active={value === 'custom'} onClick={() => handleSelect('custom')} />
          )}
          {filtered.length === 0 && search && (
            <p className="text-xs text-muted-foreground text-center py-4">No kinds match</p>
          )}
        </div>
        {canScrollDown && <KindScrollCaret direction="down" onMouseEnter={() => startScroll('down')} onMouseLeave={stopScroll} />}
      </PopoverContent>
    </Popover>
  );
}

// ─── MultiKindPicker ─────────────────────────────────────────────────────────

// ─── ScopeToggle ─────────────────────────────────────────────────────────────

// ─── ListPackPicker ───────────────────────────────────────────────────────────

interface ListPackPickerProps {
  lists: UserList[];
  followPacks: FollowPack[];
  value: string;
  onSelectPubkeys: (pubkeys: string[]) => void;
  className?: string;
}

/**
 * A <Select> that lets the user pick a Follow Set or Follow Pack to populate
 * author pubkeys. Used in FeedEditModal, SavedFeedFiltersEditor, and SearchPage.
 */
export function ListPackPicker({ lists, followPacks, value, onSelectPubkeys, className }: ListPackPickerProps) {
  const hasAny = lists.length > 0 || followPacks.length > 0;
  if (!hasAny) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        let pubkeys: string[] = [];
        if (v.startsWith('set:')) {
          pubkeys = lists.find((l) => l.id === v.slice(4))?.pubkeys ?? [];
        } else if (v.startsWith('pack:')) {
          pubkeys = followPacks.find((p) => p.id === v.slice(5))?.pubkeys ?? [];
        }
        if (pubkeys.length > 0) onSelectPubkeys(pubkeys);
      }}
    >
      <SelectTrigger className={cn('w-full bg-secondary/50 h-8 text-base md:text-xs', className)}>
        <SelectValue placeholder="Or choose a list..." />
      </SelectTrigger>
      <SelectContent>
        {lists.length > 0 && (
          <SelectGroup>
            {followPacks.length > 0 && <SelectLabel>Lists</SelectLabel>}
            {lists.map((l) => (
              <SelectItem key={`set:${l.id}`} value={`set:${l.id}`}>
                {l.title} ({l.pubkeys.length})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {followPacks.length > 0 && (
          <SelectGroup>
            {lists.length > 0 && <SelectLabel>Follow Packs</SelectLabel>}
            {followPacks.map((p) => (
              <SelectItem key={`pack:${p.id}`} value={`pack:${p.id}`}>
                {p.title} ({p.pubkeys.length})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

// ─── parseSelectedKinds ───────────────────────────────────────────────────────



// ─── AuthorChip ───────────────────────────────────────────────────────────────

export function AuthorChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const hexPubkey = useMemo(() => {
    if (/^[0-9a-f]{64}$/i.test(pubkey)) return pubkey;
    try { const d = nip19.decode(pubkey); return d.type === 'npub' ? d.data : pubkey; } catch { return pubkey; }
  }, [pubkey]);
  const author = useAuthor(hexPubkey);
  const name = author.data?.metadata?.name || author.data?.metadata?.display_name || pubkey.slice(0, 10) + '...';
  const picture = author.data?.metadata?.picture;
  return (
    <span className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full bg-secondary border border-border text-xs max-w-[160px]">
      {picture
        ? <img src={picture} alt="" className="size-4 rounded-full shrink-0 object-cover" />
        : <User className="size-3 shrink-0 text-muted-foreground" />}
      <span className="truncate">{name}</span>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label="Remove">
        <X className="size-3" />
      </button>
    </span>
  );
}

// ─── AuthorFilterDropdown ─────────────────────────────────────────────────────

export function AuthorFilterDropdown({ onCommit }: { onCommit: (pubkey: string, _label: string) => void }) {
  const handleSelect = useCallback((profile: SearchProfile) => {
    const label = profile.metadata.name || profile.metadata.display_name || profile.pubkey.slice(0, 16) + '...';
    onCommit(profile.pubkey, label);
  }, [onCommit]);

  return (
    <ProfileSearchDropdown
      placeholder="Search by name or npub..."
      onSelect={handleSelect}
      hideCountry
      inputClassName="rounded-lg bg-secondary/50 border border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 text-base md:text-sm h-9"
      className="w-full"
    />
  );
}

// ─── Helper: parse kinds from filter ──────────────────────────────────────────

// ─── SavedFeedFiltersEditor ───────────────────────────────────────────────────

