import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

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
import { ImageUploadField } from '@/components/ImageUploadField';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface CreateCommunityEventDialogProps {
  communityATag?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function toLocalTimestamp(date: string, time: string): number {
  return Math.floor(new Date(`${date}T${time}:00`).getTime() / 1000);
}

function parseCommunityAuthor(communityATag: string): string | undefined {
  const [, pubkey] = communityATag.split(':');
  return pubkey || undefined;
}

export function CreateCommunityEventDialog({ communityATag, open, onOpenChange }: CreateCommunityEventDialogProps) {
  const { user } = useCurrentUser();
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
  const [location, setLocation] = useState('');
  const [isImageUploading, setIsImageUploading] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const isCommunityEvent = !!communityATag;

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
    setLocation('');
    setIsImageUploading(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  const validateInfoStep = useCallback((): boolean => {
    if (!title.trim()) {
      toast({ title: 'Enter an event title', variant: 'destructive' });
      return false;
    }
    return true;
  }, [title, toast]);

  const handleNext = useCallback(() => {
    if (isImageUploading) return;
    if (!validateInfoStep()) return;
    setStep(2);
  }, [isImageUploading, validateInfoStep]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
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

    if (!allDay && endDate && !endTime) {
      toast({ title: 'Add an end time or clear the end date', variant: 'destructive' });
      return;
    }

    const trimmedTitle = title.trim();
    const dTag = `${slugify(trimmedTitle) || 'event'}-${Date.now()}`;
    const tags: string[][] = [
      ['d', dTag],
      ['title', trimmedTitle],
      ['alt', `${isCommunityEvent ? 'Community event' : 'Calendar event'}: ${trimmedTitle}`],
    ];

    if (communityATag) {
      const communityAuthor = parseCommunityAuthor(communityATag);
      tags.push(['A', communityATag], ['K', '34550']);
      if (communityAuthor) {
        tags.push(['P', communityAuthor]);
      }
    }

    if (description.trim()) {
      tags.push(['summary', description.trim()]);
    }

    if (location.trim()) {
      tags.push(['location', location.trim()]);
    }

    if (imageUrl.trim()) {
      const sanitizedImage = sanitizeUrl(imageUrl.trim());
      if (!sanitizedImage) {
        toast({ title: 'Image URL must be a valid https URL', variant: 'destructive' });
        return;
      }
      tags.push(['image', sanitizedImage]);
    }

    let kind = 31922;
    if (allDay) {
      tags.push(['start', startDate]);
      if (endDate) {
        if (endDate < startDate) {
          toast({ title: 'End date must be on or after the start date', variant: 'destructive' });
          return;
        }
        tags.push(['end', addDays(endDate, 1)]);
      }
    } else {
      kind = 31923;
      const startTs = toLocalTimestamp(startDate, startTime);
      if (!Number.isFinite(startTs) || startTs <= 0) {
        toast({ title: 'Start date or time is invalid', variant: 'destructive' });
        return;
      }
      tags.push(['start', String(startTs)]);
      tags.push(['D', String(Math.floor(startTs / 86400))]);
      tags.push(['start_tzid', timezone]);

      if (endTime) {
        const effectiveEndDate = endDate || startDate;
        const endTs = toLocalTimestamp(effectiveEndDate, endTime);
        if (!Number.isFinite(endTs) || endTs <= startTs) {
          toast({ title: 'End time must be after the start time', variant: 'destructive' });
          return;
        }
        tags.push(['end', String(endTs)]);
        tags.push(['end_tzid', timezone]);
      }
    }

    try {
      await publishEvent({
        kind,
        content: description.trim(),
        tags,
      });

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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        ...(communityATag ? [
          queryClient.invalidateQueries({ queryKey: ['community-events', communityATag] }),
          queryClient.invalidateQueries({
          predicate: (q) => {
            const [root, aTagsKey] = q.queryKey;
            return root === 'community-activity-feed'
              && typeof aTagsKey === 'string'
              && aTagsKey.split(',').includes(communityATag);
          },
          }),
        ] : []),
      ]);

      toast({ title: 'Event created!' });
      handleOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to create event',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [
    allDay,
    communityATag,
    description,
    endDate,
    endTime,
    handleOpenChange,
    imageUrl,
    isImageUploading,
    location,
    publishEvent,
    publishRSVP,
    queryClient,
    startDate,
    startTime,
    timezone,
    title,
    toast,
    user,
    validateInfoStep,
    isCommunityEvent,
  ]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            Create Event
          </DialogTitle>
          <DialogDescription>
            Step {step} of 2 · {step === 1 ? 'What is happening?' : 'When and where?'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="community-event-all-day">All-day event</Label>
                      <p className="text-xs text-muted-foreground">Turn off to add start and end times.</p>
                    </div>
                    <Switch
                      id="community-event-all-day"
                      checked={allDay}
                      onCheckedChange={setAllDay}
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
                        onChange={(e) => setStartDate(e.target.value)}
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
                    <Label htmlFor="community-event-location">Location (recommended)</Label>
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
                <Button type="submit" className="flex-1" disabled={isPending || isImageUploading}>
                  {isPending ? 'Creating...' : isImageUploading ? 'Uploading...' : 'Create Event'}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
