import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { nip19 } from 'nostr-tools';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Loader2, Plus } from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { CountrySelect } from '@/components/CountrySelect';
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
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useToast } from '@/hooks/useToast';
import { getTodayDateInput } from '@/lib/dateInput';
import { COUNTRIES } from '@/lib/countries';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { unixSecondsInTimezone } from '@/lib/timezone';
import { withAgoraTag } from '@/lib/agoraNoteTags';
import { parseContentTagInput } from '@/lib/contentTags';

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
  const { t } = useTranslation();
  const { config } = useAppContext();
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
  const pageCountryCode = (searchParams.get('country') || '').toUpperCase();
  const initialCountryCode = COUNTRIES[pageCountryCode] ? pageCountryCode : '';

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
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [countryQuery, setCountryQuery] = useState(initialCountryCode ? COUNTRIES[initialCountryCode].name : '');
  const [location, setLocation] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [timezone, setTimezone] = useState(browserTimezone);
  const [formError, setFormError] = useState('');

  useSeoMeta({
    title: `${t('calendarEvents.create.seoTitle')} | ${config.appName}`,
    description: t('calendarEvents.create.seoDescription', { appName: config.appName }),
  });

  const minEndDate = startDate || minStartDate;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('calendarEvents.create.errorLoginRequired'));

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      const trimmedLocation = location.trim();
      const contentTags = parseContentTagInput(tagInput);

      if (!trimmedTitle) throw new Error(t('calendarEvents.create.errorTitleRequired'));
      if (!startDate) throw new Error(t('calendarEvents.create.errorStartDateRequired'));
      if (startDate < minStartDate) throw new Error(t('calendarEvents.create.errorStartDatePast'));
      if (!allDay && !startTime) throw new Error(t('calendarEvents.create.errorStartTimeRequired'));

      const dTag = `${slugify(trimmedTitle) || 'event'}-${Date.now()}`;
      let kind = 31922;
      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['alt', t(organizationATag ? 'calendarEvents.create.altGroup' : 'calendarEvents.create.altCalendar', { title: trimmedTitle })],
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

      if (countryCode) {
        tags.push(['i', createCountryIdentifier(countryCode)]);
      }

      for (const tag of contentTags) tags.push(['t', tag]);

      const trimmedCoverImage = coverImage.trim();
      const sanitizedImage = trimmedCoverImage ? sanitizeUrl(trimmedCoverImage) : undefined;
      if (trimmedCoverImage && !sanitizedImage) {
        throw new Error(t('calendarEvents.create.errorCoverInvalid'));
      }
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }

      if (allDay) {
        tags.push(['start', startDate]);
        if (endDate) {
          if (endDate < startDate) throw new Error(t('calendarEvents.create.errorEndDateBeforeStart'));
          if (endDate > startDate) tags.push(['end', addDays(endDate, 1)]);
        }
      } else {
        if (endDate && endDate < startDate) throw new Error(t('calendarEvents.create.errorEndDateBeforeStart'));
        kind = 31923;
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const startTs = unixSecondsInTimezone(startYear, startMonth, startDay, startHour, startMinute, timezone);
        if (!Number.isFinite(startTs) || startTs <= 0) throw new Error(t('calendarEvents.create.errorStartDateTimeInvalid'));
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
            throw new Error(t('calendarEvents.create.errorEndTimeAfterStart'));
          }
          tags.push(['end', String(endTs)]);
          tags.push(['end_tzid', timezone]);
        }
      }

      const publishedEvent = await publishEvent({
        kind,
        content: trimmedDescription,
        tags: withAgoraTag(tags),
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
      toast({ title: t('calendarEvents.create.successToast') });
      navigate(`/${naddr}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: t('calendarEvents.create.errorToast'),
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
              <h2 className="text-xl font-semibold">{t('calendarEvents.create.loginTitle')}</h2>
              <p className="text-muted-foreground">
                {t('calendarEvents.create.loginBody')}
              </p>
              <Button asChild>
                <Link to="/events">{t('calendarEvents.create.backToEvents')}</Link>
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
              aria-label={t('common.goBack')}
            >
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t('calendarEvents.create.heading')}
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
          <FormSection title={t('forms.title')} requirement="Required">
            <Input
              placeholder={t('calendarEvents.create.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </FormSection>

          <FormSection title={t('forms.coverImage')} requirement="Recommended">
            <CoverImageField
              value={coverImage}
              onChange={setCoverImage}
              onUploadingChange={setCoverUploading}
            />
          </FormSection>

          <FormSection title={t('forms.description')} requirement="Recommended">
            <Textarea
              placeholder={t('calendarEvents.create.descriptionPlaceholder')}
              rows={7}
              className="font-mono text-base md:text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormSection>

          <FormSection title={t('calendarEvents.create.schedule')} requirement="Required">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="event-all-day">{t('calendarEvents.create.allDay')}</Label>
                <p className="text-xs text-muted-foreground">{t('calendarEvents.create.allDayHint')}</p>
              </div>
              <Switch id="event-all-day" checked={allDay} onCheckedChange={handleAllDayChange} />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-start-date" className="flex items-center gap-2">
                  {t('calendarEvents.create.startDate')}
                  <span className="text-xs font-medium text-muted-foreground">{t('forms.required')}</span>
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
                  {t('calendarEvents.create.endDate')}
                  <span className="text-xs font-medium text-muted-foreground">{t('forms.optional')}</span>
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
                    <Label htmlFor="event-start-time">{t('calendarEvents.create.startTime')}</Label>
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
                    <Label htmlFor="event-end-time">{t('calendarEvents.create.endTime')}</Label>
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
                    <Clock className="h-4 w-4" /> {t('forms.timezone')}
                  </div>
                  <TimezoneSwitcher value={timezone} onChange={setTimezone} />
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title={t('forms.country')} requirement="Recommended">
            <CountrySelect
              id="event-country"
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
          </FormSection>

          <FormSection title={t('calendarEvents.create.locationDetails')} requirement="Recommended">
            <Input
              placeholder={t('calendarEvents.create.locationPlaceholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </FormSection>

          <FormSection title={t('forms.tags')} requirement="Recommended">
            <Input
              id="event-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={t('calendarEvents.create.tagsPlaceholder')}
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
                {t('forms.publishing')}
              </>
            ) : coverUploading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {t('forms.uploadingCover')}
              </>
            ) : (
              <>
                <Plus className="size-4 mr-2" />
                {t('calendarEvents.create.submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

export default CreateEventPage;
