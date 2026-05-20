import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Loader2, Plus } from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useToast } from '@/hooks/useToast';
import { getTodayDateInput } from '@/lib/dateInput';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { unixSecondsInTimezone } from '@/lib/timezone';

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

export function CreateEventPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: publishRSVP } = usePublishRSVP();
  const { toast } = useToast();

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const minStartDate = useMemo(() => getTodayDateInput(), []);

  const orgParam = searchParams.get('org');
  const orgFromParam = useMemo(() => decodeOrganizationParam(orgParam), [orgParam]);
  const { data: manageableOrgs, isLoading: manageableOrgsLoading } = useManageableOrganizations();
  const authorizedOrgFromParam = useMemo(() => {
    if (!orgFromParam || !manageableOrgs) return null;
    return manageableOrgs.find((entry) => entry.community.aTag === orgFromParam.aTag) ?? null;
  }, [orgFromParam, manageableOrgs]);
  const organizationATag = authorizedOrgFromParam?.community.aTag ?? '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState(browserTimezone);
  const [formError, setFormError] = useState('');

  useSeoMeta({
    title: 'Create event | Agora',
    description: 'Create a calendar event on Agora.',
  });

  const minEndDate = startDate || minStartDate;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create an event.');

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      const trimmedLocation = location.trim();

      if (!trimmedTitle) throw new Error('Title is required.');
      if (!startDate) throw new Error('Start date is required.');
      if (startDate < minStartDate) throw new Error('Start date cannot be in the past.');
      if (!allDay && !startTime) throw new Error('Start time is required for timed events.');

      const dTag = `${slugify(trimmedTitle) || 'event'}-${Date.now()}`;
      let kind = 31922;
      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['alt', `${organizationATag ? 'Organization event' : 'Calendar event'}: ${trimmedTitle}`],
      ];

      if (organizationATag) {
        tags.push(...createOrganizationAssociationTags(organizationATag));
      }

      if (trimmedDescription) {
        tags.push(['summary', trimmedDescription]);
      }

      if (trimmedLocation) {
        tags.push(['location', trimmedLocation]);
      }

      const trimmedCoverImage = coverImage.trim();
      const sanitizedImage = trimmedCoverImage ? sanitizeUrl(trimmedCoverImage) : undefined;
      if (trimmedCoverImage && !sanitizedImage) {
        throw new Error('Cover image must be a valid https:// URL.');
      }
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }

      if (allDay) {
        tags.push(['start', startDate]);
        if (endDate) {
          if (endDate < startDate) throw new Error('End date must be on or after the start date.');
          if (endDate > startDate) tags.push(['end', addDays(endDate, 1)]);
        }
      } else {
        if (endDate && endDate < startDate) throw new Error('End date must be on or after the start date.');
        kind = 31923;
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const startTs = unixSecondsInTimezone(startYear, startMonth, startDay, startHour, startMinute, timezone);
        if (!Number.isFinite(startTs) || startTs <= 0) throw new Error('Start date or time is invalid.');
        tags.push(['start', String(startTs)]);
        tags.push(['D', String(Math.floor(startTs / 86400))]);
        tags.push(['start_tzid', timezone]);

        if (endDate || endTime) {
          const effectiveEndDate = endDate || startDate;
          const effectiveEndTime = endTime || startTime;
          const [endYear, endMonth, endDay] = effectiveEndDate.split('-').map(Number);
          const [endHour, endMinute] = effectiveEndTime.split(':').map(Number);
          const endTs = unixSecondsInTimezone(endYear, endMonth, endDay, endHour, endMinute, timezone);
          if (!Number.isFinite(endTs) || endTs <= startTs) {
            throw new Error('End time must be after the start time.');
          }
          tags.push(['end', String(endTs)]);
          tags.push(['end_tzid', timezone]);
        }
      }

      const publishedEvent = await publishEvent({
        kind,
        content: trimmedDescription,
        tags,
      });

      const eventCoord = `${kind}:${user.pubkey}:${dTag}`;
      publishRSVP({
        eventCoord,
        eventAuthorPubkey: user.pubkey,
        status: 'accepted',
      }).catch(() => {
        // Best-effort: event publishing has already succeeded.
      });

      queryClient.setQueryData(['addr-event', kind, publishedEvent.pubkey, dTag], publishedEvent);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['addr-event', kind, publishedEvent.pubkey, dTag] }),
        ...(organizationATag ? [
          queryClient.invalidateQueries({ queryKey: ['community-events', organizationATag] }),
          queryClient.invalidateQueries({ queryKey: ['organization-activity', organizationATag] }),
          queryClient.invalidateQueries({
            predicate: (q) => {
              const [root, aTagsKey] = q.queryKey;
              return root === 'community-activity-feed'
                && typeof aTagsKey === 'string'
                && aTagsKey.split(',').includes(organizationATag);
            },
          }),
        ] : []),
      ]);

      return nip19.naddrEncode({
        kind,
        pubkey: publishedEvent.pubkey,
        identifier: dTag,
      });
    },
    onSuccess: (naddr) => {
      toast({ title: 'Event created' });
      navigate(`/${naddr}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: 'Could not create event',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  if (!user) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <CalendarDays className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Log in to create an event</h2>
              <p className="text-muted-foreground">
                Events are signed Nostr events. You need a Nostr login to publish one.
              </p>
              <Button asChild>
                <Link to="/events">Back to events</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked);
    if (checked && startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  };

  const handleStartDateChange = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    if (nextStartDate && endDate && endDate < nextStartDate) {
      setEndDate(nextStartDate);
    }
  };

  const canSubmit =
    title.trim().length > 0 &&
    startDate.length > 0 &&
    (allDay || startTime.length > 0) &&
    !coverUploading &&
    !submitMutation.isPending;

  return (
    <main className="min-h-screen pb-16">
      <form
        className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError('');
          submitMutation.mutate();
        }}
      >
        <div>
          <div className="flex items-center gap-2 -ml-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-secondary motion-safe:transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Create event
            </h1>
          </div>
          <OrganizationContextChip
            aTag={organizationATag}
            authorizedOrg={authorizedOrgFromParam}
            param={orgParam}
            paramDecoded={orgFromParam}
            manageableLoading={manageableOrgsLoading}
          />
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          <FormSection title="Title" requirement="Required">
            <Input
              placeholder="Neighborhood cleanup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </FormSection>

          <FormSection title="Cover image" requirement="Recommended">
            <CoverImageField
              value={coverImage}
              onChange={setCoverImage}
              onUploadingChange={setCoverUploading}
            />
          </FormSection>

          <FormSection title="Description" requirement="Recommended">
            <Textarea
              placeholder="Tell people what to expect, what to bring, and who should attend..."
              rows={7}
              className="font-mono text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormSection>

          <FormSection title="Schedule" requirement="Required">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="event-all-day">All-day event</Label>
                <p className="text-xs text-muted-foreground">Turn off to add start and end times.</p>
              </div>
              <Switch id="event-all-day" checked={allDay} onCheckedChange={handleAllDayChange} />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-start-date" className="flex items-center gap-2">
                  Start date
                  <span className="text-xs font-medium text-muted-foreground">Required</span>
                </Label>
                <Input
                  id="event-start-date"
                  type="date"
                  min={minStartDate}
                  className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-end-date" className="flex items-center gap-2">
                  End date
                  <span className="text-xs font-medium text-muted-foreground">Optional</span>
                </Label>
                <Input
                  id="event-end-date"
                  type="date"
                  min={minEndDate}
                  className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {!allDay && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start-time">Start time *</Label>
                    <Input
                      id="event-start-time"
                      type="time"
                      className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-end-time">End time</Label>
                    <Input
                      id="event-end-time"
                      type="time"
                      className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4" /> Timezone
                  </div>
                  <TimezoneSwitcher value={timezone} onChange={setTimezone} />
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title="Location" requirement="Recommended">
            <Input
              placeholder="Address, venue, or video call link"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </FormSection>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="pt-1">
          <Button type="submit" disabled={!canSubmit} className="w-full">
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Publishing…
              </>
            ) : coverUploading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Uploading cover…
              </>
            ) : (
              <>
                <Plus className="size-4 mr-2" />
                Create event
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

export default CreateEventPage;
