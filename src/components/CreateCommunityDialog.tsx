import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Upload, Loader2, X, Search } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { COMMUNITY_DEFINITION_KIND, BADGE_DEFINITION_KIND } from '@/lib/communityUtils';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert text into a URL-safe slug for the d-tag identifier. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateCommunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateCommunityDialog({ open, onOpenChange }: CreateCommunityDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [moderators, setModerators] = useState<SearchProfile[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  // Derived
  const effectiveSlug = slugify(name);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setImageUrl('');
    setImagePreview('');
    setModerators([]);
    setIsPublishing(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  // ── Image upload ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const [[, url]] = await uploadFile(file);
      setImageUrl(url);
      toast({ title: 'Image uploaded' });
    } catch {
      setImagePreview('');
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  }, [uploadFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Moderator management ──────────────────────────────────────────────────

  const addModerator = useCallback((profile: SearchProfile) => {
    if (!user) return;
    // Don't add the founder as a moderator (they're already founder)
    if (profile.pubkey === user.pubkey) {
      toast({ title: 'Already the founder', description: 'You are automatically the founder of this community.' });
      return;
    }
    // Don't add duplicates
    if (moderators.some((m) => m.pubkey === profile.pubkey)) {
      toast({ title: 'Already added', description: 'This person is already a moderator.' });
      return;
    }
    setModerators((prev) => [...prev, profile]);
  }, [user, moderators, toast]);

  const removeModerator = useCallback((pubkey: string) => {
    setModerators((prev) => prev.filter((m) => m.pubkey !== pubkey));
  }, []);

  // ── Publish ───────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!user || !name.trim() || !effectiveSlug) return;

    setIsPublishing(true);
    try {
      // 1. Check for d-tag collision (same author, same kind, same d-tag)
      const existing = await nostr.query([{
        kinds: [COMMUNITY_DEFINITION_KIND],
        authors: [user.pubkey],
        '#d': [effectiveSlug],
        limit: 1,
      }]);

      if (existing.length > 0) {
        toast({
          title: 'Name already in use',
          description: 'You already have a community with this name. Please choose a different name.',
          variant: 'destructive',
        });
        setIsPublishing(false);
        return;
      }

      // 2. Publish badge definition for the "Member" rank (kind 30009)
      const badgeDTag = `${effectiveSlug}-member`;

      const badgeEvent = await publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: '',
        tags: [
          ['d', badgeDTag],
          ['name', 'Member'],
          ['description', `Member of ${name.trim()}`],
          ['alt', `Badge definition: Member of ${name.trim()}`],
        ],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // 3. Build community definition tags
      const communityTags: string[][] = [
        ['d', effectiveSlug],
        ['name', name.trim()],
      ];

      if (description.trim()) {
        communityTags.push(['description', description.trim()]);
      }

      if (imageUrl) {
        communityTags.push(['image', imageUrl]);
      }

      // Badge a-tag with rank index 1 (Member)
      communityTags.push([
        'a',
        `${BADGE_DEFINITION_KIND}:${badgeEvent.pubkey}:${badgeDTag}`,
        '',
        '1',
      ]);

      // Founder as moderator (p tag)
      communityTags.push(['p', user.pubkey, '', 'moderator']);

      // Additional moderators
      for (const mod of moderators) {
        communityTags.push(['p', mod.pubkey, '', 'moderator']);
      }

      communityTags.push(['alt', `Community: ${name.trim()}`]);

      // 4. Publish community definition (kind 34550)
      const communityEvent = await publishEvent({
        kind: COMMUNITY_DEFINITION_KIND,
        content: '',
        tags: communityTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // 5. Navigate to the new community
      const naddr = nip19.naddrEncode({
        kind: COMMUNITY_DEFINITION_KIND,
        pubkey: communityEvent.pubkey,
        identifier: effectiveSlug,
      });

      toast({ title: 'Community created!' });
      handleOpenChange(false);
      navigate(`/${naddr}`);
    } catch (err) {
      toast({
        title: 'Failed to create community',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [user, name, effectiveSlug, description, imageUrl, moderators, nostr, publishEvent, toast, handleOpenChange, navigate]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Create a Community
          </DialogTitle>
          <DialogDescription>
            Start a new community on Nostr. You'll be the founder.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-5 pb-5 space-y-4">
            {/* Community name */}
            <div className="space-y-1.5">
              <Label htmlFor="community-name">Community Name *</Label>
              <Input
                id="community-name"
                placeholder="e.g. The Arbiter's Guard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              {name.trim() && (
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {effectiveSlug || '...'}
                </p>
              )}
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <Label>
                Community Image
                <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
              </Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer overflow-hidden"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Community image preview" className="w-full h-full object-cover" />
                ) : isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                    <span className="text-xs">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="size-6 opacity-40" />
                    <span className="text-xs">Drop an image or click to upload</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="community-description">
                Description
                <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
              </Label>
              <Textarea
                id="community-description"
                placeholder="What is this community about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Moderators */}
            <div className="space-y-1.5">
              <Label>
                Moderators
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </Label>
              <ModeratorPicker
                moderators={moderators}
                onAdd={addModerator}
                onRemove={removeModerator}
                founderPubkey={user.pubkey}
              />
            </div>

            {/* Create button */}
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !effectiveSlug || isPublishing || isUploading}
              className="w-full gap-2"
            >
              {isPublishing ? (
                <><Loader2 className="size-4 animate-spin" /> Creating...</>
              ) : (
                <><Users className="size-4" /> Create Community</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

/** Inline type-ahead search to add moderators. */
function ModeratorPicker({
  moderators,
  onAdd,
  onRemove,
  founderPubkey,
}: {
  moderators: SearchProfile[];
  onAdd: (profile: SearchProfile) => void;
  onRemove: (pubkey: string) => void;
  founderPubkey: string;
}) {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: profiles, isFetching } = useSearchProfiles(query);

  // Filter out the founder and already-added moderators
  const filteredProfiles = (profiles ?? []).filter(
    (p) => p.pubkey !== founderPubkey && !moderators.some((m) => m.pubkey === p.pubkey),
  );

  // Show dropdown when there are results
  useEffect(() => {
    if (query.trim().length > 0 && filteredProfiles.length > 0) {
      setDropdownOpen(true);
    } else if (query.trim().length === 0) {
      setDropdownOpen(false);
    }
  }, [filteredProfiles, query]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((profile: SearchProfile) => {
    onAdd(profile);
    setQuery('');
    setDropdownOpen(false);
    inputRef.current?.focus();
  }, [onAdd]);

  return (
    <div className="space-y-2">
      {/* Added moderators list */}
      {moderators.length > 0 && (
        <div className="space-y-1">
          {moderators.map((mod) => (
            <ModeratorChip key={mod.pubkey} profile={mod} onRemove={onRemove} />
          ))}
        </div>
      )}

      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
          {isFetching && query.trim() && (
            <Loader2 className="absolute right-3 size-4 text-muted-foreground animate-spin" />
          )}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (query.trim().length > 0 && filteredProfiles.length > 0) {
                setDropdownOpen(true);
              }
            }}
            placeholder="Search people to add..."
            className="pl-10 pr-10 rounded-full bg-secondary border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-sm"
            autoComplete="off"
          />
        </div>

        {/* Results dropdown — opens upward so it doesn't get clipped by the ScrollArea */}
        {dropdownOpen && filteredProfiles.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150">
            <div className="max-h-[200px] overflow-y-auto py-1">
              {filteredProfiles.map((profile) => (
                <ModeratorSearchItem
                  key={profile.pubkey}
                  profile={profile}
                  onClick={handleSelect}
                />
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {dropdownOpen && query.trim().length >= 2 && !isFetching && filteredProfiles.length === 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150">
            <div className="py-4 text-center text-sm text-muted-foreground">
              No people found
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A single moderator chip with a remove button. */
function ModeratorChip({ profile, onRemove }: { profile: SearchProfile; onRemove: (pubkey: string) => void }) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border/50">
      <Avatar shape={getAvatarShape(metadata)} className="size-7 shrink-0">
        <AvatarImage src={metadata.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm truncate">
        <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
      </span>
      <button
        type="button"
        onClick={() => onRemove(pubkey)}
        className="shrink-0 size-6 rounded-full hover:bg-destructive/10 flex items-center justify-center transition-colors"
        title="Remove moderator"
      >
        <X className="size-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

/** A profile search result item in the moderator picker dropdown. */
function ModeratorSearchItem({ profile, onClick }: { profile: SearchProfile; onClick: (profile: SearchProfile) => void }) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);

  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60',
      )}
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-8 shrink-0">
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
