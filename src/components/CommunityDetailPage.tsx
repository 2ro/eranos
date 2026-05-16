import { useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft,
  Activity as ActivityIcon,
  CalendarDays,
  Crown,
  Info,
  MessageCircle,
  MoreVertical,
  Pencil,
  Radio,
  Shield,
  ShieldBan,
  Share2,
  Target,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { AddMemberPanel } from '@/components/AddMemberDialog';
import { CreateCommunityDialog } from '@/components/CreateCommunityDialog';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BanConfirmDialog } from '@/components/BanConfirmDialog';
import { CommunityChatPanel } from '@/components/CommunityChatPanel';
import { CommunityPulsePanel } from '@/components/CommunityPulsePanel';
import { NoteContent } from '@/components/NoteContent';
import { CommunityBadgePanel } from '@/components/CommunityBadgePanel';
import { ComposeBox } from '@/components/ComposeBox';
import { FollowToggleButton } from '@/components/FollowButton';
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
  const [activeTab, setActiveTab] = useState('activity');
  const [composeOpen, setComposeOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editCommunityOpen, setEditCommunityOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [descriptionDialogOpen, setDescriptionDialogOpen] = useState(false);

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

  // Whether to render the description info button next to the title — true
  // whenever there's any description text or a stripped trailing URL.
  const descriptionExpandable = !!descriptionText || !!descriptionUrl;

  /**
   * Synthesize a kind-1 pseudo-event so we can hand the description off to
   * `NoteContent` for the same link / hashtag / nostr-URI / embed rendering
   * used in NoteCard. Reuses the community event's `pubkey` and `id` to
   * satisfy hooks inside `NoteContent` (author lookup, memo keys, etc.); the
   * synthesized event is never published.
   */
  const descriptionPseudoEvent = useMemo<NostrEvent>(() => ({
    id: `community-description-${event.id}`,
    pubkey: event.pubkey,
    kind: 1,
    created_at: event.created_at,
    tags: [],
    content: description,
    sig: '',
  }), [description, event.id, event.pubkey, event.created_at]);

  // ── Members ─────────────────────────────────────────────────────────────────
  const { data: membership, moderation, rankMap, isLoading: membersLoading } = useCommunityMembers(community);
  const viewerMember = user ? getViewerAuthority(user.pubkey, rankMap, moderation) : undefined;

  // Founder can add moderators + members; moderators (rank 0) can add members
  const isFounder = !!user && user.pubkey === event.pubkey;
  const canAddMembers = !!viewerMember && viewerMember.rank === 0;

  // NIP-51 kind 10004 is the standard Communities list. In the UI this is
  // presented as following a community.
  const {
    isBookmarked: isCommunitySaved,
    toggleBookmark: toggleCommunityFollow,
  } = useCommunityBookmarks();
  const savedCommunityFollow = !!communityATag && isCommunitySaved(communityATag);
  const membershipFollow = isFounder || !!viewerMember;
  const communityFollowed = membershipFollow || savedCommunityFollow;
  const handleToggleFollow = useCallback(() => {
    if (!user || !communityATag || toggleCommunityFollow.isPending) return;
    if (membershipFollow) {
      toast({ title: isFounder ? 'You founded this community' : 'You are already a member of this community' });
      return;
    }
    toggleCommunityFollow.mutate({ aTag: communityATag });
  }, [user, communityATag, toggleCommunityFollow, membershipFollow, isFounder, toast]);

  // Batch-fetch profiles for all members
  const allMemberPubkeys = useMemo(
    () => membership?.members.map((m) => m.pubkey) ?? [],
    [membership],
  );
  useAuthors(allMemberPubkeys);

  const memberSections = useMemo(() => {
    if (!membership) return [];
    const leadership: CommunityMember[] = [];
    const members: CommunityMember[] = [];
    for (const member of membership.members) {
      if (member.rank === 0) leadership.push(member);
      else members.push(member);
    }
    return [
      { key: 'leadership', label: 'Leadership', members: leadership },
      { key: 'members', label: 'Members', members },
    ].filter((section) => section.members.length > 0);
  }, [membership]);

  // ── Comments (NIP-22 on the community event) ───────────────────────────────
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);
  const { membersOnly } = useMembersOnlyFilter();

  // ── Goals (NIP-75) ──────────────────────────────────────────────────────────
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

  // ── Initiatives (Goals + Events merged into one chronological list) ───────
  // Active items go first, sorted: future events ascending by start date,
  // then active goals by creation date (newest first). Past items follow.
  const activeInitiatives = useMemo(() => {
    const items = [...activeGoals, ...activeEventItems];
    return items.sort((a, b) => {
      const aIsEvent = a.kind === 31922 || a.kind === 31923;
      const bIsEvent = b.kind === 31922 || b.kind === 31923;
      if (aIsEvent && bIsEvent) {
        return getCalendarEventStart(a) - getCalendarEventStart(b);
      }
      if (aIsEvent) return -1;
      if (bIsEvent) return 1;
      return b.created_at - a.created_at;
    });
  }, [activeGoals, activeEventItems]);

  const pastInitiatives = useMemo(() => {
    const items = [...pastGoals, ...pastEventItems];
    return items.sort((a, b) => {
      // Newest-first by the relevant "end" timestamp.
      const aEnd = a.kind === 31922 || a.kind === 31923
        ? getCalendarEventEnd(a)
        : parseInt(a.tags.find(([n]) => n === 'closed_at')?.[1] ?? String(a.created_at), 10);
      const bEnd = b.kind === 31922 || b.kind === 31923
        ? getCalendarEventEnd(b)
        : parseInt(b.tags.find(([n]) => n === 'closed_at')?.[1] ?? String(b.created_at), 10);
      return bEnd - aEnd;
    });
  }, [pastGoals, pastEventItems]);

  const replyTree = useMemo((): ReplyNode[] => {
    if (!commentsData) return [];
    const topLevel = commentsData.topLevelComments ?? [];

    // Filter: omit banned events and posts by banned members, then optionally
    // restrict to validated members when the "members only" toggle is
    // active. The member filter is a presentation-layer opt-in — the NIP
    // lists it as a MAY feature, so users default to seeing everything.
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
      .sort((a, b) => b.created_at - a.created_at)
      .map((r) => buildNode(r));
  }, [commentsData, moderation, membersOnly, rankMap]);

  // ── Activity feed — merge active initiatives with top-level discussion
  // posts into one chronological stream (newest first). Each entry is tagged
  // so the renderer can dispatch to NoteCard (initiative) or
  // ThreadedReplyList (discussion subtree).
  type ActivityItem =
    | { kind: 'initiative'; event: NostrEvent; ts: number }
    | { kind: 'discussion'; node: ReplyNode; ts: number };

  const activityItems = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = [
      ...activeInitiatives.map((ev) => ({
        kind: 'initiative' as const,
        event: ev,
        ts: ev.created_at,
      })),
      ...replyTree.map((node) => ({
        kind: 'discussion' as const,
        node,
        ts: node.event.created_at,
      })),
    ];
    return items.sort((a, b) => b.ts - a.ts);
  }, [activeInitiatives, replyTree]);

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

  // ── FAB — opens a floating action menu anchored to the FAB itself ─────────
  // Visible on tabs whose surfaces accept user-authored content.
  const fabAvailable = activeTab === 'activity';

  const fabMenu = useMemo(() => {
    if (!fabAvailable) return undefined;
    return [
      {
        id: 'new-post',
        label: 'New post',
        icon: <MessageCircle className="size-4" />,
        onSelect: () => {
          setActiveTab('activity');
          setComposeOpen(true);
        },
      },
      {
        id: 'new-goal',
        label: 'New goal',
        icon: <Target className="size-4" />,
        onSelect: () => {
          setActiveTab('activity');
          setGoalDialogOpen(true);
        },
      },
      {
        id: 'new-event',
        label: 'New event',
        icon: <CalendarDays className="size-4" />,
        onSelect: () => {
          setActiveTab('activity');
          setEventDialogOpen(true);
        },
      },
    ];
  }, [fabAvailable]);

  useLayoutOptions({
    showFAB: fabAvailable,
    fabMenu,
  });

  const moderationCtx = useMemo(
    () => communityATag ? { communityATag, moderation, rankMap } : null,
    [communityATag, moderation, rankMap],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  const heroIconClassName = 'size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]';
  const bannerActionClassName = 'p-2 rounded-full text-white/90 hover:text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:pointer-events-none transition-colors';

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <CommunityModerationContext.Provider value={moderationCtx}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
      {/* ── Hero banner + tabs share a single image/gradient backdrop so the
          banner image continues underneath the tab strip and fades into the
          page background — eliminating the seam between the two. ── */}
      <div className="relative isolate overflow-hidden">
        {/* Shared backdrop — image (or fallback gradient) + darkening overlay
            that spans the full height of (banner + tabs) and fades to the
            page background at its bottom edge. */}
        <div aria-hidden className="absolute inset-0 -z-10">
          {image ? (
            <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-primary/25 to-primary/5" />
          )}
          {/* Darkening overlay that fades to the page background at the
              bottom of the tab strip — makes tab text legible and erases the
              hard seam between banner and tabs. Stops push the heavy darkness
              down so it sits behind the tabs, not over the banner. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_15%,rgba(0,0,0,0.9)_75%,rgba(0,0,0,0.9)_97%,hsl(var(--background))_100%)]" />
        </div>

        {/* Banner — fixed aspect ratio, title/description/buttons overlaid */}
        <div className="relative w-full aspect-[2/1] sm:aspect-[21/9]">
          {!image && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Users className="size-16 text-primary/20 sm:size-20" />
            </div>
          )}
          {/* Extra top/bottom darkening on the hero specifically (above the
              shared overlay) so overlaid title/description stay legible. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/40" />

        {/* Top bar — back button (left) + follow toggle (right) */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
            className="p-2 -ml-2 rounded-full hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className={heroIconClassName} />
          </button>
          {user && communityATag && (
            <FollowToggleButton
              size="sm"
              isFollowing={communityFollowed}
              isPending={toggleCommunityFollow.isPending}
              onClick={handleToggleFollow}
              icon={<UserPlus className="size-4" />}
              followingIcon={
                <>
                  <UserCheck className="size-4 group-hover:hidden group-focus-visible:hidden" />
                  <UserMinus className="size-4 hidden group-hover:inline group-focus-visible:inline" />
                </>
              }
              hoverToUnfollow
              className={cn(
                'shadow-md',
                !communityFollowed && 'bg-white text-black hover:bg-white/90',
                communityFollowed && 'bg-black/30 backdrop-blur-sm border-white/40 text-white hover:bg-destructive/30 hover:text-white hover:border-destructive/60',
              )}
            />
          )}
        </div>

        {/* Member stack sits ABOVE the title; the title row carries the Info
            button (left of name) and action buttons (right). Description has
            moved behind an Info button to reduce banner clutter. */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-3 pt-8 [text-shadow:0_1px_4px_rgba(0,0,0,0.7),0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="flex [text-shadow:none]">
            {/* Avatar stack — clickable to open full members dialog */}
            <button
              type="button"
              onClick={() => setMembersDialogOpen(true)}
              className="flex items-center gap-2 -ml-1 px-1 py-1 rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 transition-colors min-w-0"
              aria-label="Show all members"
            >
              <PeopleAvatarStack
                pubkeys={allMemberPubkeys}
                maxVisible={6}
                size="sm"
                className="[&_.ring-2]:ring-black/40 pointer-events-none"
              />
              {allMemberPubkeys.length > 0 && (
                <span className="text-xs font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] truncate">
                  {allMemberPubkeys.length} member{allMemberPubkeys.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          </div>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-xl font-bold text-white leading-tight sm:text-2xl truncate">{name}</h2>
              {descriptionExpandable && (
                <button
                  type="button"
                  onClick={() => setDescriptionDialogOpen(true)}
                  className="-my-1 -mr-1 p-1 rounded-full text-white/75 hover:text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 transition-colors"
                  aria-label="About this community"
                >
                  <Info className="size-4 [text-shadow:none] drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
                </button>
              )}
            </div>

            {/* Banner action row — MembersOnly + Share + overflow menu (Unfollow / Edit) */}
            <div className="flex items-center gap-0.5 shrink-0 [text-shadow:none]">
              <MembersOnlyToggle
                className="text-white/90 hover:text-white hover:bg-white/15 data-[state=on]:text-white"
              />
              <button
                type="button"
                className={bannerActionClassName}
                onClick={handleShare}
                aria-label="Share"
              >
                <Share2 className="size-5" />
              </button>
              {isFounder && community && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={bannerActionClassName}
                      aria-label="More actions"
                    >
                      <MoreVertical className="size-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" sideOffset={6} className="min-w-[180px]">
                    <DropdownMenuItem onSelect={() => setEditCommunityOpen(true)}>
                      <Pencil className="size-4 mr-2" />
                      Edit community
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
          <TabsList className="w-full justify-stretch rounded-none border-b border-white/15 bg-transparent p-0 h-auto">
            <TabsTrigger
              value="activity"
              className="flex-1 min-w-0 rounded-none border-b-2 border-transparent text-white/75 hover:text-white data-[state=active]:text-white data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
            >
              <ActivityIcon className="size-4 mr-1.5" />
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="pulse"
              className="flex-1 min-w-0 rounded-none border-b-2 border-transparent text-white/75 hover:text-white data-[state=active]:text-white data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
            >
              <Radio className="size-4 mr-1.5" />
              Pulse
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="flex-1 min-w-0 rounded-none border-b-2 border-transparent text-white/75 hover:text-white data-[state=active]:text-white data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
            >
              <MessageCircle className="size-4 mr-1.5" />
              Chat
            </TabsTrigger>
          </TabsList>
      </div>
      {/* ── /shared banner+tabs backdrop wrapper ── */}

          {/* Sublabel for the currently-active tab. Only rendered when the
              tab has a descriptor to show — keeps the rest of the tab strip
              clean. */}
          {activeTab === 'pulse' && (
            <div className="px-5 py-2 text-xs text-muted-foreground text-center">
              What members are posting elsewhere across Nostr.
            </div>
          )}

            {/* ── Chat tab — community kind-9 messages ── */}
            <TabsContent value="chat" className="mt-0">
              {communityATag ? (
                <CommunityChatPanel
                  communityATag={communityATag}
                  moderation={moderation}
                  rankMap={rankMap}
                  isMembershipLoading={membersLoading}
                />
              ) : (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  Community chat is unavailable for this community.
                </div>
              )}
            </TabsContent>

            {/* ── Activity tab — chronological stream of initiatives
                 (goals + events) interleaved with threaded NIP-22 discussion,
                 followed by past initiatives. ── */}
            <TabsContent value="activity" className="mt-0">
              <ComposeBox compact replyTo={event} />

              {(commentsLoading || goalsLoading || eventsLoading) ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ReplyCardSkeleton key={i} />
                  ))}
                </div>
              ) : activityItems.length === 0 && pastInitiatives.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  {membersOnly && (
                    (commentsData && (commentsData.topLevelComments?.length ?? 0) > 0) ||
                    (goals ?? []).length > 0 ||
                    (communityEvents ?? []).length > 0
                  )
                    ? 'No activity from community members yet. Toggle the shield icon to see everything.'
                    : <>No activity yet.{user ? ' Start a discussion, set a goal, or schedule an event!' : ''}</>}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activityItems.map((item) =>
                    item.kind === 'initiative' ? (
                      <NoteCard key={item.event.id} event={item.event} />
                    ) : (
                      <ThreadedReplyList key={item.node.event.id} roots={[item.node]} />
                    )
                  )}

                  {pastInitiatives.length > 0 && (
                    <div className="px-5 pt-4 pb-1">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Past
                      </h4>
                    </div>
                  )}
                  {pastInitiatives.map((e) => (
                    <NoteCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Pulse tab — what community members are posting elsewhere
                 across Nostr. Excludes events tagged with this community's
                 `a` reference. ── */}
            <TabsContent value="pulse" className="mt-0">
              {communityATag ? (
                <CommunityPulsePanel
                  communityATag={communityATag}
                  memberPubkeys={allMemberPubkeys}
                  isMembershipLoading={membersLoading}
                />
              ) : (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  Pulse is unavailable for this community.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CommunityModerationContext.Provider>

      {/* Description dialog — opened by clicking the truncated description in
          the banner. Renders the full raw description plus a clickable
          website link when the description ends with a URL. */}
      <Dialog open={descriptionDialogOpen} onOpenChange={setDescriptionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle>About {name}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 overflow-y-auto">
            {description ? (
              <NoteContent
                event={descriptionPseudoEvent}
                className="text-sm leading-relaxed break-words"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Members dialog — opened from the avatar stack in the banner. Replaces
          the former Members tab; contains badge panel, leadership +
          rank-and-file sections, and (for founders/mods) the inline
          search-and-add panel at the bottom. */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Members
              {allMemberPubkeys.length > 0 && (
                <span className="text-muted-foreground font-normal text-sm">({allMemberPubkeys.length})</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {community && (
              <section className="border-b border-border px-5 py-4">
                <CommunityBadgePanel
                  communityEvent={event}
                  community={community}
                  isFounder={isFounder}
                />
              </section>
            )}

            {membersLoading ? (
              <MembersSkeleton />
            ) : memberSections.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm px-5">
                No members found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {memberSections.map(({ key, label, members }) => (
                  <section key={key} className="px-5 py-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      {key === 'leadership' ? <Crown className="size-3.5 text-amber-500" /> : <Shield className="size-3.5" />}
                      {label}
                      <span className="text-muted-foreground/60 font-normal">({members.length})</span>
                    </h3>
                    <div className="space-y-0.5">
                      {members.map((m) => {
                        let roleLabel: string | undefined;
                        if (m.rank === 0) {
                          roleLabel = m.pubkey === event.pubkey ? 'Founder' : 'Moderator';
                        }
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
          </div>

          {canAddMembers && community && (
            <div className="border-t border-border px-5 py-4 shrink-0 max-h-[50vh] overflow-y-auto">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <UserPlus className="size-3.5" />
                Add members
              </h3>
              <AddMemberPanel
                communityEvent={event}
                community={community}
                isFounder={isFounder}
                existingMemberPubkeys={allMemberPubkeys}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* FAB-triggered goal creation dialog for the goals tab */}
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
