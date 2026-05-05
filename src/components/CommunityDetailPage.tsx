import { useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Crown,
  MessageCircle,
  Pencil,
  Shield,
  ShieldBan,
  Share2,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { AddMemberDialog } from '@/components/AddMemberDialog';
import { CreateCommunityDialog } from '@/components/CreateCommunityDialog';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BanConfirmDialog } from '@/components/BanConfirmDialog';
import { ComposeBox } from '@/components/ComposeBox';
import { CreateGoalDialog } from '@/components/CreateGoalDialog';
import { MembersOnlyToggle } from '@/components/MembersOnlyToggle';
import { NoteCard } from '@/components/NoteCard';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useComments } from '@/hooks/useComments';
import { useCommunityBookmarks } from '@/hooks/useCommunityBookmarks';
import { useCommunityEvents } from '@/hooks/useCommunityEvents';
import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { useCommunityGoals } from '@/hooks/useCommunityGoals';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMembersOnlyFilter } from '@/hooks/useMembersOnlyFilter';
import { useNow } from '@/hooks/useNow';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { CommunityModerationContext } from '@/contexts/CommunityModerationContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { applyCommunityModerationToEvents, canBanTarget, getViewerAuthority, parseCommunityEvent, type CommunityMember } from '@/lib/communityUtils';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonRow({ pubkey, label, size = 'md', onBan }: { pubkey: string; label?: string; size?: 'sm' | 'md'; onBan?: () => void }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-10';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <div className="flex items-center gap-3 py-1">
      <Link to={profileUrl} className="flex items-center gap-3 group flex-1 min-w-0">
        <Avatar className={cn(avatarCls, 'ring-2 ring-background')}>
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium truncate group-hover:underline', size === 'sm' ? 'text-sm' : 'text-[15px]')}>{name}</p>
          {metadata?.nip05 && (
            <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
          )}
        </div>
        {label && (
          <Badge variant="secondary" className="ml-auto capitalize text-xs shrink-0">{label}</Badge>
        )}
      </Link>
      {onBan && (
        <button
          onClick={(e) => { e.stopPropagation(); onBan(); }}
          className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          aria-label="Ban from community"
          title="Ban from community"
        >
          <ShieldBan className="size-4" />
        </button>
      )}
    </div>
  );
}

