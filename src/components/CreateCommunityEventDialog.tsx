import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CountrySelect } from '@/components/CountrySelect';
import { ImageUploadField } from '@/components/ImageUploadField';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useToast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { COUNTRIES } from '@/lib/countries';
import { createCountryIdentifier, parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { createOrganizationAssociationTags } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { withAgoraTag } from '@/lib/agoraNoteTags';
import { getEditableContentTags, parseContentTagInput } from '@/lib/contentTags';

interface CreateCommunityEventDialogProps {
  communityATag?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: NostrEvent;
  onPublished?: (naddr: string) => void;
}

const MANAGED_EDIT_TAGS = new Set([
  'd',
  'title',
  'alt',
  'summary',
  'location',
  'image',
  'start',
  'end',
  'D',
  'start_tzid',
  'end_tzid',
  'A',
  'K',
  'P',
  't',
]);

function isManagedEditTag([name, value]: string[]): boolean {
  if (MANAGED_EDIT_TAGS.has(name)) return true;
  return name === 'i' && !!value && !!parseCountryIdentifier(value);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatLocalDateTimeFields(timestamp: string): { date: string; time: string } {
  const parsed = parseInt(timestamp, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return { date: '', time: '' };

  const date = new Date(parsed * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function toLocalTimestamp(date: string, time: string): number {
  return Math.floor(new Date(`${date}T${time}:00`).getTime() / 1000);
}

export function CreateCommunityEventDialog({ communityATag, open, onOpenChange, event, onPublished }: CreateCommunityEventDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: publishRSVP } = usePublishRSVP();

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [location, setLocation] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isImageUploading, setIsImageUploading] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const isEditing = !!event;
  const effectiveCommunityATag = communityATag ?? event?.tags.find(([name]) => name === 'A')?.[1];
  const isCommunityEvent = !!effectiveCommunityATag;
  const minEndDate = startDate || undefined;

  const resetForm = useCallback(() => {
    setStep(1);
    setTitle('');
    setDescription('');
    setImageUrl('');
    setAllDay(true);
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
    setCountryCode('');
    setCountryQuery('');
    setLocation('');
    setTagInput('');
    setIsImageUploading(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  useEffect(() => {
    if (!open || !event) return;

    const titleTag = event.tags.find(([name]) => name === 'title')?.[1] ?? '';
    const summaryTag = event.tags.find(([name]) => name === 'summary')?.[1] ?? '';
    const imageTag = event.tags.find(([name]) => name === 'image')?.[1] ?? '';
    const locationTag = event.tags.find(([name]) => name === 'location')?.[1] ?? '';
    const editCountryCode = event.tags
      .map(([name, value]) => name === 'i' && value ? parseCountryIdentifier(value) : undefined)
      .find((code): code is string => !!code && /^[A-Z]{2}$/.test(code)) ?? '';
    const startTag = event.tags.find(([name]) => name === 'start')?.[1] ?? '';
    const endTag = event.tags.find(([name]) => name === 'end')?.[1] ?? '';
    const isAllDay = event.kind === 31922;

    setStep(1);
    setTitle(titleTag);
    setDescription(summaryTag || event.content);
    setImageUrl(imageTag);
    setLocation(locationTag);
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? COUNTRIES[editCountryCode]?.name ?? editCountryCode : '');
    setTagInput(getEditableContentTags(event.tags).join(', '));
    setAllDay(isAllDay);
    setIsImageUploading(false);

    if (isAllDay) {
      setStartDate(startTag);
      setStartTime('');
      setEndDate(endTag ? addDays(endTag, -1) : '');
      setEndTime('');
      return;
    }

    const startFields = formatLocalDateTimeFields(startTag);
    const endFields = formatLocalDateTimeFields(endTag);
    setStartDate(startFields.date);
    setStartTime(startFields.time);
    setEndDate(endFields.date);
    setEndTime(endFields.time);
  }, [event, open]);

  const validateInfoStep = useCallback((): boolean => {
    if (!title.trim()) {
      toast({ title: 'Enter an event title', variant: 'destructive' });
      return false;
    }
    return true;
  }, [title, toast]);

  const handleNext = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (isImageUploading) return;
    if (!validateInfoStep()) return;
    setStep(2);
  }, [isImageUploading, validateInfoStep]);

  const handleAllDayChange = useCallback((checked: boolean) => {
    setAllDay(checked);
    if (checked && startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [endDate, startDate]);

  const handleStartDateChange = useCallback((nextStartDate: string) => {
    setStartDate(nextStartDate);
    if (!nextStartDate || !endDate) return;

    const nextMinEndDate = nextStartDate;
    if (endDate < nextMinEndDate) {
      setEndDate(nextMinEndDate);
    }
  }, [endDate]);

  const seedEndDate = useCallback(() => {
    if (!endDate && minEndDate) {
      setEndDate(minEndDate);
    }
  }, [endDate, minEndDate]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    if (isImageUploading) {
      toast({ title: 'Image is still uploading', description: 'Please wait for the upload to finish.' });
      return;
    }
    if (!validateInfoStep()) return;

    if (!startDate) {
      toast({ title: 'Choose a start date', variant: 'destructive' });
      return;
    }

    if (!allDay && !startTime) {
      toast({ title: 'Choose a start time or turn on all-day', variant: 'destructive' });
      return;
    }

    const trimmedTitle = title.trim();
    const contentTags = parseContentTagInput(tagInput);
    const dTag = event?.tags.find(([name]) => name === 'd')?.[1] || `${slugify(trimmedTitle) || 'event'}-${Date.now()}`;
    let kind = isEditing && event ? event.kind : 31922;

    try {
      const prev = isEditing && event
        ? await fetchFreshEvent(nostr, {
            kinds: [event.kind],
            authors: [event.pubkey],
            '#d': [dTag],
          })
        : undefined;
      const preservedTags = isEditing
        ? (prev?.tags ?? event?.tags ?? []).filter((tag) => !isManagedEditTag(tag))
        : [];
      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['alt', `${isCommunityEvent ? 'Group event' : 'Calendar event'}: ${trimmedTitle}`],
        ...preservedTags,
      ];

      if (effectiveCommunityATag) {
        tags.push(...createOrganizationAssociationTags(effectiveCommunityATag));
      }

      if (description.trim()) {
        tags.push(['summary', description.trim()]);
      }

      if (location.trim()) {
        tags.push(['location', location.trim()]);
      }

      if (countryCode) {
        tags.push(['i', createCountryIdentifier(countryCode)]);
      }

      for (const tag of contentTags) tags.push(['t', tag]);

      if (imageUrl.trim()) {
        const sanitizedImage = sanitizeUrl(imageUrl.trim());
        if (!sanitizedImage) {
          toast({ title: 'Image URL must be a valid https URL', variant: 'destructive' });
          return;
        }
        tags.push(['image', sanitizedImage]);
      }

      if (allDay) {
        tags.push(['start', startDate]);
        if (endDate) {
          if (endDate < startDate) {
            toast({ title: 'End date must be on or after the start date', variant: 'destructive' });
            return;
          }
          if (endDate > startDate) {
            tags.push(['end', addDays(endDate, 1)]);
          }
        }
      } else {
        if (endDate && endDate < startDate) {
          toast({ title: 'End date must be on or after the start date', variant: 'destructive' });
          return;
        }

        if (!isEditing) kind = 31923;
        const startTs = toLocalTimestamp(startDate, startTime);
        if (!Number.isFinite(startTs) || startTs <= 0) {
          toast({ title: 'Start date or time is invalid', variant: 'destructive' });
          return;
        }
        tags.push(['start', String(startTs)]);
        tags.push(['D', String(Math.floor(startTs / 86400))]);
        tags.push(['start_tzid', timezone]);

        if (endDate || endTime) {
          const effectiveEndDate = endDate || startDate;
          const effectiveEndTime = endTime || startTime;
          const endTs = toLocalTimestamp(effectiveEndDate, effectiveEndTime);
          if (!Number.isFinite(endTs) || endTs <= startTs) {
            toast({ title: 'End time must be after the start time', variant: 'destructive' });
            return;
          }
          tags.push(['end', String(endTs)]);
          tags.push(['end_tzid', timezone]);
        }
      }

      const publishedEvent = await publishEvent({
        kind,
        content: description.trim(),
        tags: withAgoraTag(tags),
        prev: prev ?? undefined,
      });

      if (!isEditing) {
        // Auto-RSVP the author as "accepted" so they appear in the attendees list.
        // Best-effort: don't block on failure -- the event itself is already published.
        const eventCoord = `${kind}:${user.pubkey}:${dTag}`;
        publishRSVP({
          eventCoord,
          eventAuthorPubkey: user.pubkey,
          status: 'accepted',
        }).catch(() => {
          // Silently ignore -- user can manually RSVP from the detail page if needed.
        });
      }

      queryClient.setQueryData(['addr-event', kind, publishedEvent.pubkey, dTag], publishedEvent);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['addr-event', kind, publishedEvent.pubkey, dTag] }),
        ...(effectiveCommunityATag ? [
          queryClient.invalidateQueries({ queryKey: ['community-events', effectiveCommunityATag] }),
          queryClient.invalidateQueries({ queryKey: ['organization-activity', effectiveCommunityATag] }),
          queryClient.invalidateQueries({
          predicate: (q) => {
            const [root, aTagsKey] = q.queryKey;
            return root === 'community-activity-feed'
              && typeof aTagsKey === 'string'
              && aTagsKey.split(',').includes(effectiveCommunityATag);
          },
          }),
        ] : []),
      ]);

      toast({ title: isEditing ? 'Event updated!' : 'Event created!' });
      onPublished?.(nip19.naddrEncode({ kind, pubkey: publishedEvent.pubkey, identifier: dTag }));
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: isEditing ? 'Failed to update event' : 'Failed to create event',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [
    allDay,
    countryCode,
    description,
    endDate,
    endTime,
    effectiveCommunityATag,
    handleOpenChange,
    imageUrl,
    isImageUploading,
    isEditing,
    location,
    nostr,
    onPublished,
    publishEvent,
    publishRSVP,
    queryClient,
    startDate,
    startTime,
    timezone,
    tagInput,
    title,
    toast,
    user,
    validateInfoStep,
    isCommunityEvent,
    event,
  ]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            {isEditing ? 'Edit Event' : 'Create Event'}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 2 · {step === 1 ? 'What is happening?' : 'When and where?'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => e.preventDefault()}>
          <ScrollArea className="max-h-[62vh]">
            <div className="px-5 pb-5 space-y-4">
              {step === 1 ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="community-event-title">Title *</Label>
                    <Input
                      id="community-event-title"
                      placeholder="e.g. Neighborhood cleanup"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="community-event-description">Description (recommended)</Label>
                    <Textarea
                      id="community-event-description"
                      placeholder="Tell people what to expect..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <ImageUploadField
                    id="community-event-image"
                    label="Image (recommended)"
                    value={imageUrl}
                    onChange={setImageUrl}
                    onUploadingChange={setIsImageUploading}
                    previewAlt="Event image preview"
                  />

                  <div className="space-y-1.5">
                    <Label htmlFor="community-event-tags">Tags (recommended)</Label>
                    <Input
                      id="community-event-tags"
                      placeholder="mutual-aid, workshop, local-news"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="community-event-all-day">All-day event</Label>
                      <p className="text-xs text-muted-foreground">
                        {isEditing ? "Event type can't be changed while editing." : 'Turn off to add start and end times.'}
                      </p>
                    </div>
                    <Switch
                      id="community-event-all-day"
                      checked={allDay}
                      onCheckedChange={handleAllDayChange}
                      disabled={isEditing}
                    />
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="community-event-start-date">Start date *</Label>
                      <Input
                        id="community-event-start-date"
                        type="date"
                        className="[color-scheme:light] dark:[color-scheme:dark]"
                        value={startDate}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="community-event-end-date">End date (optional)</Label>
                      <Input
                        id="community-event-end-date"
                        type="date"
                        className="[color-scheme:light] dark:[color-scheme:dark]"
                        value={endDate}
                        min={minEndDate}
                        onFocus={seedEndDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {!allDay && (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="community-event-start-time">Start time *</Label>
                        <Input
                          id="community-event-start-time"
                          type="time"
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="community-event-end-time">End time (optional)</Label>
                        <Input
                          id="community-event-end-time"
                          type="time"
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="community-event-country">Country (recommended)</Label>
                    <CountrySelect
                      id="community-event-country"
                      query={countryQuery}
                      selectedCode={countryCode}
                      onQueryChange={(value) => {
                        setCountryQuery(value);
                        const selectedCountry = countryCode ? COUNTRIES[countryCode] : undefined;
                        if (selectedCountry && value !== selectedCountry.name && value.toUpperCase() !== countryCode) {
                          setCountryCode('');
                        }
                      }}
                      onSelect={(country) => {
                        setCountryCode(country.code);
                        setCountryQuery(country.name);
                      }}
                      onClear={() => {
                        setCountryCode('');
                        setCountryQuery('');
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="community-event-location">Location details (recommended)</Label>
                    <Input
                      id="community-event-location"
                      placeholder="Address, venue, or video call link"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 border-t border-border px-5 py-4 bg-background">
            {step === 1 ? (
              <>
                <Button type="button" variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={handleNext} disabled={isImageUploading}>
                  {isImageUploading ? 'Uploading...' : 'Next'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={() => setStep(1)}>
                  <ChevronLeft className="size-4" />
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={handleSubmit} disabled={isPending || isImageUploading}>
                  {isPending ? (isEditing ? 'Saving...' : 'Creating...') : isImageUploading ? 'Uploading...' : isEditing ? 'Save Event' : 'Create Event'}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
