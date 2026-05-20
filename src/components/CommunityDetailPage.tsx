import { useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  CalendarDays,
  ChevronLeft,
  Crown,
  HandHeart,
  Info,
  Megaphone,
  MessageCircle,
  MoreVertical,
  Pencil,
  Shield,
  Share2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { CampaignCard } from '@/components/CampaignCard';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { PostActionBar } from '@/components/PostActionBar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { DonateDialog } from '@/components/DonateDialog';
import { NoteContent } from '@/components/NoteContent';
import { FollowToggleButton } from '@/components/FollowButton';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useComments } from '@/hooks/useComments';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCommunityBookmarks } from '@/hooks/useCommunityBookmarks';
import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';
import { useNow } from '@/hooks/useNow';
import {
  useOrganizationCampaigns,
  useOrganizationPledges,
  useOrganizationEvents,
} from '@/hooks/useOrganizationActivity';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { CommunityModerationContext } from '@/contexts/CommunityModerationContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { applyCommunityModerationToEvents, parseCommunityEvent } from '@/lib/communityUtils';
import type { ParsedCampaign } from '@/lib/campaign';
import type { Action } from '@/hooks/useActions';
import { formatNumber } from '@/lib/formatNumber';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonRow({ pubkey, label, size = 'md' }: { pubkey: string; label?: string; size?: 'sm' | 'md' }) {
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

// ── Official-activity shelves ────────────────────────────────────────────────
// Horizontal scroll rails for an organization's official campaigns,
// pledges, and calendar events. All three datasets are author-filtered
// to founder + moderators upstream in `useOrganizationActivity`; here we
// only apply lightweight presentation filters (e.g. drop past events).

const shelfDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

function formatShelfEventDate(event: NostrEvent): string {
  const start = getTag(event.tags, 'start');
  if (!start) return '';
  if (event.kind === 31922) {
    // All-day event: `YYYY-MM-DD`. Parse as UTC to avoid timezone drift on
    // dates that fall near midnight in the local zone.
    const date = new Date(`${start}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return '';
    return shelfDateFormatter.format(date);
  }
  const ts = parseInt(start, 10);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  return shelfDateFormatter.format(new Date(ts * 1000));
}

function PledgeShelfCard({ pledge }: { pledge: Action }) {
  const cover = sanitizeUrl(pledge.image);
  const naddr = nip19.naddrEncode({
    kind: pledge.event.kind,
    pubkey: pledge.pubkey,
    identifier: pledge.id,
  });
  return (
    <Link
      to={`/${naddr}`}
      className="group relative flex w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm motion-safe:transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover motion-safe:transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Megaphone className="size-10 text-primary/40" />
          </div>
        )}
      </div>
      <div className="flex-1 px-3 py-3 space-y-1">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2">{pledge.title}</h3>
        {pledge.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{pledge.description}</p>
        )}
      </div>
    </Link>
  );
}

function CalendarEventShelfCard({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') ?? 'Untitled event';
  const image = sanitizeUrl(getTag(event.tags, 'image'));
  const location = getTag(event.tags, 'location');
  const dateLabel = formatShelfEventDate(event);
  const d = getTag(event.tags, 'd') ?? '';
  const naddr = nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: d,
  });
  return (
    <Link
      to={`/${naddr}`}
      className="group relative flex w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm motion-safe:transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
        {image ? (
          <img src={image} alt="" className="absolute inset-0 size-full object-cover motion-safe:transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <CalendarDays className="size-10 text-primary/40" />
          </div>
        )}
      </div>
      <div className="flex-1 px-3 py-3 space-y-1">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {dateLabel && <span className="tabular-nums">{dateLabel}</span>}
          {location && <span className="truncate">· {location}</span>}
        </div>
      </div>
    </Link>
  );
}

interface OfficialShelfProps {
  title: string;
  count: number;
  createHref?: string;
  createLabel?: string;
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}

/** Wraps a single shelf row with a title and an optional "+ New" CTA on the right. */
function OfficialShelf({ title, count, createHref, createLabel, isLoading, isEmpty, children }: OfficialShelfProps) {
  // Suppress entirely when the shelf has nothing to show — keeps the
  // activity feed at the top of the viewport when an org has no
  // campaigns/pledges/events yet.
  if (!isLoading && isEmpty) return null;
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {title}
          {count > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">{count}</span>
          )}
        </h2>
        {createHref && (
          <Link
            to={createHref}
            className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {createLabel ?? 'New'}
          </Link>
        )}
      </div>
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {children}
      </div>
    </section>
  );
}

function OfficialActivityShelves({
  orgNaddr,
  campaigns,
  campaignsLoading,
  pledges,
  pledgesLoading,
  events,
  eventsLoading,
  now,
}: {
  orgNaddr: string;
  campaigns: ParsedCampaign[];
  campaignsLoading: boolean;
  pledges: Action[];
  pledgesLoading: boolean;
  events: NostrEvent[];
  eventsLoading: boolean;
  now: number;
}) {
  // Drop archived campaigns; sort newest first (the hook already sorts).
  const liveCampaigns = useMemo(
    () => campaigns.filter((c) => !c.archived),
    [campaigns],
  );

  // Drop expired pledges; sort with closest-deadline first, then newest.
  const livePledges = useMemo(() => {
    const filtered = pledges.filter((p) => !p.deadline || p.deadline > now);
    return [...filtered].sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline - b.deadline;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [pledges, now]);

  // Drop past events; sort by start ascending (next-up first).
  const upcomingEvents = useMemo(() => {
    const filtered = events.filter((e) => getCalendarEventEnd(e) >= now);
    return [...filtered].sort((a, b) => getCalendarEventStart(a) - getCalendarEventStart(b));
  }, [events, now]);

  // If everything is empty AND nothing is loading, render nothing — the
  // activity feed below already provides its own empty state.
  if (
    !campaignsLoading && !pledgesLoading && !eventsLoading &&
    liveCampaigns.length === 0 &&
    livePledges.length === 0 &&
    upcomingEvents.length === 0
  ) {
    return null;
  }

  const createQuery = orgNaddr ? `?org=${orgNaddr}` : '';

  return (
    <div className="space-y-1">
      <OfficialShelf
        title="Campaigns"
        count={liveCampaigns.length}
        createHref={`/campaigns/new${createQuery}`}
        createLabel="+ New campaign"
        isLoading={campaignsLoading}
        isEmpty={liveCampaigns.length === 0}
      >
        {liveCampaigns.map((campaign) => (
          <div key={campaign.aTag} className="w-[280px] shrink-0">
            <CampaignCard campaign={campaign} />
          </div>
        ))}
      </OfficialShelf>

      <OfficialShelf
        title="Pledges"
        count={livePledges.length}
        createHref={`/pledges/new${createQuery}`}
        createLabel="+ New pledge"
        isLoading={pledgesLoading}
        isEmpty={livePledges.length === 0}
      >
        {livePledges.map((pledge) => (
          <PledgeShelfCard key={pledge.event.id} pledge={pledge} />
        ))}
      </OfficialShelf>

      <OfficialShelf
        title="Upcoming events"
        count={upcomingEvents.length}
        isLoading={eventsLoading}
        isEmpty={upcomingEvents.length === 0}
      >
        {upcomingEvents.map((evt) => (
          <CalendarEventShelfCard key={evt.id} event={evt} />
        ))}
      </OfficialShelf>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommunityDetailPage({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { btcPrice } = useBitcoinWallet();

  // ── Tab + FAB state ────────────────────────────────────────────────────────
  // ── FAB + dialog state ─────────────────────────────────────────────────────
  // The detail page is single-column now (no tab strip), so the FAB is
  // always available. \"New post\" opens the reply compose modal against
  // the community event; campaigns/pledges navigate to dedicated create
  // pages with `?org=<naddr>`; calendar events still use the in-page
  // dialog because no dedicated create page exists yet.
  const [composeOpen, setComposeOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [descriptionDialogOpen, setDescriptionDialogOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [interactionsOpen, setInteractionsOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab>('reposts');

  // Parse community definition
  const community = useMemo(() => parseCommunityEvent(event), [event]);
  const name = community?.name ?? 'Unnamed Community';
  const description = community?.description ?? '';
  const image = community?.image;
  const cover = sanitizeUrl(image);
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
  // Agora's organization model has only two trust tiers — founder and
  // moderators. The "membership" list shown in the hero / members dialog
  // is therefore exactly that roster, read directly from the parsed
  // community. `useCommunityMembers` still resolves moderation state
  // (content bans, reports) used by the comment thread below.
  const { moderation, rankMap, isLoading: membersLoading } = useCommunityMembers(community);

  const communityDonationTarget = useMemo<ParsedCampaign | null>(() => {
    if (!community) return null;
    const recipients = [
      { pubkey: community.founderPubkey, weight: 1 },
      ...community.moderatorPubkeys.map((pubkey) => ({ pubkey, weight: 1 })),
    ];
    return {
      event,
      pubkey: event.pubkey,
      identifier: community.dTag,
      aTag: community.aTag,
      title: community.name,
      summary: community.description,
      story: community.description,
      image: community.image,
      category: 'community',
      tags: ['community'],
      recipients,
      createdAt: event.created_at,
      archived: false,
    };
  }, [community, event]);

  // Only the founder can edit organization metadata. Moderators can
  // moderate content via the community context but don't get the
  // "Edit community" action.
  const isFounder = !!user && user.pubkey === event.pubkey;

  // NIP-51 kind 10004 is the standard Communities list. In the UI this is
  // presented as following a community.
  const {
    isBookmarked: isCommunitySaved,
    toggleBookmark: toggleCommunityFollow,
  } = useCommunityBookmarks();
  const savedCommunityFollow = !!communityATag && isCommunitySaved(communityATag);
  const isModerator = !!user && community
    ? community.moderatorPubkeys.includes(user.pubkey)
    : false;
  const membershipFollow = isFounder || isModerator;
  const communityFollowed = membershipFollow || savedCommunityFollow;
  const handleToggleFollow = useCallback(() => {
    if (!user || !communityATag || toggleCommunityFollow.isPending) return;
    if (membershipFollow) {
      toast({ title: isFounder ? 'You founded this organization' : 'You moderate this organization' });
      return;
    }
    toggleCommunityFollow.mutate({ aTag: communityATag });
  }, [user, communityATag, toggleCommunityFollow, membershipFollow, isFounder, toast]);

  // Founder + moderator pubkeys for the avatar stack + members dialog.
  // Founder always first; moderators in their listed order.
  const leadershipPubkeys = useMemo<string[]>(() => {
    if (!community) return [];
    return [community.founderPubkey, ...community.moderatorPubkeys];
  }, [community]);
  useAuthors(leadershipPubkeys);

  // Single section now — founder + moderators are all "Leadership".
  // Members no longer exist in the organization model.
  const memberSections = useMemo(() => {
    if (!community || leadershipPubkeys.length === 0) return [];
    return [{
      key: 'leadership',
      label: 'Leadership',
      members: leadershipPubkeys.map((pubkey) => ({
        pubkey,
        isFounder: pubkey === community.founderPubkey,
      })),
    }];
  }, [community, leadershipPubkeys]);

  // ── Comments (NIP-22 on the community event) ───────────────────────────────
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);

  // ── Official activity shelves ─────────────────────────────────────────────
  // Author-filtered to founder + moderators (see useOrganizationActivity).
  // These power the campaign/pledge/event shelves rendered above the
  // comments section.
  const { data: orgCampaigns, isLoading: orgCampaignsLoading } = useOrganizationCampaigns(community);
  const { data: orgPledges, isLoading: orgPledgesLoading } = useOrganizationPledges(community);
  const { data: orgEvents, isLoading: orgEventsLoading } = useOrganizationEvents(community);
  const now = useNow(60_000);

  // naddr for this community — used by the create CTAs (passed to
  // `/campaigns/new?org=` and `/pledges/new?org=`) so the create forms can
  // resolve the implicit org context. Stable per render of the community
  // event because `event.kind`, `event.pubkey`, and the d-tag don't change
  // within a session.
  const orgNaddr = useMemo(() => {
    if (!community) return '';
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: community.dTag,
    });
  }, [community, event.kind, event.pubkey]);

  // ── Engagement stats for the community event itself ──────────────────────
  // Pulled from NIP-85. Used both for the inline counters above the action
  // bar and for the threaded-comments header. Matches the rhythm of the
  // campaign and pledge detail pages.
  const { data: engagementStats, isLoading: statsLoading } = useEventStats(event.id, event);
  const hasStats =
    !!engagementStats?.replies ||
    !!engagementStats?.reposts ||
    !!engagementStats?.quotes ||
    !!engagementStats?.reactions;

  const openInteractions = useCallback((tab: InteractionTab) => {
    setInteractionsTab(tab);
    setInteractionsOpen(true);
  }, []);

  const replyTree = useMemo((): ReplyNode[] => {
    if (!commentsData) return [];
    const topLevel = commentsData.topLevelComments ?? [];

    // Filter: omit content-banned posts. Moderation is applied by founder
    // and moderators only; non-moderator kind 1984 events are dropped at
    // the resolver level so there's nothing to filter beyond bans here.
    const applyModeration = (events: NostrEvent[]): NostrEvent[] =>
      applyCommunityModerationToEvents(events, moderation);

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
  }, [commentsData, moderation]);

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

  // ── FAB menu — single-column page, always available ─────────────────────
  // \"New post\" composes a NIP-22 comment against the community event.
  // Campaigns and pledges navigate to dedicated create pages with
  // `?org=<naddr>`. Calendar events still use the in-page dialog.
  const fabMenu = useMemo(() => {
    return [
      {
        id: 'new-post',
        label: 'New post',
        icon: <MessageCircle className="size-4" />,
        onSelect: () => setComposeOpen(true),
      },
      {
        id: 'new-campaign',
        label: 'New campaign',
        icon: <HandHeart className="size-4" />,
        onSelect: () => {
          // Implicit org tagging: the create form reads `?org=` and emits
          // the `A`/`K`/`P` tags when the current user is founder/mod of
          // that org. Falls back to a personal publication otherwise.
          navigate(`/campaigns/new${orgNaddr ? `?org=${orgNaddr}` : ''}`);
        },
      },
      {
        id: 'new-pledge',
        label: 'New pledge',
        icon: <Megaphone className="size-4" />,
        onSelect: () => {
          navigate(`/pledges/new${orgNaddr ? `?org=${orgNaddr}` : ''}`);
        },
      },
      {
        id: 'new-event',
        label: 'New event',
        icon: <CalendarDays className="size-4" />,
        onSelect: () => {
          // Calendar event creation still happens via the in-page dialog
          // because there's no dedicated create page yet. The dialog
          // already emits the uppercase `A` tag and `K: 34550` companion.
          setEventDialogOpen(true);
        },
      },
    ];
  }, [navigate, orgNaddr]);

  useLayoutOptions({
    noMaxWidth: true,
    rightSidebar: null,
    showFAB: true,
    fabMenu,
  });

  const moderationCtx = useMemo(
    () => communityATag ? { communityATag, moderation, rankMap } : null,
    [communityATag, moderation, rankMap],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  const heroIconClassName = 'size-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]';
  const bannerActionClassName = 'p-2.5 rounded-full text-white/90 hover:text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:pointer-events-none transition-colors';

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <CommunityModerationContext.Provider value={moderationCtx}>
          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <div className="relative aspect-[16/9] sm:aspect-[21/9] rounded-xl overflow-hidden bg-gradient-to-br from-primary/40 via-primary/20 to-secondary">
            {cover ? (
              <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-primary/25 to-secondary" />
            )}
            {!cover && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Users className="size-16 text-primary/40 sm:size-20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />

            <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 px-4 pt-4">
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
                className="p-2.5 -ml-2 rounded-full text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
                aria-label="Go back"
              >
                <ChevronLeft className={heroIconClassName} />
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
                    'shadow-none',
                    !communityFollowed && 'bg-white/95 text-black hover:bg-white',
                    communityFollowed && 'bg-transparent backdrop-blur-sm border-white/40 text-white hover:bg-destructive/30 hover:text-white hover:border-destructive/60',
                  )}
                />
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-5 sm:p-6 [text-shadow:0_1px_4px_rgba(0,0,0,0.75),0_2px_10px_rgba(0,0,0,0.45)]">
              <div className="flex [text-shadow:none]">
                <button
                  type="button"
                  onClick={() => setMembersDialogOpen(true)}
                  className="flex items-center gap-2 -ml-1 px-1 py-1 rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 transition-colors min-w-0"
                  aria-label="Show leadership"
                >
                  <PeopleAvatarStack
                    pubkeys={leadershipPubkeys}
                    maxVisible={6}
                    size="sm"
                    className="[&_.ring-2]:ring-black/40 pointer-events-none"
                  />
                  {leadershipPubkeys.length > 0 && (
                    <span className="text-xs font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] truncate">
                      {(() => {
                        const modCount = community?.moderatorPubkeys.length ?? 0;
                        if (modCount === 0) return 'Founder';
                        return `Founder + ${modCount} moderator${modCount === 1 ? '' : 's'}`;
                      })()}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-white truncate">{name}</h1>
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
                  {descriptionText && (
                    <p className="max-w-2xl text-base sm:text-lg text-white/90 line-clamp-2">
                      {descriptionText}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0 [text-shadow:none]">
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
                      <DropdownMenuItem onSelect={() => setMembersDialogOpen(true)}>
                        <Users className="size-4 mr-2" />
                        View leadership
                      </DropdownMenuItem>
                      {isFounder && community && (
                        <DropdownMenuItem
                          onSelect={() => {
                            const naddr = nip19.naddrEncode({
                              kind: event.kind,
                              pubkey: event.pubkey,
                              identifier: community.dTag,
                            });
                            navigate(`/communities/new?edit=${naddr}`);
                          }}
                        >
                          <Pencil className="size-4 mr-2" />
                          Edit organization
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>

          {/* ── Body — single column, pledge-detail-style ─────────────────── */}
          <div className="py-6 lg:py-10 space-y-8">
            {/* Donate (when there's a member set) and Share buttons. Sits
                just below the hero like the pledge page's action row. */}
            <div className={cn('grid gap-2', communityDonationTarget ? 'grid-cols-4' : 'grid-cols-1')}>
              {communityDonationTarget && (
                <Button
                  size="lg"
                  className="w-full col-span-3"
                  onClick={() => setDonateOpen(true)}
                >
                  <HandHeart className="size-5 mr-2" />
                  Donate
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleShare}
              >
                <Share2 className="size-4 mr-2" />
                Share
              </Button>
            </div>

            {/* Official-activity shelves. Hidden entirely when empty. */}
            <OfficialActivityShelves
              orgNaddr={orgNaddr}
              campaigns={orgCampaigns ?? []}
              campaignsLoading={orgCampaignsLoading}
              pledges={orgPledges ?? []}
              pledgesLoading={orgPledgesLoading}
              events={orgEvents ?? []}
              eventsLoading={orgEventsLoading}
              now={now}
            />

            {/* Engagement card — stats counters + post action bar. Matches
                the pledge / campaign detail layout. No funding progress bar
                here; an organization isn't a fundraising target itself. */}
            <div id="org-activity" className="scroll-mt-20">
              <div className="rounded-2xl bg-card border border-border/60 shadow-sm px-4 sm:px-5 py-4 sm:py-5">
                {hasStats && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground pb-2">
                    {engagementStats?.reposts ? (
                      <button onClick={() => openInteractions('reposts')} className="hover:underline transition-colors">
                        <span className="font-bold text-foreground">{formatNumber(engagementStats.reposts)}</span>{' '}
                        Repost{engagementStats.reposts !== 1 ? 's' : ''}
                      </button>
                    ) : null}
                    {engagementStats?.quotes ? (
                      <button onClick={() => openInteractions('quotes')} className="hover:underline transition-colors">
                        <span className="font-bold text-foreground">{formatNumber(engagementStats.quotes)}</span>{' '}
                        Quote{engagementStats.quotes !== 1 ? 's' : ''}
                      </button>
                    ) : null}
                    {engagementStats?.reactions ? (
                      <button onClick={() => openInteractions('reactions')} className="hover:underline transition-colors">
                        <span className="font-bold text-foreground">{formatNumber(engagementStats.reactions)}</span>{' '}
                        Like{engagementStats.reactions !== 1 ? 's' : ''}
                      </button>
                    ) : null}
                  </div>
                )}

                <PostActionBar
                  event={event}
                  replyLabel="Comment"
                  hideZap
                  onReply={() => setReplyOpen(true)}
                  onMore={() => setMoreMenuOpen(true)}
                  className={hasStats ? 'pt-3 border-t border-border/60' : undefined}
                />
              </div>

              {/* Comments — NIP-22 thread on the community event itself.
                  Member-filter aware (see replyTree) and routed through
                  CommunityModerationContext so per-reply ban actions work. */}
              <div className="mt-6">
                <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
                  <h2 className="text-lg font-semibold tracking-tight">Comments</h2>
                  {engagementStats?.replies ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatNumber(engagementStats.replies)}{' '}
                      {engagementStats.replies === 1 ? 'comment' : 'comments'}
                    </span>
                  ) : null}
                </div>

                {commentsLoading && statsLoading && replyTree.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <ReplyCardSkeleton key={i} />
                    ))}
                  </div>
                ) : replyTree.length > 0 ? (
                  <div className="-mx-2 sm:-mx-4 rounded-2xl bg-card border border-border/60 overflow-hidden">
                    <ThreadedReplyList roots={replyTree} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyOpen(true)}
                    className="block w-full rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center hover:bg-card hover:border-primary/40 transition-colors"
                  >
                    <p className="text-base font-medium text-foreground">
                      No comments yet
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Be the first to start a discussion.
                    </p>
                  </button>
                )}
              </div>
            </div>
          </div>
        </CommunityModerationContext.Provider>

      {communityDonationTarget && (
        <DonateDialog
          campaign={communityDonationTarget}
          open={donateOpen}
          onOpenChange={setDonateOpen}
          btcPrice={btcPrice}
        />
      )}

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

      {/* Leadership dialog — opened from the avatar stack or overflow menu. */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Leadership
              {leadershipPubkeys.length > 0 && (
                <span className="text-muted-foreground font-normal text-sm">({leadershipPubkeys.length})</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {membersLoading ? (
              <MembersSkeleton />
            ) : memberSections.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm px-5">
                No leadership found.
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
                      {members.map((m) => (
                        <PersonRow
                          key={m.pubkey}
                          pubkey={m.pubkey}
                          label={m.isFounder ? 'Founder' : 'Moderator'}
                          size="sm"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* FAB-triggered compose modal — used by the \"New post\" FAB item.
          Composes a NIP-22 reply against the community event itself. */}
      <ReplyComposeModal
        event={event}
        open={composeOpen}
        onOpenChange={setComposeOpen}
      />

      {/* Reply button on the engagement bar opens the same compose modal,
          tracked via a separate `replyOpen` slot so the two entry points
          can't interleave state. */}
      <ReplyComposeModal
        event={event}
        open={replyOpen}
        onOpenChange={setReplyOpen}
      />

      {/* Engagement-bar \"more\" menu — repost / quote / share-this-event. */}
      <NoteMoreMenu
        event={event}
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
      />

      {/* Tapping a repost / quote / like counter on the stats row opens
          a modal listing the people who took that action. */}
      <InteractionsModal
        eventId={event.id}
        open={interactionsOpen}
        onOpenChange={setInteractionsOpen}
        initialTab={interactionsTab}
      />

      {/* FAB-triggered calendar event creation dialog. Campaigns and
          pledges navigate to their dedicated create pages with
          `?org=<naddr>` so the implicit-tagging flow can resolve. */}
      {communityATag && (
        <CreateCommunityEventDialog
          communityATag={communityATag}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
        />
      )}
      </div>
    </main>
  );
}