function MembersSkeleton() {
  return (
    <div className="space-y-4 px-5 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ReplyCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getCalendarEventStart(event: NostrEvent): number {
  const start = getTag(event.tags, 'start');
  if (!start) return 0;

  if (event.kind === 31922) {
    const date = new Date(`${start}T00:00:00Z`);
    return isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
  }

  const timestamp = parseInt(start, 10);
  return isNaN(timestamp) ? 0 : timestamp;
}

function getCalendarEventEnd(event: NostrEvent): number {
  const start = getTag(event.tags, 'start');
  if (!start) return 0;

  if (event.kind === 31922) {
    const end = getTag(event.tags, 'end');
    const endDate = new Date(`${end || start}T00:00:00Z`);
    if (isNaN(endDate.getTime())) return 0;
    return Math.floor(endDate.getTime() / 1000) + (end ? 0 : 86400);
  }

  const end = getTag(event.tags, 'end') || start;
  const endTs = parseInt(end, 10);
  return isNaN(endTs) ? 0 : endTs;
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommunityDetailPage({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();

  // ── Member ban dialog state ────────────────────────────────────────────────
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banTargetPubkey, setBanTargetPubkey] = useState<string | null>(null);

  // ── Tab + FAB state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('members');
  const [composeOpen, setComposeOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [editCommunityOpen, setEditCommunityOpen] = useState(false);

  // Parse community definition
  const community = useMemo(() => parseCommunityEvent(event), [event]);
  const name = community?.name ?? 'Unnamed Community';
  const description = community?.description ?? '';
  const image = community?.image;
  const communityATag = community?.aTag ?? '';

  // Extract website URL from description
  const descriptionUrl = useMemo(() => {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    return sanitizeUrl(urlMatch?.[0]);
  }, [description]);

  const descriptionText = useMemo(() => {
    if (!descriptionUrl) return description;
    return description.replace(new RegExp(`\\s*${descriptionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  }, [description, descriptionUrl]);

  // ── Members ─────────────────────────────────────────────────────────────────
  const { data: membership, moderation, rankMap, isLoading: membersLoading } = useCommunityMembers(community);
  const viewerMember = user ? getViewerAuthority(user.pubkey, rankMap, moderation) : undefined;

  // Founder can add moderators + members; moderators (rank 0) can add members
  const isFounder = !!user && user.pubkey === event.pubkey;
  const canAddMembers = !!viewerMember && viewerMember.rank === 0;

  // NIP-51 kind 10004 community bookmark toggle. Toasts are fired from inside
  // the mutation so they survive even if this page unmounts mid-publish.
  const {
    isBookmarked: isCommunityBookmarked,
    toggleBookmark: toggleCommunityBookmark,
  } = useCommunityBookmarks();
  const bookmarked = !!communityATag && isCommunityBookmarked(communityATag);
  const handleToggleBookmark = useCallback(() => {
    if (!user || !communityATag || toggleCommunityBookmark.isPending) return;
    toggleCommunityBookmark.mutate({ aTag: communityATag });
  }, [user, communityATag, toggleCommunityBookmark]);

  // Batch-fetch profiles for all members
  const allMemberPubkeys = useMemo(
    () => membership?.members.map((m) => m.pubkey) ?? [],
    [membership],
  );
  useAuthors(allMemberPubkeys);

  // Group members by rank
  const membersByRank = useMemo(() => {
    if (!membership || !community) return [];
    const groups = new Map<number, CommunityMember[]>();
    for (const m of membership.members) {
      const list = groups.get(m.rank) ?? [];
      list.push(m);
      groups.set(m.rank, list);
    }
    // Build ordered groups with labels
    const result: { rank: number; label: string; members: CommunityMember[] }[] = [];
    const sortedRanks = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const rank of sortedRanks) {
      const members = groups.get(rank)!;
      let label: string;
      if (rank === 0) {
        label = 'Leadership';
      } else {
        // Find the badge a-tag for this rank from community definition
        const tier = community.ranks.find((r) => r.rank === rank);
        // Use the badge d-tag suffix as a label hint, or fall back to "Rank N"
        if (tier?.badgeATag) {
          const parts = tier.badgeATag.split(':');
          const dTag = parts.slice(2).join(':');
          // Try to extract a human-readable name from the d-tag (after the UUID prefix)
          const namePart = dTag.split('-').pop();
          label = namePart ? namePart.charAt(0).toUpperCase() + namePart.slice(1) : `Rank ${rank}`;
        } else {
          label = `Rank ${rank}`;
        }
      }
      result.push({ rank, label, members });
    }
    return result;
  }, [membership, community]);

  // ── Comments (NIP-22 on the community event) ───────────────────────────────
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);
  const { membersOnly } = useMembersOnlyFilter();

  // ── Fundraising goals (NIP-75) ──────────────────────────────────────────────
  const { data: goals, isLoading: goalsLoading } = useCommunityGoals(communityATag || undefined);
  const { data: communityEvents, isLoading: eventsLoading } = useCommunityEvents(communityATag || undefined);
  const now = useNow(60_000);

  /** Check if a goal event's `closed_at` deadline has passed. */
  const isExpired = useCallback((e: NostrEvent): boolean => {
    const v = e.tags.find(([n]) => n === 'closed_at')?.[1];
    if (!v) return false;
    const ts = parseInt(v, 10);
    return !isNaN(ts) && now > ts;
  }, [now]);

  const moderatedGoals = useMemo(
    () => applyCommunityModerationToEvents(goals ?? [], moderation),
    [goals, moderation],
  );
  const activeGoals = useMemo(() => {
    const all = moderatedGoals.filter((e) => !isExpired(e));
    if (!membersOnly) return all;
    return all.filter((e) => rankMap.has(e.pubkey));
  }, [moderatedGoals, membersOnly, rankMap, isExpired]);
  const pastGoals = useMemo(() => {
    const all = moderatedGoals.filter((e) => isExpired(e));
    const filtered = membersOnly ? all.filter((e) => rankMap.has(e.pubkey)) : all;
    // Sort by deadline descending so the most recently ended goal appears first.
    return filtered.sort((a, b) => {
      const aClose = parseInt(a.tags.find(([n]) => n === 'closed_at')?.[1] ?? '0', 10);
      const bClose = parseInt(b.tags.find(([n]) => n === 'closed_at')?.[1] ?? '0', 10);
      return bClose - aClose;
    });
  }, [moderatedGoals, membersOnly, rankMap, isExpired]);

  const eventItems = useMemo(() => {
    const moderated = applyCommunityModerationToEvents(communityEvents ?? [], moderation);
    const visible = membersOnly ? moderated.filter((e) => rankMap.has(e.pubkey)) : moderated;

    return [...visible].sort((a, b) => {
      const aStart = getCalendarEventStart(a);
      const bStart = getCalendarEventStart(b);
      const aFuture = aStart >= now;
      const bFuture = bStart >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return aStart - bStart;
      return bStart - aStart;
    });
  }, [communityEvents, moderation, membersOnly, rankMap, now]);
  const activeEventItems = useMemo(
    () => eventItems.filter((e) => getCalendarEventEnd(e) >= now),
    [eventItems, now],
  );
  const pastEventItems = useMemo(
    () => eventItems.filter((e) => getCalendarEventEnd(e) < now),
    [eventItems, now],
  );

  const replyTree = useMemo((): ReplyNode[] => {
    if (!commentsData) return [];
    const topLevel = commentsData.topLevelComments ?? [];

    // Filter: omit banned events and posts by banned members, then optionally
    // restrict to chain-validated members when the "members only" toggle is
    // active. The member filter is a presentation-layer choice — the NIP
    // recommends it as the canonical-feed default, but users may opt out.
    const applyModeration = (events: NostrEvent[]): NostrEvent[] => {
      const moderated = applyCommunityModerationToEvents(events, moderation);
      if (!membersOnly) return moderated;
      return moderated.filter((ev) => rankMap.has(ev.pubkey));
    };

    const buildNode = (ev: NostrEvent): ReplyNode => {
      const allChildren = applyModeration(commentsData.getDirectReplies(ev.id) ?? []);
      if (allChildren.length <= 1) {
        return {
          event: ev,
          children: allChildren.map((c) => buildNode(c)),
        };
      }
      const [first, ...rest] = allChildren;
      return {
        event: ev,
        children: [buildNode(first)],
        hiddenChildren: rest.map((c) => buildNode(c)),
      };
    };

    return applyModeration([...topLevel])
      .sort((a, b) => a.created_at - b.created_at)
      .map((r) => buildNode(r));
  }, [commentsData, moderation, membersOnly, rankMap]);

  // ── Share handler ───────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const naddr = nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: d,
    });
    const url = `${window.location.origin}/${naddr}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  }, [event, toast]);

  // ── FAB — visible on comments, fundraising, and members tabs ──────────────
  const handleFabClick = useCallback(() => {
    if (activeTab === 'comments') {
      setComposeOpen(true);
    } else if (activeTab === 'fundraising') {
      setGoalDialogOpen(true);
    } else if (activeTab === 'events') {
      setEventDialogOpen(true);
    } else if (activeTab === 'members') {
      setAddMemberOpen(true);
    }
  }, [activeTab]);

  const fabIcon = activeTab === 'fundraising'
    ? <Target strokeWidth={3} size={18} />
    : activeTab === 'members'
      ? <UserPlus className="size-5" />
      : activeTab === 'events'
        ? <CalendarDays className="size-5" />
        : undefined; // default Plus icon for comments

  useLayoutOptions({
    showFAB:
      activeTab === 'comments'
      || activeTab === 'fundraising'
      || activeTab === 'events'
      || (activeTab === 'members' && canAddMembers),
    onFabClick: handleFabClick,
    fabIcon,
  });

  const moderationCtx = useMemo(
    () => communityATag ? { communityATag, moderation, rankMap } : null,
    [communityATag, moderation, rankMap],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold flex-1 truncate">Community</h1>
        {isFounder && community && (
          <button
            className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
            onClick={() => setEditCommunityOpen(true)}
            aria-label="Edit community"
          >
            <Pencil className="size-5" />
          </button>
        )}
        {user && communityATag && (
          <button
            className="p-2 rounded-full hover:bg-secondary/60 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            onClick={handleToggleBookmark}
            disabled={toggleCommunityBookmark.isPending}
            aria-label={bookmarked ? 'Remove community bookmark' : 'Bookmark community'}
            aria-pressed={bookmarked}
            aria-busy={toggleCommunityBookmark.isPending}
          >
            <Bookmark className={cn('size-5', bookmarked && 'fill-current')} />
          </button>
        )}
        <button
          className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
          onClick={handleShare}
          aria-label="Share"
        >
          <Share2 className="size-5" />
        </button>
      </div>

      {/* ── Hero image ── */}
      {image ? (
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <img src={image} alt={name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h2 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">{name}</h2>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[21/9] w-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <Users className="size-16 text-primary/20" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h2 className="text-2xl font-bold leading-tight">{name}</h2>
          </div>
        </div>
      )}

      {/* ── Community info ── */}
      <div className="px-5 mt-4 space-y-4">
        {/* Description */}
        {descriptionText && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{descriptionText}</p>
        )}

        {/* Founder + community-wide filter toggle. The toggle sits
            right-justified on the same row as the "Founded by" label so
            it clearly scopes the whole community (every content feed
            below the tabs), not any one tab. */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Founded by</p>
            <MembersOnlyToggle className="-my-2 -mr-2" />
          </div>
          <PersonRow pubkey={event.pubkey} />
        </div>

        {/* ── Tabs ── */}
        <CommunityModerationContext.Provider value={moderationCtx}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="-mx-5">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0 h-auto">
              <TabsTrigger
                value="members"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
              >
                <Users className="size-4 mr-1.5" />
                Members
              </TabsTrigger>
              <TabsTrigger
                value="comments"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
              >
                <MessageCircle className="size-4 mr-1.5" />
                Comments
              </TabsTrigger>
              <TabsTrigger
                value="fundraising"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
              >
                <Target className="size-4 mr-1.5" />
                Fundraising
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
              >
                <CalendarDays className="size-4 mr-1.5" />
                Events
              </TabsTrigger>
            </TabsList>

            {/* ── Members tab ── */}
            <TabsContent value="members" className="mt-0">
              {membersLoading ? (
                <MembersSkeleton />
              ) : membersByRank.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  No members found.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {membersByRank.map(({ rank, label, members }) => (
                    <section key={rank} className="px-5 py-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                        {rank === 0 ? <Crown className="size-3.5 text-amber-500" /> : <Shield className="size-3.5" />}
                        {label}
                        <span className="text-muted-foreground/60 font-normal">({members.length})</span>
                      </h3>
                      <div className="space-y-0.5">
                        {members.map((m) => {
                          let roleLabel: string | undefined;
                          if (rank === 0) {
                            roleLabel = m.pubkey === event.pubkey ? 'Founder' : 'Moderator';
                          }
                          // Determine if the current user can ban this member
                          const canBanMember = viewerMember
                            && m.pubkey !== user?.pubkey
                            && canBanTarget(viewerMember, m);
                          return (
                            <PersonRow
                              key={m.pubkey}
                              pubkey={m.pubkey}
                              label={roleLabel}
                              size="sm"
                              onBan={canBanMember ? () => {
                                setBanTargetPubkey(m.pubkey);
                                setBanDialogOpen(true);
                              } : undefined}
                            />
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Comments tab ── */}
            <TabsContent value="comments" className="mt-0">
              <ComposeBox compact replyTo={event} />

              {commentsLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ReplyCardSkeleton key={i} />
                  ))}
                </div>
              ) : replyTree.length > 0 ? (
                <ThreadedReplyList roots={replyTree} />
              ) : membersOnly && commentsData && (commentsData.topLevelComments?.length ?? 0) > 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  No comments from community members yet. Toggle the shield icon to see all comments.
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No comments yet. Be the first to comment!
                </div>
              )}
            </TabsContent>

            {/* ── Fundraising tab ── */}
            <TabsContent value="fundraising" className="mt-0">
              {goalsLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <ReplyCardSkeleton key={i} />
                  ))}
                </div>
              ) : activeGoals.length === 0 && pastGoals.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  {membersOnly && (goals ?? []).length > 0
                    ? 'No fundraising goals from community members yet. Toggle the shield icon to see all goals.'
                    : <>No fundraising goals yet.{user ? ' Create one to get started!' : ''}</>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {/* Active goals first */}
                  {activeGoals.map((e) => (
                    <NoteCard key={e.id} event={e} />
                  ))}

                  {/* Past/expired goals */}
                  {pastGoals.length > 0 && activeGoals.length > 0 && (
                    <div className="px-5 pt-4 pb-1">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Past Goals
                      </h4>
                    </div>
                  )}
                  {pastGoals.map((e) => (
                    <NoteCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Events tab ── */}
            <TabsContent value="events" className="mt-0">
              {eventsLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ReplyCardSkeleton key={i} />
                  ))}
                </div>
              ) : activeEventItems.length === 0 && pastEventItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  {membersOnly && (communityEvents ?? []).length > 0
                    ? 'No events from community members yet. Toggle the shield icon to see all events.'
                    : <>No events yet.{user ? ' Create one to get started!' : ''}</>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeEventItems.map((e) => (
                    <NoteCard key={e.id} event={e} />
                  ))}

                  {pastEventItems.length > 0 && activeEventItems.length > 0 && (
                    <div className="px-5 pt-4 pb-1">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Past Events
                      </h4>
                    </div>
                  )}
                  {pastEventItems.map((e) => (
                    <NoteCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CommunityModerationContext.Provider>
      </div>

      {/* Member ban confirmation dialog */}
      {banTargetPubkey && communityATag && (
        <BanConfirmDialog
          mode="member"
          targetPubkey={banTargetPubkey}
          communityATag={communityATag}
          open={banDialogOpen}
          onOpenChange={(open) => {
            setBanDialogOpen(open);
            if (!open) setBanTargetPubkey(null);
          }}
        />
      )}

      {/* FAB-triggered compose modal for the comments tab */}
      <ReplyComposeModal
        event={event}
        open={composeOpen}
        onOpenChange={setComposeOpen}
      />

      {/* FAB-triggered goal creation dialog for the fundraising tab */}
      {communityATag && (
        <CreateGoalDialog
          communityATag={communityATag}
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
        />
      )}

      {/* FAB-triggered event creation dialog for the events tab */}
      {communityATag && (
        <CreateCommunityEventDialog
          communityATag={communityATag}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
        />
      )}

      {/* Add member dialog */}
      {canAddMembers && community && (
        <AddMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          communityEvent={event}
          community={community}
          isFounder={isFounder}
        />
      )}

      {/* Edit community dialog — founder only */}
      {isFounder && community && (
        <CreateCommunityDialog
          open={editCommunityOpen}
          onOpenChange={setEditCommunityOpen}
          communityEvent={event}
          community={community}
        />
      )}
    </div>
  );
}
