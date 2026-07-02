import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  HandHeart,
  MapPin,
  Megaphone,
  MoreVertical,
  Pencil,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { CampaignCard } from '@/components/CampaignCard';
import { DetailReplySkeleton } from '@/components/DetailStory';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { PledgeCard } from '@/components/PledgeCard';
import { PostActionBar } from '@/components/PostActionBar';
import { CommentsSection } from '@/components/CommentsSection';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { PinnedCommentHeader } from '@/components/PinnedCommentHeader';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { FollowToggleButton } from '@/components/FollowButton';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useComments } from '@/hooks/useComments';
import { useCommunityBookmarks } from '@/hooks/useCommunityBookmarks';
import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useEventStats } from '@/hooks/useTrending';
import { useNow } from '@/hooks/useNow';
import { useOrganizationActivity } from '@/hooks/useOrganizationActivity';
import { usePinnedEventComments } from '@/hooks/usePinnedEventComments';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import { CommunityModerationContext } from '@/contexts/CommunityModerationContext';
import { applyCommunityModerationToEvents, parseCommunityEvent } from '@/lib/communityUtils';
import type { ParsedCampaign } from '@/lib/campaign';
import { type Action } from '@/hooks/useActions';
import { getGeoDisplayName } from '@/lib/countries';
import { formatNumber } from '@/lib/formatNumber';
import { genUserName, getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonRow({ pubkey, label, size = 'md' }: { pubkey: string; label?: string; size?: 'sm' | 'md' }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarUrl = sanitizeUrl(metadata?.picture);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-10';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <div className="flex items-center gap-3 py-1">
      <Link to={profileUrl} className="flex items-center gap-3 group flex-1 min-w-0">
        <Avatar className={cn(avatarCls, 'ring-2 ring-background')}>
          <AvatarImage src={avatarUrl} />
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

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
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

function formatShelfEventTime(event: NostrEvent): string {
  if (event.kind === 31922) return 'All day';

  const start = getTag(event.tags, 'start');
  if (!start) return '';

  const startTs = parseInt(start, 10);
  if (!Number.isFinite(startTs) || startTs <= 0) return '';

  const end = getTag(event.tags, 'end');
  const endTs = end ? parseInt(end, 10) : undefined;
  const timezone = getTag(event.tags, 'start_tzid');
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  });
  const startLabel = timeFormatter.format(new Date(startTs * 1000));
  if (!endTs || !Number.isFinite(endTs) || endTs <= startTs) return startLabel;
  return `${startLabel} - ${timeFormatter.format(new Date(endTs * 1000))}`;
}

function parseShelfLocation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return raw;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return raw;
    const record = parsed as Record<string, unknown>;
    if (typeof record.description === 'string' && record.description) return record.description;
    if (typeof record.name === 'string' && record.name) return record.name;
    if (typeof record.address === 'string' && record.address) return record.address;
  } catch {
    return raw;
  }
  return raw;
}

function ActivityTypePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}

function PledgeShelfCard({ pledge }: { pledge: Action }) {
  const { t } = useTranslation();
  return (
    <PledgeCard
      action={pledge}
      variant="shelf"
      showAuthor
      showTranslate
      footerAddon={
        <ActivityTypePill icon={<Megaphone className="size-3.5 text-primary" />} label={t('groups.detail.pledge')} />
      }
    />
  );
}

