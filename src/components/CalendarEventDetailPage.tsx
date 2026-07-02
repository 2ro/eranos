import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  MapPin,
  Clock,
  Users,
  Check,
  X as XIcon,
  Star,
  Pencil,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DetailCommentComposer } from '@/components/DetailCommentComposer';
import { DetailReplySkeleton, DetailStory } from '@/components/DetailStory';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { PostActionBar } from '@/components/PostActionBar';
import { PinnedCommentHeader } from '@/components/PinnedCommentHeader';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { RSVPAvatars } from '@/components/RSVPAvatars';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useComments } from '@/hooks/useComments';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import { useMyRSVP } from '@/hooks/useMyRSVP';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { usePinnedEventComments } from '@/hooks/usePinnedEventComments';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { openUrl } from '@/lib/downloadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// --- Helpers ---

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
}

function parseLocation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return raw;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.description === 'string' && obj.description) return obj.description;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    if (typeof obj.address === 'string' && obj.address) return obj.address;
  } catch {
    // not JSON, return as-is
  }
  return raw;
}

function getEventCoord(event: NostrEvent): string {
  const d = getTag(event.tags, 'd') ?? '';
  return `${event.kind}:${event.pubkey}:${d}`;
}

function formatDetailDate(event: NostrEvent, locale: string, dateNotSpecified: string): string {
  const startRaw = getTag(event.tags, 'start');
  const endRaw = getTag(event.tags, 'end');
  if (!startRaw) return dateNotSpecified;

  if (event.kind === 31922) {
    const parseDate = (d: string) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day);
    };
    const fmt = (d: Date) => {
      return d.toLocaleDateString(locale, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
    };

    const startDate = parseDate(startRaw);
    if (isNaN(startDate.getTime())) return startRaw;

    if (endRaw) {
      const endDate = parseDate(endRaw);
      if (!isNaN(endDate.getTime()) && endDate > startDate) {
        endDate.setDate(endDate.getDate() - 1);
        if (endDate > startDate) return `${fmt(startDate)} - ${fmt(endDate)}`;
      }
    }

    return fmt(startDate);
  }

  // kind 31923 — unix timestamps
  const startTs = parseInt(startRaw, 10) * 1000;
  const endTs = endRaw ? parseInt(endRaw, 10) * 1000 : undefined;
  const startTzid = getTag(event.tags, 'start_tzid');

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...(startTzid ? { timeZone: startTzid } : {}),
  };

  const dateFmt = new Intl.DateTimeFormat(locale, opts);
  const startStr = dateFmt.format(new Date(startTs));

  if (endTs) {
    const sameDay = new Date(startTs).toDateString() === new Date(endTs).toDateString();
    if (sameDay) {
      const timeFmt = new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit',
        ...(startTzid ? { timeZone: startTzid } : {}),
      });
      return `${startStr} - ${timeFmt.format(new Date(endTs))}`;
    }
    return `${startStr} - ${dateFmt.format(new Date(endTs))}`;
  }
  return startStr;
}

