import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';

import { NoteContent } from '@/components/NoteContent';
import { RSVPAvatars } from '@/components/RSVPAvatars';
import { Badge } from '@/components/ui/badge';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface CalendarEventContentProps {
  event: NostrEvent;
  /** When true, renders a compact feed card. */
  compact?: boolean;
  className?: string;
}

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

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function formatEventDate(event: NostrEvent): string {
  const start = getTag(event.tags, 'start');
  if (!start) return '';

  if (event.kind === 31922) {
    const startDate = new Date(`${start}T00:00:00Z`);
    if (isNaN(startDate.getTime())) return start;

    const end = getTag(event.tags, 'end');
    if (end) {
      const endDate = new Date(`${end}T00:00:00Z`);
      if (!isNaN(endDate.getTime()) && endDate > startDate) {
        const lastDay = new Date(endDate.getTime() - 86400000);
        if (lastDay > startDate) {
          const startStr = dateFormatter.format(startDate).replace(/, \d{4}$/, '');
          return `${startStr} - ${dateFormatter.format(lastDay)}`;
        }
      }
    }

    return dateFormatter.format(startDate);
  }

  if (event.kind === 31923) {
    const startTs = parseInt(start, 10);
    if (isNaN(startTs)) return start;
    const startDate = new Date(startTs * 1000);

    const end = getTag(event.tags, 'end');
    if (end) {
      const endTs = parseInt(end, 10);
      if (!isNaN(endTs) && endTs > startTs) {
        const endDate = new Date(endTs * 1000);
        if (isSameDay(startDate, endDate)) {
          return `${dateTimeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`;
        }
        return `${dateTimeFormatter.format(startDate)} - ${dateTimeFormatter.format(endDate)}`;
      }
    }

    return dateTimeFormatter.format(startDate);
  }

  return start;
}

function getEventEndTimestamp(event: NostrEvent): number {
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

/** Renders NIP-52 calendar event content (kind 31922 and 31923). */
export function CalendarEventContent({ event, compact, className }: CalendarEventContentProps) {
  const title = useMemo(() => getTag(event.tags, 'title'), [event.tags]);
  const image = useMemo(() => sanitizeUrl(getTag(event.tags, 'image')), [event.tags]);
  const locationRaw = useMemo(() => getTag(event.tags, 'location'), [event.tags]);
  const location = useMemo(() => locationRaw ? parseLocation(locationRaw) : undefined, [locationRaw]);
  const dateDisplay = useMemo(() => formatEventDate(event), [event]);
  const hashtags = useMemo(() => getAllTags(event.tags, 't').map(([, v]) => v).filter(Boolean), [event.tags]);
  const participants = useMemo(() => getAllTags(event.tags, 'p'), [event.tags]);
  const summary = useMemo(() => getTag(event.tags, 'summary'), [event.tags]);
  const ended = useMemo(() => getEventEndTimestamp(event) < Math.floor(Date.now() / 1000), [event]);
  const hasContent = event.content.trim().length > 0;

  const participantPubkeys = useMemo(
    () => participants.map(([, pubkey]) => pubkey).filter(Boolean),
    [participants],
  );

  if (compact) {
    return (
      <div className={cn('mt-3 space-y-3', className)}>
        {image && (
          <div className="relative -mx-4 aspect-[21/9] overflow-hidden">
            <img src={image} alt={title ?? 'Calendar event'} className="w-full h-full object-cover" loading="lazy" />
            {participantPubkeys.length > 0 && (
              <div className="absolute bottom-2 left-3">
                <RSVPAvatars pubkeys={participantPubkeys} maxVisible={4} size="md" />
              </div>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="size-4 text-primary shrink-0" />
            <h3 className="font-semibold text-[15px] leading-tight line-clamp-2">{title ?? 'Untitled event'}</h3>
          </div>
          {ended ? (
            <Badge variant="secondary" className="shrink-0">Ended</Badge>
          ) : dateDisplay ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 max-w-[45%]">
              <Clock className="size-3" />
              <span className="truncate">{dateDisplay}</span>
            </span>
          ) : null}
        </div>

        {dateDisplay && ended && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{dateDisplay}</span>
          </div>
        )}

        {(summary || hasContent) && (
          <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {summary && !hasContent ? (
              <p>{summary}</p>
            ) : (
              <NoteContent event={event} className="text-sm" hideEmbedImages />
            )}
          </div>
        )}

        {(location || participantPubkeys.length > 0) && (
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
            {location ? (
              <>
                <MapPin className="h-4 w-4 shrink-0 text-red-500" />
                <span className="text-sm truncate flex-1">{location}</span>
              </>
            ) : (
              <>
                <Users className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm text-muted-foreground flex-1">Participants</span>
              </>
            )}
            {participantPubkeys.length > 0 && (
              <RSVPAvatars pubkeys={participantPubkeys} maxVisible={4} size="sm" />
            )}
          </div>
        )}

        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] px-2 py-0.5">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('mt-2 rounded-xl border border-border overflow-hidden', className)}>
      {image ? (
        <div className="aspect-video rounded-lg overflow-hidden">
          <img src={image} alt={title ?? 'Calendar event'} className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent py-8">
          <CalendarDays className="h-10 w-10 text-primary" />
        </div>
      )}

      <div className="space-y-2 p-3">
        {title && <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>}
        {dateDisplay && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{dateDisplay}</span>
          </div>
        )}
        {location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{location}</span>
          </div>
        )}
        {participants.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>{participants.length} {participants.length === 1 ? 'participant' : 'participants'}</span>
          </div>
        )}
        {summary && !hasContent && <p className="text-sm text-muted-foreground">{summary}</p>}
        {hasContent && <NoteContent event={event} className="text-sm" hideEmbedImages={!!image} />}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] px-2 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
