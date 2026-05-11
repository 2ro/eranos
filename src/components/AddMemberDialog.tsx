import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { UserPlus, Loader2, X, Search, Crown, Users, PartyPopper } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { ImageUploadField } from '@/components/ImageUploadField';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useSearchPeopleLists, type PeopleListSearchResult } from '@/hooks/useSearchPeopleLists';
import { PortalContainerProvider } from '@/hooks/usePortalContainer';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  COMMUNITY_DEFINITION_KIND,
  BADGE_DEFINITION_KIND,
  BADGE_AWARD_KIND,
  EMPTY_MODERATION,
  type CommunityMember,
  type CommunityMembership,
  type CommunityModeration,
  type ParsedCommunity,
} from '@/lib/communityUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRole = 'moderator' | 'member';

interface PendingMember {
  profile: SearchProfile;
  role: MemberRole;
}

interface BadgeRef {
  pubkey: string;
  identifier: string;
}

interface CommunityMembersCacheValue {
  membership: CommunityMembership;
  moderation: CommunityModeration;
  rankMap: Map<string, CommunityMember>;
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The raw community definition event. */
  communityEvent: NostrEvent;
  /** Parsed community data. */
  community: ParsedCommunity;
  /** Whether the current user is the founder (can add moderators). */
  isFounder: boolean;
  /** Existing active members and moderators, excluded from duplicate adds. */
  existingMemberPubkeys: string[];
}

function parseBadgeATag(aTag: string | undefined): BadgeRef | undefined {
  if (!aTag) return undefined;
  const [kind, pubkey, ...identifierParts] = aTag.split(':');
  const identifier = identifierParts.join(':');
  if (kind !== String(BADGE_DEFINITION_KIND) || !pubkey || !identifier) return undefined;
  return { pubkey, identifier };
}

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

// ── Component ─────────────────────────────────────────────────────────────────