function CalendarEventShelfCard({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const { translatedEvent: displayEvent, translateAction } = useEventTranslation(event, {
    iconOnly: true,
    buttonClassName: 'size-8 rounded-full p-0 text-muted-foreground hover:text-primary hover:bg-primary/10',
  });
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const title = getTag(displayEvent.tags, 'title') ?? t('groups.detail.untitledEvent');
  const image = sanitizeUrl(getTag(displayEvent.tags, 'image'));
  const coverImage = image && !imageLoadFailed ? image : undefined;
  const summary = getTag(displayEvent.tags, 'summary') || displayEvent.content;
  const locationRaw = getTag(displayEvent.tags, 'location');
  const location = locationRaw ? parseShelfLocation(locationRaw) : undefined;
  const dateLabel = formatShelfEventDate(event);
  const timeLabel = formatShelfEventTime(event);
  const d = getTag(event.tags, 'd') ?? '';
  const eventCoord = `${event.kind}:${event.pubkey}:${d}`;
  const rsvps = useEventRSVPs(d ? eventCoord : undefined);
  const interestedCount = rsvps.accepted.length + rsvps.tentative.length;
  const naddr = nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: d,
  });
  return (
    <Link
      to={`/${naddr}`}
      className="group block h-[430px] w-[280px] shrink-0 rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
    >
      <Card className="overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col">
        <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
          {coverImage ? (
            <img
              src={coverImage}
              alt=""
              className="absolute inset-0 size-full object-cover"
              onError={() => setImageLoadFailed(true)}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <CalendarDays className="size-12 text-primary" />
            </div>
          )}
          {dateLabel && (
            <div className="absolute left-3 top-3 rounded-lg bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
              {dateLabel}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 p-5 flex-1">
          <div className="space-y-2">
            <h3 className="font-bold leading-tight tracking-tight text-lg line-clamp-2">
              {title}
            </h3>
            {summary.trim() && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {summary}
              </p>
            )}
          </div>

          <div className="flex-1" />

          <div className="grid gap-2 rounded-lg bg-muted/35 p-3 text-sm">
            {timeLabel && (
              <span className="inline-flex min-w-0 items-center gap-2 text-foreground">
                <Clock className="size-4 shrink-0 text-primary" />
                <span className="truncate">{timeLabel}</span>
              </span>
            )}
            {location && (
              <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                <MapPin className="size-4 shrink-0" />
                <span className="truncate">{location}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {t('groups.detail.interestedCount', { count: interestedCount })}
            </span>
            {event.kind === 31922 ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                {t('groups.detail.allDay')}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <div className="truncate">
              {t('groups.detail.byAuthor', { name: displayName })}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <ActivityTypePill icon={<CalendarDays className="size-3.5 text-primary" />} label={t('groups.detail.event')} />
              {translateAction}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

interface OfficialShelfProps {
  title: string;
  count: number;
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}

/** Wraps the mixed official activity rail for campaigns, pledges, and events. */
function OfficialShelf({ title, count, isLoading, isEmpty, children }: OfficialShelfProps) {
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
      </div>
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 flex items-stretch gap-3 overflow-x-auto scrollbar-none pb-1">
        {children}
      </div>
    </section>
  );
}

function OfficialActivityShelves({
  campaigns,
  campaignsLoading,
  pledges,
  pledgesLoading,
  events,
  eventsLoading,
  now,
}: {
  campaigns: ParsedCampaign[];
  campaignsLoading: boolean;
  pledges: Action[];
  pledgesLoading: boolean;
  events: NostrEvent[];
  eventsLoading: boolean;
  now: number;
}) {
  const { t } = useTranslation();
  // All loaded campaigns. Closure is via NIP-09 deletion (relay-level),
  // so anything that reached us is current.
  const liveCampaigns = campaigns;

  // Drop expired pledges; mixed activity is sorted newest publish first.
  const livePledges = useMemo(() => {
    return pledges.filter((p) => !p.deadline || p.deadline > now);
  }, [pledges, now]);

  // Drop past events; mixed activity is sorted newest publish first.
  const upcomingEvents = useMemo(() => {
    return events.filter((e) => getCalendarEventEnd(e) >= now);
  }, [events, now]);

  const mixedActivity = useMemo(() => {
    const items: Array<
      | { type: 'campaign'; id: string; createdAt: number; campaign: ParsedCampaign }
      | { type: 'pledge'; id: string; createdAt: number; pledge: Action }
      | { type: 'event'; id: string; createdAt: number; event: NostrEvent }
    > = [
      ...liveCampaigns.map((campaign) => ({
        type: 'campaign' as const,
        id: campaign.aTag,
        createdAt: campaign.createdAt,
        campaign,
      })),
      ...livePledges.map((pledge) => ({
        type: 'pledge' as const,
        id: pledge.event.id,
        createdAt: pledge.createdAt,
        pledge,
      })),
      ...upcomingEvents.map((event) => ({
        type: 'event' as const,
        id: event.id,
        createdAt: event.created_at,
        event,
      })),
    ];

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [liveCampaigns, livePledges, upcomingEvents]);

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

  return (
    <div className="space-y-1">
      <OfficialShelf
        title={t('groups.detail.officialActivity')}
        count={mixedActivity.length}
        isLoading={campaignsLoading || pledgesLoading || eventsLoading}
        isEmpty={mixedActivity.length === 0}
      >
        {mixedActivity.map((item) => {
          if (item.type === 'campaign') {
            return (
              <CampaignCard
                key={`campaign:${item.id}`}
                campaign={item.campaign}
                variant="shelf"
                footerBadge={<ActivityTypePill icon={<HandHeart className="size-3.5 text-primary" />} label={t('groups.detail.campaign')} />}
              />
            );
          }

          if (item.type === 'pledge') {
            return <PledgeShelfCard key={`pledge:${item.id}`} pledge={item.pledge} />;
          }

          return <CalendarEventShelfCard key={`event:${item.id}`} event={item.event} />;
        })}
      </OfficialShelf>
    </div>
  );
}

function GroupActionColumn({
  orgNaddr,
  organizationName,
}: {
  orgNaddr: string;
  organizationName: string;
}) {
  const { t } = useTranslation();
  const createQuery = orgNaddr ? `?org=${orgNaddr}` : '';

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <CardContent className="relative space-y-4 p-4 sm:p-5">
        <div aria-hidden className="absolute -right-12 -top-12 size-32 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-16 left-8 size-28 rounded-full bg-secondary/20 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('groups.detail.officialTools')}</p>
            <h2 className="text-xl font-semibold tracking-tight">{t('groups.detail.startSomething')}</h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {t('groups.detail.officialToolsDescription', { name: organizationName })}
            </p>
          </div>
          <div className="hidden rounded-full border border-primary/15 bg-primary/10 p-2 text-primary sm:block lg:hidden xl:block">
            <Users className="size-5" />
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-3">
          <StartCampaignLink
            to={`/campaigns/new${createQuery}`}
            className="group col-span-2 overflow-hidden rounded-2xl border border-primary/20 bg-primary text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0"
          >
            <div className="relative min-h-32 p-4">
              <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full bg-white/15" />
              <div className="relative flex h-full flex-col justify-between gap-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-white/15 p-2 backdrop-blur">
                    <HandHeart className="size-5" />
                  </span>
                  <ChevronRight className="size-5 transition-transform group-hover:translate-x-0.5" />
                </div>
                <span>
                  <span className="block text-lg font-semibold">{t('groups.detail.launchCampaign')}</span>
                  <span className="mt-1 block text-sm text-primary-foreground/80">{t('groups.detail.launchCampaignDescription')}</span>
                </span>
              </div>
            </div>
          </StartCampaignLink>

          <Link
            to={`/pledges/new${createQuery}`}
            className="group rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0"
          >
            <span className="mb-5 flex items-center justify-between gap-2">
              <span className="rounded-full bg-primary/10 p-2 text-primary">
                <Megaphone className="size-4" />
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
            <span className="block font-semibold">{t('groups.detail.pledge')}</span>
            <span className="mt-1 block text-xs leading-4 text-muted-foreground">{t('groups.detail.pledgeDescription')}</span>
          </Link>

          <Link
            to={`/events/new${createQuery}`}
            className="group rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0"
          >
            <span className="mb-5 flex items-center justify-between gap-2">
              <span className="rounded-full bg-primary/10 p-2 text-primary">
                <CalendarDays className="size-4" />
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
            <span className="block font-semibold">{t('groups.detail.event')}</span>
            <span className="mt-1 block text-xs leading-4 text-muted-foreground">{t('groups.detail.eventDescription')}</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommunityDetailPage({ event }: { event: NostrEvent }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false);
  const descriptionPreviewRef = useRef<HTMLDivElement>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteMutation = useDeleteEvent();
  const { translatedEvent: displayEvent, translateAction } = useEventTranslation(event);

  // Parse community definition
  const community = useMemo(() => parseCommunityEvent(displayEvent), [displayEvent]);
  const name = community?.name ?? 'Unnamed Group';
  const description = community?.description ?? '';
  const image = community?.image;
  const cover = sanitizeUrl(image);
  const communityATag = community?.aTag ?? '';
  const founder = useAuthor(event.pubkey);
  const founderMetadata: NostrMetadata | undefined = founder.data?.metadata;
  const founderName = getDisplayName(founderMetadata, event.pubkey);
  const founderProfileUrl = useProfileUrl(event.pubkey, founderMetadata);
  const founderPicture = sanitizeUrl(founderMetadata?.picture);
  const founderInitials = founderName.slice(0, 2).toUpperCase();
  const countryLabel = community?.countryCode ? getGeoDisplayName(community.countryCode) : undefined;

  const descriptionText = description.trim();

  useEffect(() => {
    if (!descriptionText) {
      setDescriptionCanExpand(false);
      return;
    }
    if (descriptionExpanded) return;

    const id = window.requestAnimationFrame(() => {
      const el = descriptionPreviewRef.current;
      setDescriptionCanExpand(!!el && el.scrollHeight > el.clientHeight + 1);
    });

    return () => window.cancelAnimationFrame(id);
  }, [descriptionExpanded, descriptionText]);

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
    content: descriptionText,
    sig: '',
  }), [descriptionText, event.id, event.pubkey, event.created_at]);

  // ── Members ─────────────────────────────────────────────────────────────────
  // Agora's organization model has only two trust tiers — founder and
  // moderators. The member preview and dialog show exactly that roster,
  // read directly from the parsed
  // community. `useCommunityMembers` still resolves moderation state
  // (content bans, reports) used by the comment thread below.
  const { moderation, rankMap, isLoading: membersLoading } = useCommunityMembers(community);

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
      toast({ title: isFounder ? 'You founded this group' : 'You moderate this group' });
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
  // The UI labels this roster as members, but the underlying org model is
  // founder + moderators only.
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
  const {
    pinnedEvents,
    isPinned,
    canManagePins,
    togglePin,
  } = usePinnedEventComments(communityATag || undefined, event.pubkey);

  // ── Official activity shelves ─────────────────────────────────────────────
  // Author-filtered to founder + moderators (see useOrganizationActivity).
  // These power the campaign/pledge/event shelves rendered above the
  // comments section.
  const { data: orgActivity, isLoading: orgActivityLoading } = useOrganizationActivity(community);
  const now = useNow(60_000);

  // naddr for this community — used by the create CTAs (passed to create
  // pages via `?org=`) so the forms can resolve the implicit org context.
  // Stable per render of the community
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
  // Pulled from NIP-85 for the threaded-comments header.
  const { data: engagementStats, isLoading: statsLoading } = useEventStats(event.id, event);
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

  const pinnedNodes = useMemo(
    () => pinnedEvents.map((event): ReplyNode => ({ event, children: [] })),
    [pinnedEvents],
  );

  // ── Delete handler ─────────────────────────────────────────────────────────
  // Founder-only. Publishes a NIP-09 kind 5 deletion request referencing the
  // community definition (kind 34550) by both `e` and `a` tags so relays can
  // drop it from both id-based and addressable lookups. After the request
  // ships we invalidate every org-related cache so the page the user lands
  // on (`/communities`) shows the deletion immediately, even if some relays
  // haven't propagated yet.
  const handleDeleteOrganization = useCallback(() => {
    if (!community) return;
    deleteMutation.mutate(
      {
        eventId: event.id,
        eventKind: event.kind,
        eventPubkey: event.pubkey,
        eventDTag: community.dTag,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Group deleted',
            description:
              'A deletion request was published. Well-behaved relays will drop the group from feeds.',
          });
          setDeleteConfirmOpen(false);
          void queryClient.invalidateQueries({
            queryKey: ['addr-event', event.kind, event.pubkey, community.dTag],
          });
          void queryClient.invalidateQueries({ queryKey: ['community-definition', community.aTag] });
          void queryClient.invalidateQueries({ queryKey: ['manageable-organizations'] });
          void queryClient.invalidateQueries({ queryKey: ['featured-organizations'] });
          void queryClient.invalidateQueries({ queryKey: ['followed-organizations'] });
          navigate('/groups');
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          toast({
            title: 'Could not delete group',
            description: msg,
            variant: 'destructive',
          });
        },
      },
    );
  }, [community, deleteMutation, event, navigate, queryClient, toast]);

  const moderationCtx = useMemo(
    () => communityATag ? { communityATag, moderation, rankMap } : null,
    [communityATag, moderation, rankMap],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  const bannerActionClassName = 'p-2.5 rounded-full bg-black/30 text-white/90 backdrop-blur-md hover:text-white hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:pointer-events-none transition-colors';
  const canCreateOfficial = !!communityATag && membershipFollow;
  const visibleMemberCount = Math.min(leadershipPubkeys.length, 6);
  const hiddenMemberCount = Math.max(0, leadershipPubkeys.length - visibleMemberCount);
  const groupActionColumn = canCreateOfficial ? (
    <GroupActionColumn
      orgNaddr={orgNaddr}
      organizationName={name}
    />
  ) : null;

  return (
    <main className="min-h-screen pb-16">
      <CommunityModerationContext.Provider value={moderationCtx}>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="relative isolate w-full overflow-hidden bg-gradient-to-br from-primary/40 via-primary/20 to-secondary min-h-[78svh] sm:min-h-0 sm:aspect-[21/9] lg:aspect-[3/1]">
          {cover ? (
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/50 via-primary/25 to-secondary">
              <Users className="size-20 text-primary" />
            </div>
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 top-[18%] bg-gradient-to-t from-black/95 via-black/80 to-transparent" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />

          <div className="absolute inset-x-0 top-0 z-10 px-5 sm:px-6 lg:px-0 pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/30 pl-2 pr-3.5 text-white backdrop-blur-md hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
                aria-label={t('common.goBack')}
              >
                <ChevronLeft className="size-5" />
                <span className="hidden text-sm font-medium sm:inline">{t('common.back')}</span>
              </button>

              <div className="flex items-center gap-1.5">
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
                      'h-10 rounded-full shadow-none backdrop-blur-md',
                      !communityFollowed && 'bg-white/95 text-black hover:bg-white',
                      communityFollowed && 'bg-black/30 border-white/40 text-white hover:bg-destructive/70 hover:text-white hover:border-destructive/60',
                    )}
                  />
                )}
                {isFounder && community && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={bannerActionClassName} aria-label={t('groups.detail.moreActions')}>
                        <MoreVertical className="size-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="min-w-[180px]">
                      <DropdownMenuItem
                        onSelect={() => {
                          const naddr = nip19.naddrEncode({
                            kind: event.kind,
                            pubkey: event.pubkey,
                            identifier: community.dTag,
                          });
                          navigate(`/groups/new?edit=${naddr}`);
                        }}
                      >
                        <Pencil className="size-4 mr-2" />
                        {t('groups.detail.editGroup')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setDeleteConfirmOpen(true);
                        }}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="size-4 mr-2" />
                        {t('groups.detail.deleteGroup')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 px-5 sm:px-6 lg:px-0 pb-[max(env(safe-area-inset-bottom),1.75rem)] pt-16 sm:pt-20">
            <div className="max-w-6xl mx-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
              <h1 className="max-w-4xl text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white">
                {name}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm sm:text-base text-white/90">
                <Link
                  to={founderProfileUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2.5 hover:text-white motion-safe:transition-colors group [text-shadow:none]"
                >
                  <Avatar className="size-8 sm:size-9 ring-2 ring-white/30">
                    {founderPicture && <AvatarImage src={founderPicture} alt="" />}
                    <AvatarFallback className="bg-white/15 text-xs text-white">
                      {founderInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
                    {t('groups.detail.by')}{' '}
                    <span className="font-semibold underline-offset-4 group-hover:underline">
                      {founderName}
                    </span>
                  </span>
                </Link>

                {countryLabel && (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-white/85">
                    <MapPin className="size-4" />
                    {countryLabel}
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-white/15 pt-3 [text-shadow:none] [&_button]:!text-white/90 [&_button:hover]:!bg-white/15 [&_button:hover]:!text-white [&_button]:transition-colors">
                <PostActionBar
                  event={event}
                  replyLabel={t('groups.detail.comment')}
                  showShareInSidebar
                  onReply={() => setReplyOpen(true)}
                  onMore={() => setMoreMenuOpen(true)}
                  translateAction={translateAction}
                />
              </div>
            </div>
          </div>
        </header>

          {(leadershipPubkeys.length > 0 || descriptionText) && (
            <section className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 pt-6">
              <div className="space-y-5 border-b border-border/60 pb-6">
                {leadershipPubkeys.length > 0 && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t('groups.detail.members')}
                      </div>
                      <PeopleAvatarStack
                        pubkeys={leadershipPubkeys}
                        maxVisible={visibleMemberCount}
                        size="comment"
                        forceCircle
                        showOverflowCount={false}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto justify-start p-0 text-sm font-medium sm:mb-1"
                      onClick={() => setMembersDialogOpen(true)}
                    >
                      {hiddenMemberCount > 0 && (
                        <span className="mr-2 text-muted-foreground">
                          {t('groups.detail.moreMembers', { count: hiddenMemberCount })}
                        </span>
                      )}
                      {t('groups.detail.viewMembers')}
                      <ChevronRight className="ml-1 size-4" />
                    </Button>
                  </div>
                )}

                {descriptionText && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t('groups.detail.about')}
                    </div>
                    <div className="relative">
                      <div
                        ref={descriptionPreviewRef}
                        className={cn(
                          'text-[15px] sm:text-base leading-relaxed text-foreground/90 break-words',
                          !descriptionExpanded && 'max-h-[6.5rem] overflow-hidden',
                        )}
                      >
                        <NoteContent event={descriptionPseudoEvent} disableEmbeds disableNoteEmbeds />
                      </div>
                      {!descriptionExpanded && descriptionCanExpand && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>
                    {descriptionCanExpand && (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm"
                        onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                      >
                        {descriptionExpanded ? t('common.showLess') : t('common.readMore')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {pinnedNodes.length > 0 && (
            <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 pt-6">
              <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                <ThreadedReplyList
                  roots={pinnedNodes}
                  renderItemHeader={(event) => (
                    <OrganizationPinHeader
                      isPinned={isPinned(event.id)}
                      canManagePins={canManagePins}
                      pinPending={togglePin.isPending}
                      onTogglePin={() => handleTogglePin(event)}
                    />
                  )}
                />
              </div>
            </div>
          )}

          {/* ── Body — campaign-detail-style two-column layout ───────────── */}
          <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
            <div className="lg:flex lg:gap-8 lg:items-start">
              {groupActionColumn && <div className="lg:hidden mb-6">{groupActionColumn}</div>}

              <div className="flex-1 min-w-0 space-y-8">
                {/* Official-activity shelves. Hidden entirely when empty. */}
                <OfficialActivityShelves
                  campaigns={orgActivity?.campaigns ?? []}
                  campaignsLoading={orgActivityLoading}
                  pledges={orgActivity?.pledges ?? []}
                  pledgesLoading={orgActivityLoading}
                  events={orgActivity?.events ?? []}
                  eventsLoading={orgActivityLoading}
                  now={now}
                />

                {/* Comments — NIP-22 thread on the community event itself. */}
                <div id="org-activity" className="scroll-mt-20">
                  <CommentsSection
                    title={t('groups.detail.comments')}
                    countLabel={engagementStats?.replies ? (
                      <>
                        {formatNumber(engagementStats.replies)}{' '}
                        {t('groups.detail.commentNoun', { count: engagementStats.replies })}
                      </>
                    ) : undefined}
                  >
                    <DetailCommentComposer event={event} />

                    {commentsLoading && statsLoading && replyTree.length === 0 ? (
                      <div>
                        {Array.from({ length: 3 }).map((_, i) => (
                          <DetailReplySkeleton key={i} />
                        ))}
                      </div>
                    ) : replyTree.length > 0 ? (
                      <ThreadedReplyList
                        roots={replyTree}
                        renderItemHeader={(event) => (
                          <OrganizationPinHeader
                            isPinned={isPinned(event.id)}
                            canManagePins={canManagePins}
                            pinPending={togglePin.isPending}
                            onTogglePin={() => handleTogglePin(event)}
                          />
                        )}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReplyOpen(true)}
                        className="block w-full px-6 py-10 text-center hover:bg-foreground/5 transition-colors"
                      >
                        <p className="text-base font-medium text-foreground">
                          {t('groups.detail.noCommentsTitle')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('groups.detail.noCommentsHint')}
                        </p>
                      </button>
                    )}
                  </CommentsSection>
                </div>
              </div>

              {groupActionColumn && (
                <aside className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start">
                  <div className="lg:sticky lg:top-4">{groupActionColumn}</div>
                </aside>
              )}
            </div>
          </div>
      </CommunityModerationContext.Provider>

      {/* Leadership dialog — opened from the below-hero member section. */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {t('groups.detail.members')}
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
                {t('groups.detail.noMembersFound')}
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
                          label={m.isFounder ? t('groups.detail.founder') : t('groups.detail.moderator')}
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

      {/* Reply button on the engagement bar opens the same compose modal,
          composing a NIP-22 reply against the community event itself. */}
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

      {/* Founder-only delete confirmation. NIP-09 is advisory — relays decide
          whether to honor the request — so the copy makes the limitation
          explicit and steers founders toward "Edit organization" if they
          just want to change something. */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request for{' '}
              <span className="font-medium text-foreground">{name}</span>.
              Well-behaved relays will drop the group from feeds and
              direct links. Campaigns, pledges, and posts published under
              the group stay on-chain regardless. This action cannot
              be undone — to change the name, banner, or moderators, edit
              the group instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteOrganization();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );

  function handleTogglePin(event: NostrEvent) {
    const wasPinned = isPinned(event.id);
    togglePin.mutate(event.id, {
      onSuccess: () => {
        toast({ title: wasPinned ? 'Unpinned from group' : 'Pinned to group' });
      },
      onError: () => {
        toast({ title: 'Failed to update group pins', variant: 'destructive' });
      },
    });
  }
}

function OrganizationPinHeader({
  isPinned,
  canManagePins,
  pinPending,
  onTogglePin,
}: {
  isPinned: boolean;
  canManagePins: boolean;
  pinPending: boolean;
  onTogglePin: () => void;
}) {
  return (
    <PinnedCommentHeader
      isPinned={isPinned}
      canManagePins={canManagePins}
      pinPending={pinPending}
      onTogglePin={onTogglePin}
    />
  );
}
