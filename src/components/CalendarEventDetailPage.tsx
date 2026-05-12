import { useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
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
import { Separator } from '@/components/ui/separator';
import { NoteContent } from '@/components/NoteContent';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { PostActionBar } from '@/components/PostActionBar';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { RSVPAvatars } from '@/components/RSVPAvatars';
import { Skeleton } from '@/components/ui/skeleton';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useComments } from '@/hooks/useComments';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { useMyRSVP } from '@/hooks/useMyRSVP';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
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

function formatDetailDate(event: NostrEvent): string {
  const startRaw = getTag(event.tags, 'start');
  const endRaw = getTag(event.tags, 'end');
  if (!startRaw) return 'Date not specified';

  if (event.kind === 31922) {
    const parseDate = (d: string) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day);
    };
    const fmt = (d: Date) => {
      return d.toLocaleDateString('en-US', {
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

  const dateFmt = new Intl.DateTimeFormat('en-US', opts);
  const startStr = dateFmt.format(new Date(startTs));

  if (endTs) {
    const sameDay = new Date(startTs).toDateString() === new Date(endTs).toDateString();
    if (sameDay) {
      const timeFmt = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit',
        ...(startTzid ? { timeZone: startTzid } : {}),
      });
      return `${startStr} - ${timeFmt.format(new Date(endTs))}`;
    }
    return `${startStr} - ${dateFmt.format(new Date(endTs))}`;
  }
  return startStr;
}

const ROLE_ORDER = ['host', 'speaker', 'moderator', 'participant'];
function roleSort(a: string, b: string): number {
  const ai = ROLE_ORDER.indexOf(a.toLowerCase());
  const bi = ROLE_ORDER.indexOf(b.toLowerCase());
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

// --- Sub-components ---

function PersonRow({ pubkey, label, size = 'md' }: { pubkey: string; label?: string; size?: 'sm' | 'md' }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-11';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <Link to={profileUrl} className="flex items-center gap-3 group">
      <Avatar className={cn(avatarCls, 'ring-2 ring-background')}>
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold truncate group-hover:underline', size === 'sm' ? 'text-sm' : 'text-[15px]')}>{name}</p>
        {!label && size === 'md' && <p className="text-xs text-muted-foreground">Organizer</p>}
      </div>
      {label && (
        <Badge variant="secondary" className="ml-auto capitalize text-xs shrink-0">{label}</Badge>
      )}
    </Link>
  );
}

// --- Main Component ---