export function AddMemberDialog({
  open,
  onOpenChange,
  communityEvent,
  community,
  isFounder,
  existingMemberPubkeys,
}: AddMemberDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [badgeImageUrl, setBadgeImageUrl] = useState('');
  const [isBadgeImageUploading, setIsBadgeImageUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);

  const dialogContentRef = useCallback((node: HTMLElement | null) => {
    setPortalContainer(node ?? undefined);
  }, []);

  // Mutations
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Does this community already have a member badge definition?
  const existingBadgeATag = community.memberBadgeATag;
  const hasBadge = !!existingBadgeATag;
  const existingBadgeRef = useMemo(() => parseBadgeATag(existingBadgeATag), [existingBadgeATag]);
  const existingBadgeRefs = useMemo(() => existingBadgeRef ? [existingBadgeRef] : [], [existingBadgeRef]);
  const { badgeMap, isLoading: isBadgeLoading, isError: isBadgeError } = useBadgeDefinitions(existingBadgeRefs);
  const existingBadge = existingBadgeATag ? badgeMap.get(existingBadgeATag) : undefined;

  // Are there any pending members with the "member" role?
  const hasPendingMembers = pendingMembers.some((m) => m.role === 'member');
  // Will we need to create a badge? (members added + no badge exists yet)
  const needsBadgeCreation = hasPendingMembers && !hasBadge;

  const resetForm = useCallback(() => {
    setPendingMembers([]);
    setBadgeImageUrl('');
    setIsBadgeImageUploading(false);
    setIsPublishing(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  // ── People management ─────────────────────────────────────────────────────

  const addPerson = useCallback((profile: SearchProfile) => {
    if (!user) return;
    if (profile.pubkey === community.founderPubkey) {
      toast({ title: 'Already the founder' });
      return;
    }
    if (existingMemberPubkeys.includes(profile.pubkey)) {
      toast({ title: 'Already in the community' });
      return;
    }
    if (pendingMembers.some((m) => m.profile.pubkey === profile.pubkey)) {
      toast({ title: 'Already added' });
      return;
    }
    setPendingMembers((prev) => [...prev, { profile, role: 'member' }]);
  }, [user, community.founderPubkey, existingMemberPubkeys, pendingMembers, toast]);

  const addPeople = useCallback((profiles: SearchProfile[], sourceTitle?: string) => {
    if (!user) return;

    const excluded = new Set([
      community.founderPubkey,
      ...existingMemberPubkeys,
      ...pendingMembers.map((m) => m.profile.pubkey),
    ]);
    const nextProfiles: SearchProfile[] = [];

    for (const profile of profiles) {
      if (excluded.has(profile.pubkey)) continue;
      excluded.add(profile.pubkey);
      nextProfiles.push(profile);
    }

    if (nextProfiles.length === 0) {
      toast({ title: 'No new people to add', description: 'Everyone in that follow pack is already included.' });
      return;
    }

    setPendingMembers((prev) => [...prev, ...nextProfiles.map((profile) => ({ profile, role: 'member' as const }))]);
    if (sourceTitle) {
      toast({ title: `Added ${nextProfiles.length} from ${sourceTitle}` });
    }
  }, [user, community.founderPubkey, existingMemberPubkeys, pendingMembers, toast]);

  const removePerson = useCallback((pubkey: string) => {
    setPendingMembers((prev) => prev.filter((m) => m.profile.pubkey !== pubkey));
  }, []);

  const setRole = useCallback((pubkey: string, role: MemberRole) => {
    if (!isFounder) return; // Only founder can appoint moderators
    setPendingMembers((prev) => prev.map((m) =>
      m.profile.pubkey === pubkey
        ? { ...m, role }
        : m,
    ));
  }, [isFounder]);

  const applyOptimisticMembership = useCallback((members: PendingMember[], awardEvents: Map<string, NostrEvent>) => {
    queryClient.setQueryData<CommunityMembersCacheValue>(['community-members', community.aTag], (prev) => {
      const moderation = prev?.moderation ?? EMPTY_MODERATION;
      const rankMap = new Map(prev?.rankMap ?? []);
      const membershipByPubkey = new Map(
        (prev?.membership.members ?? []).map((member) => [member.pubkey, member] as const),
      );

      const seedRankZero = (pubkey: string) => {
        if (moderation.bannedPubkeys.has(pubkey)) return;
        const member: CommunityMember = { pubkey, rank: 0 };
        if (!membershipByPubkey.has(pubkey)) membershipByPubkey.set(pubkey, member);
        if (!rankMap.has(pubkey)) rankMap.set(pubkey, member);
      };

      seedRankZero(community.founderPubkey);
      community.moderatorPubkeys.forEach(seedRankZero);

      for (const pending of members) {
        if (moderation.bannedPubkeys.has(pending.profile.pubkey)) continue;

        const nextMember: CommunityMember = pending.role === 'moderator'
          ? { pubkey: pending.profile.pubkey, rank: 0 }
          : {
              pubkey: pending.profile.pubkey,
              rank: 1,
              awardEvent: awardEvents.get(pending.profile.pubkey),
              awardedBy: user?.pubkey,
            };

        const current = membershipByPubkey.get(nextMember.pubkey);
        if (!current || nextMember.rank < current.rank) {
          membershipByPubkey.set(nextMember.pubkey, nextMember);
        }

        const currentRank = rankMap.get(nextMember.pubkey);
        if (!currentRank || nextMember.rank < currentRank.rank) {
          rankMap.set(nextMember.pubkey, nextMember);
        }
      }

      const membership: CommunityMembership = {
        members: Array.from(membershipByPubkey.values()).sort((a, b) => a.rank - b.rank),
      };

      return { membership, moderation, rankMap };
    });
  }, [community.aTag, community.founderPubkey, community.moderatorPubkeys, queryClient, user?.pubkey]);

  // ── Publish ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!user || pendingMembers.length === 0) return;
    if (isBadgeImageUploading) {
      toast({ title: 'Image is still uploading', description: 'Please wait for the upload to finish.' });
      return;
    }
    if (badgeImageUrl.trim() && !sanitizeUrl(badgeImageUrl.trim())) {
      toast({ title: 'Image URL must be a valid https URL', variant: 'destructive' });
      return;
    }
    if (needsBadgeCreation && !isFounder) {
      toast({ title: 'Member badge is missing', description: 'Only the founder can initialize community membership.', variant: 'destructive' });
      return;
    }

    setIsPublishing(true);
    try {
      const newModerators = pendingMembers.filter((m) => m.role === 'moderator');
      const newMembers = pendingMembers.filter((m) => m.role === 'member');

      let badgeATag = existingBadgeATag;

      // Step 1: Create badge definition if needed
      if (newMembers.length > 0 && !hasBadge) {
        const badgeDTag = `${community.dTag}-member`;
        const existingBadge = await nostr.query([{
          kinds: [BADGE_DEFINITION_KIND],
          authors: [user.pubkey],
          '#d': [badgeDTag],
          limit: 1,
        }]);

        if (existingBadge.length > 0) {
          toast({
            title: 'Member badge ID already in use',
            description: 'This community needs a member badge, but that badge identifier already exists on your account.',
            variant: 'destructive',
          });
          setIsPublishing(false);
          return;
        }

        const badgeTags: string[][] = [
          ['d', badgeDTag],
          ['name', 'Member'],
          ['description', `Member of ${community.name}`],
        ];
        const sanitizedBadgeImage = sanitizeUrl(badgeImageUrl.trim());
        if (sanitizedBadgeImage) {
          badgeTags.push(['image', sanitizedBadgeImage, '1024x1024']);
        }
        badgeTags.push(['alt', `Badge definition: Member of ${community.name}`]);

        const badgeEvent = await publishEvent({
          kind: BADGE_DEFINITION_KIND,
          content: '',
          tags: badgeTags,
        } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

        badgeATag = `${BADGE_DEFINITION_KIND}:${badgeEvent.pubkey}:${badgeDTag}`;
      }

      // Step 2: Republish community definition if needed
      // Needed when: adding moderators (new p tags) OR badge was just created (new a tag)
      const needsCommunityUpdate = newModerators.length > 0 || (newMembers.length > 0 && !hasBadge);

      if (needsCommunityUpdate) {
        // Fetch fresh community event to avoid stale overwrites
        const prev = await fetchFreshEvent(nostr, {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [communityEvent.pubkey],
          '#d': [community.dTag],
        });

        const baseTags = prev?.tags ?? communityEvent.tags;
        const updatedTags = [...baseTags];

        // Add new moderator p tags
        for (const mod of newModerators) {
          // Don't add if already exists
          const exists = updatedTags.some(
            ([n, v, , role]) => n === 'p' && v === mod.profile.pubkey && role === 'moderator',
          );
          if (!exists) {
            updatedTags.push(['p', mod.profile.pubkey, '', 'moderator']);
          }
        }

        // Add badge a tag if badge was just created
        if (badgeATag && !hasBadge) {
          updatedTags.push(['a', badgeATag, '', 'member']);
        }

        const updatedEvent = await publishEvent({
          kind: COMMUNITY_DEFINITION_KIND,
          content: prev?.content ?? '',
          tags: updatedTags,
          prev: prev ?? undefined,
        } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> & { prev?: NostrEvent });

        queryClient.setQueryData(
          ['addr-event', COMMUNITY_DEFINITION_KIND, communityEvent.pubkey, community.dTag],
          updatedEvent,
        );
        queryClient.setQueryData(['event', updatedEvent.id], updatedEvent);
      }

      // Step 3: Publish badge awards for each member
      const memberAwardEvents = new Map<string, NostrEvent>();
      if (newMembers.length > 0 && badgeATag) {
        for (const member of newMembers) {
          const awardEvent = await publishEvent({
            kind: BADGE_AWARD_KIND,
            content: '',
            tags: [
              ['a', badgeATag],
              ['p', member.profile.pubkey],
              ['alt', `Badge award: Member in ${community.name}`],
            ],
          } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
          memberAwardEvents.set(member.profile.pubkey, awardEvent);
        }
      }

      applyOptimisticMembership(pendingMembers, memberAwardEvents);
      queryClient.invalidateQueries({ queryKey: ['addr-event', COMMUNITY_DEFINITION_KIND, communityEvent.pubkey, community.dTag] });
      queryClient.invalidateQueries({ queryKey: ['community-members', community.aTag] });
      queryClient.invalidateQueries({ queryKey: ['community-activity-feed'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['my-communities'], exact: false });
      if (!hasBadge && newMembers.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['badge-feed'] });
      }

      const addedCount = pendingMembers.length;
      toast({ title: `Added ${addedCount} ${addedCount === 1 ? 'person' : 'people'} to the community` });
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to add members',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    user, pendingMembers, existingBadgeATag, hasBadge, needsBadgeCreation, isFounder, community, communityEvent,
    badgeImageUrl, nostr, publishEvent, queryClient, toast, handleOpenChange, applyOptimisticMembership, isBadgeImageUploading,
  ]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent ref={dialogContentRef} className="sm:max-w-md gap-0 p-0 overflow-visible">
        <PortalContainerProvider value={portalContainer}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Add Members
          </DialogTitle>
          <DialogDescription>Add to community</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-5 pb-5 space-y-4">
            {/* People search */}
            <div className="space-y-1.5">
              <Label>Search</Label>
              <PersonSearch
                onAdd={addPerson}
                onAddMany={addPeople}
                excludePubkeys={[
                  community.founderPubkey,
                  ...existingMemberPubkeys,
                  ...pendingMembers.map((m) => m.profile.pubkey),
                ]}
              />
            </div>

            {/* Pending members list */}
            {pendingMembers.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  People to add
                  <span className="text-muted-foreground font-normal ml-1">({pendingMembers.length})</span>
                </Label>
                <div className="space-y-1">
                  {pendingMembers.map((pm) => (
                    <PendingMemberChip
                      key={pm.profile.pubkey}
                      pending={pm}
                      onRemove={removePerson}
                      onRoleChange={isFounder ? setRole : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {hasPendingMembers && (
              <div className="space-y-2">
                <Label>Member badge</Label>
                {hasBadge ? (
                  <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                    {isBadgeError ? (
                      <p className="text-sm text-destructive">Failed to load the current member badge.</p>
                    ) : isBadgeLoading ? (
                      <div className="flex items-center gap-3">
                        <div className="size-12 animate-pulse rounded-lg bg-muted" />
                        <div className="space-y-2">
                          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    ) : existingBadge ? (
                      <div className="flex items-center gap-3">
                        <BadgeThumbnail badge={existingBadge} size={48} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{existingBadge.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {existingBadge.description || 'Selected members will receive this badge.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">The configured member badge could not be found.</p>
                    )}
                  </div>
                ) : (
                  <ImageUploadField
                    id="member-badge-image"
                    label={<>Create Member Badge Image <span className="text-muted-foreground font-normal">(optional)</span></>}
                    value={badgeImageUrl}
                    onChange={setBadgeImageUrl}
                    onUploadingChange={setIsBadgeImageUploading}
                    uploadToastTitle="Badge image uploaded"
                    previewAlt="Badge preview"
                    objectFit="contain"
                    dropAreaClassName="min-h-24"
                  />
                )}
              </div>
            )}

            {/* Submit button */}
            <Button
              onClick={handleSubmit}
              disabled={pendingMembers.length === 0 || isPublishing || isBadgeImageUploading}
              className="w-full gap-2"
            >
              {isPublishing ? (
                <><Loader2 className="size-4 animate-spin" /> Adding...</>
              ) : (
                <><UserPlus className="size-4" /> Add {pendingMembers.length || ''} {pendingMembers.length === 1 ? 'Person' : pendingMembers.length > 1 ? 'People' : 'Members'}</>
              )}
            </Button>
          </div>
        </ScrollArea>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

/** Inline type-ahead person search. */
function PersonSearch({
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

/** A pending member chip with role toggle and remove button. */
function PendingMemberChip({
  pending,
  onRemove,
  onRoleChange,
}: {
  pending: PendingMember;
  onRemove: (pubkey: string) => void;
  onRoleChange?: (pubkey: string, role: MemberRole) => void;
}) {
  const { profile, role } = pending;
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border/50">
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={metadata.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 text-sm truncate">
        <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
      </span>

      {onRoleChange ? (
        <ToggleGroup
          type="single"
          value={role}
          onValueChange={(value) => {
            if (value === 'member' || value === 'moderator') onRoleChange(pubkey, value);
          }}
          className="shrink-0 rounded-full bg-muted p-0.5"
          aria-label={`Role for ${displayName}`}
        >
          <ToggleGroupItem value="member" size="sm" className="h-7 rounded-full px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" aria-label="Member">
            <Users className="size-3 sm:mr-1" />
            <span className="hidden sm:inline">Member</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="moderator" size="sm" className="h-7 rounded-full px-2 text-xs data-[state=on]:bg-amber-500 data-[state=on]:text-white" aria-label="Moderator">
            <Crown className="size-3 sm:mr-1" />
            <span className="hidden sm:inline">Moderator</span>
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Users className="size-3" />
          Member
        </span>
      )}

      <button
        type="button"
        onClick={() => onRemove(pubkey)}
        className="shrink-0 size-6 rounded-full hover:bg-destructive/10 flex items-center justify-center transition-colors"
        title="Remove"
      >
        <X className="size-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
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