function formatCalendarHeroDate(event: NostrEvent, locale: string): string | null {
  const startRaw = getTag(event.tags, 'start');
  if (!startRaw) return null;

  if (event.kind === 31922) {
    const [year, month, day] = startRaw.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return startRaw;
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const timestamp = Number(startRaw);
  if (!Number.isFinite(timestamp)) return startRaw;
  const startTzid = getTag(event.tags, 'start_tzid');
  return new Date(timestamp * 1000).toLocaleDateString(locale, {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(startTzid ? { timeZone: startTzid } : {}),
  });
}

const ROLE_ORDER = ['host', 'speaker', 'moderator', 'participant'];
function roleSort(a: string, b: string): number {
  const ai = ROLE_ORDER.indexOf(a.toLowerCase());
  const bi = ROLE_ORDER.indexOf(b.toLowerCase());
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

// --- Sub-components ---

function PersonRow({ pubkey, label, size = 'md' }: { pubkey: string; label?: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarUrl = sanitizeUrl(metadata?.picture);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-11';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <Link to={profileUrl} className="flex items-center gap-3 group">
      <Avatar className={cn(avatarCls, 'ring-2 ring-background')}>
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold truncate group-hover:underline', size === 'sm' ? 'text-sm' : 'text-[15px]')}>{name}</p>
        {!label && size === 'md' && <p className="text-xs text-muted-foreground">{t('calendarEvents.detail.organizer')}</p>}
      </div>
      {label && (
        <Badge variant="secondary" className="ml-auto capitalize text-xs shrink-0">{label}</Badge>
      )}
    </Link>
  );
}

function EventDetailRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-3">
      <div className="mt-0.5 text-primary shrink-0">{icon}</div>
      <div className="min-w-0 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

// --- Main Component ---

export function CalendarEventDetailPage({ event }: { event: NostrEvent }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const author = useAuthor(event.pubkey);
  const { translatedEvent: displayEvent, translateAction } = useEventTranslation(event);

  const title = getTag(displayEvent.tags, 'title') ?? t('calendarEvents.detail.untitledEvent');
  const image = sanitizeUrl(getTag(displayEvent.tags, 'image'));
  const locationRaw = getTag(displayEvent.tags, 'location');
  const location = locationRaw ? parseLocation(locationRaw) : undefined;
  const summary = getTag(displayEvent.tags, 'summary');
  const hashtags = getAllTags(displayEvent.tags, 't').map(([, v]) => v).filter(Boolean);
  const links = getAllTags(displayEvent.tags, 'r').map(([, v]) => sanitizeUrl(v)).filter((v): v is string => !!v);

  const eventCoord = useMemo(() => getEventCoord(event), [event]);
  const dateStr = useMemo(() => formatDetailDate(event, i18n.language, t('calendarEvents.detail.dateNotSpecified')), [event, i18n.language, t]);
  const heroDate = useMemo(() => formatCalendarHeroDate(event, i18n.language), [event, i18n.language]);
  const organizerMetadata: NostrMetadata | undefined = author.data?.metadata;
  const organizerName = organizerMetadata?.display_name || organizerMetadata?.name || genUserName(event.pubkey);
  const organizerProfileUrl = useProfileUrl(event.pubkey, organizerMetadata);
  const organizerPicture = sanitizeUrl(organizerMetadata?.picture);
  const organizerInitials = organizerName.slice(0, 2).toUpperCase();

  // Participants grouped by role
  const participantsByRole = useMemo(() => {
    const pTags = getAllTags(event.tags, 'p');
    const groups = new Map<string, string[]>();
    for (const tag of pTags) {
      const pubkey = tag[1];
      const role = tag[3] || 'Participant';
      if (!pubkey) continue;
      const list = groups.get(role) ?? [];
      list.push(pubkey);
      groups.set(role, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => roleSort(a, b));
  }, [event.tags]);

  // RSVP state
  const rsvps = useEventRSVPs(eventCoord);
  const myRsvp = useMyRSVP(eventCoord);
  const publishRSVP = usePublishRSVP();
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);
  const {
    pinnedEvents,
    isPinned,
    canManagePins,
    togglePin,
  } = usePinnedEventComments(eventCoord, event.pubkey);
  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = user?.pubkey === event.pubkey;

  const replyTree = useMemo((): ReplyNode[] => {
    const buildNode = (comment: NostrEvent): ReplyNode => {
      const children = commentsData?.getDirectReplies(comment.id) ?? [];
      if (children.length <= 1) {
        return { event: comment, children: children.map((child) => buildNode(child)) };
      }

      const [first, ...rest] = children;
      return {
        event: comment,
        children: [buildNode(first)],
        hiddenChildren: rest.map((child) => buildNode(child)),
      };
    };

    return [...(commentsData?.topLevelComments ?? [])]
      .sort((a, b) => a.created_at - b.created_at)
      .map((comment) => buildNode(comment));
  }, [commentsData]);

  const pinnedNodes = useMemo(
    () => pinnedEvents.map((event): ReplyNode => ({ event, children: [] })),
    [pinnedEvents],
  );

  const storyEvent = useMemo<NostrEvent>(() => ({
    ...displayEvent,
    tags: displayEvent.tags.filter(([name]) => !['image', 'summary', 'title', 't'].includes(name)),
    content: displayEvent.content || summary || '',
  }), [displayEvent, summary]);

  const handleRSVP = useCallback(async (status: 'accepted' | 'declined' | 'tentative') => {
    if (status === myRsvp.status) return;
    try {
      await publishRSVP.mutateAsync({
        eventCoord,
        eventAuthorPubkey: event.pubkey,
        status,
      });
      toast({ title: t('calendarEvents.detail.rsvpUpdated') });
    } catch {
      toast({ title: t('calendarEvents.detail.rsvpFailed'), variant: 'destructive' });
    }
  }, [eventCoord, event.pubkey, myRsvp.status, publishRSVP, toast, t]);

  const showRSVP = !!user;
  const attendingCount = rsvps.accepted.length;
  const interestedCount = rsvps.tentative.length;
  const rsvpStatusLabel = myRsvp.status === 'accepted'
    ? t('calendarEvents.detail.youAreGoing')
    : myRsvp.status === 'tentative'
      ? t('calendarEvents.detail.youAreInterested')
      : myRsvp.status === 'declined'
        ? t('calendarEvents.detail.youCantGo')
        : t('calendarEvents.detail.chooseRsvp');

  const eventDetailsCard = (showRSVP || rsvps.total > 0 || links.length > 0) ? (
    <Card className="rounded-none border-0 bg-transparent shadow-none lg:rounded-xl lg:border lg:bg-card lg:shadow-sm">
      <CardContent className="p-0 lg:p-5 space-y-5">
        {showRSVP && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('calendarEvents.detail.rsvp')}</div>
              <span className="text-xs font-medium text-muted-foreground">{rsvpStatusLabel}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant={myRsvp.status === 'accepted' ? 'default' : 'outline'}
                disabled={publishRSVP.isPending}
                className={cn('rounded-full px-2', myRsvp.status === 'accepted' && 'bg-green-600 hover:bg-green-700 text-white')}
                onClick={() => handleRSVP('accepted')}
              >
                <Check className="size-3.5 mr-1" />
                {t('calendarEvents.detail.going')}
              </Button>
              <Button
                size="sm"
                variant={myRsvp.status === 'tentative' ? 'default' : 'outline'}
                disabled={publishRSVP.isPending}
                className={cn('rounded-full px-2', myRsvp.status === 'tentative' && 'bg-amber-500 hover:bg-amber-600 text-white')}
                onClick={() => handleRSVP('tentative')}
              >
                <Star className="size-3.5 mr-1" />
                {t('calendarEvents.detail.interested')}
              </Button>
              <Button
                size="sm"
                variant={myRsvp.status === 'declined' ? 'default' : 'outline'}
                disabled={publishRSVP.isPending}
                className={cn('rounded-full px-2', myRsvp.status === 'declined' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')}
                onClick={() => handleRSVP('declined')}
              >
                <XIcon className="size-3.5 mr-1" />
                {t('calendarEvents.detail.cantGo')}
              </Button>
            </div>
          </div>
        )}

        {rsvps.total > 0 && (
          <div className={cn('space-y-3', showRSVP && 'border-t border-border/60 pt-4')}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('calendarEvents.detail.attendees')}</div>
            <div className="space-y-3">
              {([
                [t('calendarEvents.detail.going'), rsvps.accepted, 'border-green-500/50 bg-green-500/5 text-green-600'],
                [t('calendarEvents.detail.interested'), rsvps.tentative, 'border-amber-500/50 bg-amber-500/5 text-amber-600'],
                [t('calendarEvents.detail.cantGo'), rsvps.declined, 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'],
              ] as const).map(([label, pks, cls]) => pks.length > 0 && (
                <div key={label} className="space-y-2">
                  <Badge variant="outline" className={cn(cls, 'shrink-0 text-xs')}>{label} ({pks.length})</Badge>
                  <RSVPAvatars pubkeys={pks} maxVisible={8} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className={cn('space-y-2', (showRSVP || rsvps.total > 0) && 'border-t border-border/60 pt-4')}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('calendarEvents.detail.links')}</div>
            <div className="space-y-1">
              {links.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => void openUrl(url)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <LinkIcon className="size-4 text-primary shrink-0" />
                  <span className="truncate flex-1">{url.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  ) : null;

  const participantsCard = participantsByRole.length > 0 ? (
    <Card className="border-0 bg-transparent shadow-none lg:border lg:bg-card lg:shadow-sm">
      <CardContent className="p-0 lg:p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('calendarEvents.detail.participants')}</div>
        <div className="space-y-2">
          {participantsByRole.map(([role, pubkeys]) =>
            pubkeys.map((pk) => <PersonRow key={`${role}-${pk}`} pubkey={pk} label={role} size="sm" />),
          )}
        </div>
      </CardContent>
    </Card>
  ) : null;
  const hasSideCards = !!eventDetailsCard || !!participantsCard;

  return (
    <main className="min-h-screen pb-16">
      <header className="relative isolate w-full overflow-hidden bg-gradient-to-br from-primary/35 via-primary/15 to-secondary min-h-[92svh] sm:min-h-0 sm:aspect-[21/9] lg:aspect-[3/1]">
        {image ? (
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <CalendarDays className="size-20 text-primary" />
          </div>
        )}
        <div aria-hidden className="absolute inset-x-0 bottom-0 top-[20%] bg-gradient-to-t from-black/95 via-black/80 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-10 px-5 sm:px-6 lg:px-0 pt-[max(env(safe-area-inset-top),1rem)]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
              className="inline-flex items-center gap-1.5 h-10 pl-2 pr-3.5 rounded-full bg-black/30 text-white backdrop-blur-md hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-safe:transition-colors"
              aria-label={t('common.goBack')}
            >
              <ChevronLeft className="size-5" />
              <span className="text-sm font-medium hidden sm:inline">{t('common.back')}</span>
            </button>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="h-10 rounded-full bg-black/30 text-white backdrop-blur-md shadow-none hover:bg-black/45 focus-visible:ring-white/80"
              >
                <Pencil className="size-4 mr-2" />
                {t('common.edit')}
              </Button>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-5 sm:px-6 lg:px-0 pb-[max(env(safe-area-inset-bottom),1.75rem)] pt-16 sm:pt-20">
          <div className="max-w-6xl mx-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white max-w-4xl">
              {title}
            </h1>

            <Link
              to={organizerProfileUrl}
              onClick={(e) => e.stopPropagation()}
              className="mt-5 inline-flex items-center gap-2.5 text-sm sm:text-base text-white/90 hover:text-white motion-safe:transition-colors group [text-shadow:none]"
            >
              <Avatar className="size-8 sm:size-9 ring-2 ring-white/30">
                {organizerPicture && <AvatarImage src={organizerPicture} alt="" />}
                <AvatarFallback className="text-xs bg-white/15 text-white">
                  {organizerInitials}
                </AvatarFallback>
              </Avatar>
              <span className="[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
                {t('calendarEvents.detail.hostedBy')}{' '}
                <span className="font-semibold underline-offset-4 group-hover:underline">
                  {organizerName}
                </span>
              </span>
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-sm font-medium text-white/85">
              {heroDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {heroDate}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {location}
                </span>
              )}
              {attendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" />
                  {t('calendarEvents.detail.attendingCount', { count: attendingCount })}
                </span>
              )}
              {interestedCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" />
                  {t('calendarEvents.detail.interestedCount', { count: interestedCount })}
                </span>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/15 [&_button]:!text-white/90 [&_button:hover]:!text-white [&_button:hover]:!bg-white/15 [&_button]:transition-colors [text-shadow:none]">
              <PostActionBar
                event={event}
                replyLabel={t('calendarEvents.detail.comment')}
                showShareInSidebar
                onReply={() => setReplyOpen(true)}
                onMore={() => setMoreMenuOpen(true)}
                translateAction={translateAction}
              />
            </div>
          </div>
        </div>
      </header>

      {pinnedNodes.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
          <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
            <ThreadedReplyList
              roots={pinnedNodes}
              renderItemHeader={(event) => (
                <EventPinHeader
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

      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-0 py-6 lg:py-10">
        <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="flex-1 min-w-0 space-y-8">
            <section className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <EventDetailRow icon={<Clock className="size-5" />}>
                  {dateStr}
                </EventDetailRow>
                {location && (
                  <EventDetailRow icon={<MapPin className="size-5" />}>
                    {location}
                  </EventDetailRow>
                )}
              </div>

              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {hashtags.map((tag) => (
                    <Link key={tag} to={`/t/${tag}`}>
                      <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 text-xs px-2.5 py-0.5">
                        #{tag}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              <DetailStory
                event={storyEvent}
                hasContent={storyEvent.content.trim().length > 0}
                heading={t('calendarEvents.detail.description')}
                headingId="event-details-heading"
                emptyText={t('calendarEvents.detail.emptyDescription')}
              />
            </section>

            {hasSideCards && (
              <div className="lg:hidden space-y-4">
                {eventDetailsCard}
                {participantsCard}
              </div>
            )}

            <section id="event-comments" className="scroll-mt-20">
              <div className="mt-6">
                <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
                  <h2 className="text-lg font-semibold tracking-tight">{t('calendarEvents.detail.comments')}</h2>
                  {replyTree.length > 0 ? (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {replyTree.length.toLocaleString()} {t('calendarEvents.detail.commentNoun', { count: replyTree.length })}
                    </span>
                  ) : null}
                </div>

                <DetailCommentComposer event={event} className="mb-3" />

                {commentsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <DetailReplySkeleton key={i} />
                    ))}
                  </div>
                ) : replyTree.length > 0 ? (
                  <ThreadedReplyList
                    roots={replyTree}
                    renderItemHeader={(event) => (
                      <EventPinHeader
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
                    className="block w-full rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center hover:bg-card hover:border-primary/40 transition-colors"
                  >
                    <p className="text-base font-medium text-foreground">{t('calendarEvents.detail.noCommentsTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('calendarEvents.detail.noCommentsHint')}</p>
                  </button>
                )}
              </div>
            </section>
          </div>

          {hasSideCards && (
            <aside className="hidden lg:block lg:w-[360px] lg:shrink-0 lg:self-start">
              <div className="lg:sticky lg:top-4 space-y-4">
                {eventDetailsCard}
                {participantsCard}
              </div>
            </aside>
          )}
        </div>

        <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
        <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
        {canEdit && (
          <CreateCommunityEventDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            event={event}
          />
        )}
      </div>
    </main>
  );

  function handleTogglePin(event: NostrEvent) {
    const wasPinned = isPinned(event.id);
    togglePin.mutate(event.id, {
      onSuccess: () => {
        toast({ title: wasPinned ? t('calendarEvents.detail.unpinnedToast') : t('calendarEvents.detail.pinnedToast') });
      },
      onError: () => {
        toast({ title: t('calendarEvents.detail.pinFailed'), variant: 'destructive' });
      },
    });
  }
}

function EventPinHeader({
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