export function CalendarEventDetailPage({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const title = getTag(event.tags, 'title') ?? 'Untitled Event';
  const image = getTag(event.tags, 'image');
  const locationRaw = getTag(event.tags, 'location');
  const location = locationRaw ? parseLocation(locationRaw) : undefined;
  const summary = getTag(event.tags, 'summary');
  const hashtags = getAllTags(event.tags, 't').map(([, v]) => v).filter(Boolean);
  const links = getAllTags(event.tags, 'r').map(([, v]) => sanitizeUrl(v)).filter((v): v is string => !!v);

  const eventCoord = useMemo(() => getEventCoord(event), [event]);
  const dateStr = useMemo(() => formatDetailDate(event), [event]);

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

  const handleRSVP = useCallback(async (status: 'accepted' | 'declined' | 'tentative') => {
    if (status === myRsvp.status) return;
    try {
      await publishRSVP.mutateAsync({
        eventCoord,
        eventAuthorPubkey: event.pubkey,
        status,
      });
      toast({ title: 'RSVP updated' });
    } catch {
      toast({ title: 'Failed to update RSVP', variant: 'destructive' });
    }
  }, [eventCoord, event.pubkey, myRsvp.status, publishRSVP, toast]);

  const showRSVP = !!user;

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* ── Standard top bar ── */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Event Details</h1>
        {canEdit && (
          <button
            className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
            onClick={() => setEditOpen(true)}
            aria-label="Edit event"
          >
            <Pencil className="size-5" />
          </button>
        )}
      </div>

      {/* ── Cover image ── */}
      {image ? (
        <div className="aspect-[2/1] w-full overflow-hidden">
          <img src={image} alt={title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[3/1] w-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <CalendarDays className="size-20 text-primary/20" />
        </div>
      )}

      {/* ── Content ── */}
      <div className="px-5 mt-5 space-y-5">
        {/* Title */}
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{title}</h2>
        {/* Organizer row */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <PersonRow pubkey={event.pubkey} />
          </div>
        </div>

        {/* Date & Location — sidebar-style pills */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85">
            <Clock className="size-5 text-primary shrink-0" />
            <span className="text-sm">{dateStr}</span>
          </div>
          {location && (
            <div className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85">
              <MapPin className="size-5 text-primary shrink-0" />
              <span className="text-sm">{location}</span>
            </div>
          )}
        </div>

        {/* Hashtags */}
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

        {/* Description */}
        {(event.content || summary) && (
          <>
            <Separator />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">About</h2>
              {event.content ? (
                <NoteContent event={event} className="text-sm leading-relaxed text-foreground" hideEmbedImages={!!image} />
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
              )}
            </section>
          </>
        )}

        {/* External links */}
        {links.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {links.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85 hover:bg-secondary/60 transition-colors"
              >
                <LinkIcon className="size-5 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{url.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="size-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Participants */}
        {participantsByRole.length > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users className="size-4" /> Participants
              </h2>
              <div className="space-y-2">
                {participantsByRole.map(([role, pubkeys]) =>
                  pubkeys.map((pk) => <PersonRow key={pk} pubkey={pk} label={role} size="sm" />),
                )}
              </div>
            </section>
          </>
        )}

        {/* Attendees */}
        {rsvps.total > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users className="size-4" /> Attendees
              </h2>
              <div className="space-y-2.5">
                {([
                  ['Going', rsvps.accepted, 'border-green-500/50 bg-green-500/5 text-green-600'],
                  ['Interested', rsvps.tentative, 'border-amber-500/50 bg-amber-500/5 text-amber-600'],
                  ["Can't Go", rsvps.declined, 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'],
                ] as const).map(([label, pks, cls]) => pks.length > 0 && (
                  <div key={label} className="flex items-center gap-3">
                    <Badge variant="outline" className={cn(cls, 'shrink-0 text-xs')}>{label} ({pks.length})</Badge>
                    <RSVPAvatars pubkeys={pks} maxVisible={8} size="sm" />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* RSVP section */}
        {showRSVP && (
          <>
            <Separator />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Check className="size-4" /> RSVP
              </h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={myRsvp.status === 'accepted' ? 'default' : 'outline'}
                  disabled={publishRSVP.isPending}
                  className={cn('flex-1 rounded-full', myRsvp.status === 'accepted' && 'bg-green-600 hover:bg-green-700 text-white')}
                  onClick={() => handleRSVP('accepted')}
                >
                  <Check className="size-3.5 mr-1.5" /> Going
                </Button>
                <Button
                  size="sm"
                  variant={myRsvp.status === 'tentative' ? 'default' : 'outline'}
                  disabled={publishRSVP.isPending}
                  className={cn('flex-1 rounded-full', myRsvp.status === 'tentative' && 'bg-amber-500 hover:bg-amber-600 text-white')}
                  onClick={() => handleRSVP('tentative')}
                >
                  <Star className="size-3.5 mr-1.5" /> Interested
                </Button>
                <Button
                  size="sm"
                  variant={myRsvp.status === 'declined' ? 'default' : 'outline'}
                  disabled={publishRSVP.isPending}
                  className={cn('flex-1 rounded-full', myRsvp.status === 'declined' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')}
                  onClick={() => handleRSVP('declined')}
                >
                  <XIcon className="size-3.5 mr-1.5" /> Can't Go
                </Button>
              </div>
            </section>
          </>
        )}

        <PostActionBar
          event={event}
          replyLabel="Comments"
          onReply={() => setReplyOpen(true)}
          onMore={() => setMoreMenuOpen(true)}
          className="-mx-5 px-5"
        />

        <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
        <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
        {canEdit && (
          <CreateCommunityEventDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            event={event}
          />
        )}

        <section>
          {commentsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : replyTree.length > 0 ? (
            <div className="-mx-5">
              <ThreadedReplyList roots={replyTree} />
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No comments yet. Be the first to comment!
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
