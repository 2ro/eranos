import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, Loader2, Megaphone, Plus } from 'lucide-react';

import { CategoryPicker } from '@/components/CategoryPicker';
import { CountrySelect } from '@/components/CountrySelect';
import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Wizard } from '@/components/Wizard';
import { LoginArea } from '@/components/auth/LoginArea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { CAMPAIGN_CATEGORIES } from '@/lib/campaignCategories';
import { getCountryInfo } from '@/lib/countries';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { getTodayDateInput } from '@/lib/dateInput';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { unixSecondsInTimezone } from '@/lib/timezone';
import { withAgoraTag } from '@/lib/agoraNoteTags';

export function CreateActionPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  // ?country=XX lets entry points (the Pledges hero CTA, the FAB, and the
  // empty-state button) pre-select whichever country the pledges index is
  // currently filtered to — same behavior as the old modal's `countryCode`
  // prop.
  const pageCountryCode = searchParams.get('country') || '';

  // ── Organization context (implicit) ────────────────────────────────────
  // `?org=` carries the org coordinate from the entry point — typically
  // an org detail page CTA. We accept either an `naddr1...` (preferred,
  // canonical) or a raw `34550:<pubkey>:<d-tag>` coordinate. The form
  // never exposes a user-editable selector — the pledge is "under the
  // user" by default, and "under the org" when the user started from
  // inside that org's page.
  const orgParam = searchParams.get('org');
  const orgFromParam = useMemo(() => decodeOrganizationParam(orgParam), [orgParam]);
  const { data: manageableOrgs, isLoading: manageableOrgsLoading } = useManageableOrganizations();
  const authorizedOrgFromParam = useMemo(() => {
    if (!orgFromParam || !manageableOrgs) return null;
    return manageableOrgs.find((entry) => entry.community.aTag === orgFromParam.aTag) ?? null;
  }, [orgFromParam, manageableOrgs]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [pledgeSats, setPledgeSats] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [countryCode, setCountryCode] = useState(pageCountryCode);
  const [countryQuery, setCountryQuery] = useState(
    pageCountryCode
      ? getCountryInfo(pageCountryCode)?.subdivisionName ??
          getCountryInfo(pageCountryCode)?.name ??
          pageCountryCode
      : '',
  );
  // Effective org coordinate to attach on publish. Sourced only from the
  // URL — never editable inside the form. Drops to '' when the user
  // isn't authorized for the param's org.
  const [organizationATag, setOrganizationATag] = useState('');
  const [timezone, setTimezone] = useState(browserTimezone);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setOrganizationATag(authorizedOrgFromParam?.community.aTag ?? '');
  }, [authorizedOrgFromParam]);

  const minDeadline = useMemo(() => getTodayDateInput(), []);

  const toggleCategory = useCallback((slug: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }, []);

  useSeoMeta({
    title: `${t('pledges.create.seoTitle')} | ${config.appName}`,
    description: t('pledges.create.seoDescription', { appName: config.appName }),
  });

  const pledgeSatsParsed = useMemo(() => {
    const n = Number(pledgeSats.replace(/[, ]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }, [pledgeSats]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('pledges.create.errorLoginRequired'));

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();

      if (!trimmedTitle) throw new Error(t('pledges.create.errorTitleRequired'));
      if (!trimmedDescription) throw new Error(t('pledges.create.errorDescriptionRequired'));
      if (!pledgeSats.trim()) throw new Error(t('pledges.create.errorPledgeRequired'));

      const pledgeSatsNum = Math.floor(Number(pledgeSats.replace(/[, ]/g, '')));
      if (!Number.isFinite(pledgeSatsNum) || pledgeSatsNum <= 0) {
        throw new Error(t('pledges.create.errorPledgeInvalid'));
      }

      const now = Date.now();
      const slug = trimmedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const dTag = `${slug || 'pledge'}-${now}`;
      // Emit categories in CAMPAIGN_CATEGORIES order — the curated
      // list is the canonical ordering, easier to reason about in
      // cross-client renderers than insertion order. Same posture
      // campaigns and groups adopted when their tag inputs were
      // swapped for the picker.
      const pledgeTags = CAMPAIGN_CATEGORIES
        .map((c) => c.slug)
        .filter((s) => selectedCategories.has(s));

      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['bounty', String(pledgeSatsNum)],
        ['t', 'agora-action'],
        ['alt', t('pledges.create.altText', { appName: config.appName, title: trimmedTitle })],
      ];
      for (const tag of pledgeTags) tags.push(['t', tag]);

      if (countryCode) {
        tags.push(['i', createCountryIdentifier(countryCode.toUpperCase())]);
      }

      // Organization association (NIP-22 root-scope convention): an
      // uppercase `A` tag points at the NIP-72 community definition so
      // the pledge surfaces as official activity on that org's page.
      // The `K` companion tag records the referenced kind, and `P` hints
      // at the org founder for clients that batch-resolve authors.
      if (organizationATag) {
        tags.push(...createOrganizationAssociationTags(organizationATag));
      }

      const trimmedCoverImage = coverImage.trim();
      const sanitizedImage = trimmedCoverImage ? sanitizeUrl(trimmedCoverImage) : undefined;
      if (trimmedCoverImage && !sanitizedImage) {
        throw new Error(t('pledges.create.errorCoverInvalid'));
      }
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }

      if (deadline) {
        if (deadline < minDeadline) {
          throw new Error(t('pledges.create.errorDeadlinePast'));
        }
        const [year, month, day] = deadline.split('-').map(Number);
        const [hours, minutes] = deadlineTime
          ? deadlineTime.split(':').map(Number)
          : [23, 59];
        tags.push([
          'deadline',
          String(unixSecondsInTimezone(year, month, day, hours, minutes, timezone)),
        ]);
      }

      await createEvent({ kind: 36639, content: trimmedDescription, tags: withAgoraTag(tags) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      if (organizationATag) {
        await queryClient.invalidateQueries({ queryKey: ['organization-activity', organizationATag] });
      }
      // Pledges (kind 36639) surface in the home Agora activity feed.
      await queryClient.invalidateQueries({ queryKey: ['agora-feed'] });
      await queryClient.invalidateQueries({ queryKey: ['mixed-feed'] });
      await queryClient.refetchQueries({ queryKey: ['agora-actions'] });
      toast({ title: t('pledges.create.successToast') });
      navigate('/pledges');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: t('pledges.create.errorToast'),
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
            <CardContent className="py-12 px-8 flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Megaphone className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold">{t('pledges.create.loginGateTitle')}</h2>
                <p className="text-muted-foreground text-sm">
                  {t('pledges.create.loginGateBody')}
                </p>
              </div>
              <LoginArea className="max-w-60" />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // ─── Wizard step bodies ──────────────────────────────────────────────────

  const titleDescriptionSection = (
    <>
      <FormSection title={t('forms.title')} requirement="Required">
        <Input
          placeholder={t('pledges.create.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </FormSection>

      <FormSection title={t('forms.description')} requirement="Required">
        <Textarea
          placeholder={t('pledges.create.descriptionPlaceholder')}
          rows={6}
          className="font-mono text-base md:text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormSection>
    </>
  );

  const pledgeAmountSection = (
    <>
      <FormSection title={t('pledges.create.pledge')} requirement="Required">
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            placeholder={t('pledges.create.pledgeAmountPlaceholder')}
            value={pledgeSats}
            onChange={(e) => setPledgeSats(e.target.value)}
            className="pr-14"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            sats
          </span>
        </div>
      </FormSection>

      {/* Deadline sits on the same step as the pledge amount —
          they answer the same question ("how much, and by when?"),
          and a dedicated deadline step felt like padding given how
          rarely it's filled in. The timezone subsection still
          reveals only once a date is chosen. */}
      <FormSection title={t('pledges.create.deadline')} requirement="Optional">
        <Input
          type="date"
          min={minDeadline}
          className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        {deadline && (
          <Input
            type="time"
            className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
            value={deadlineTime}
            onChange={(e) => setDeadlineTime(e.target.value)}
          />
        )}
      </FormSection>

      {deadline && (
        <FormSection title={t('forms.timezone')} requirement="Required">
          <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" /> {t('forms.timezone')}
            </div>
            <TimezoneSwitcher value={timezone} onChange={setTimezone} />
            <p className="text-xs text-muted-foreground">
              {t('pledges.create.timezoneNote')}
            </p>
          </div>
        </FormSection>
      )}
    </>
  );

  const coverSection = (
    <FormSection title={t('forms.coverImage')} requirement="Optional">
      <CoverImageField
        value={coverImage}
        onChange={setCoverImage}
        onUploadingChange={setCoverUploading}
      />
    </FormSection>
  );

  const countryTagsSection = (
    <>
      <FormSection title={t('forms.country')} requirement="Optional">
        <CountrySelect
          query={countryQuery}
          selectedCode={countryCode}
          onQueryChange={(value) => {
            setCountryQuery(value);
            const selectedCountry = countryCode ? getCountryInfo(countryCode) : undefined;
            const selectedName =
              selectedCountry?.subdivisionName ?? selectedCountry?.name;
            if (
              selectedCountry &&
              value !== selectedName &&
              value.toUpperCase() !== countryCode
            ) {
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

      <FormSection title={t('forms.tags')} requirement="Optional">
        <CategoryPicker selected={selectedCategories} onToggle={toggleCategory} />
      </FormSection>
    </>
  );

  // ─── Submit + error chrome ───────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    submitMutation.mutate();
  };

  // Required-field gates for the wizard's Next buttons. Title + description
  // sit together on step 1, the pledge amount on step 2. The amount field
  // has to resolve to a positive sats value or the publish will throw.
  const titleProvided = title.trim().length > 0;
  const descriptionProvided = description.trim().length > 0;
  const pledgeProvided = pledgeSats.trim().length > 0 && pledgeSatsParsed > 0;

  const submitting = submitMutation.isPending || coverUploading;

  const submitButtonContent = submitMutation.isPending ? (
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
      {t('pledges.create.submit')}
    </>
  );

  // The captive overlay swallows the page chrome, so the org context chip
  // needs to ride along inside step 1. Same treatment the campaign wizard
  // uses for its "publishing under <org>" affordance.
  const orgChip = (
    <OrganizationContextChip
      aTag={organizationATag}
      authorizedOrg={authorizedOrgFromParam}
      param={orgParam}
      paramDecoded={orgFromParam}
      manageableLoading={manageableOrgsLoading}
    />
  );

  const errorAlert = formError ? (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertDescription>{formError}</AlertDescription>
    </Alert>
  ) : null;

  return (
    <Wizard
      headingAriaLabel={t('pledges.create.heading')}
      step1Lead={orgChip}
      steps={[
        {
          title: t('pledges.create.wizard.titleStepTitle'),
          subtitle: t('pledges.create.wizard.titleStepSubtitle'),
          body: titleDescriptionSection,
        },
        {
          title: t('pledges.create.wizard.pledgeStepTitle'),
          subtitle: t('pledges.create.wizard.pledgeStepSubtitle'),
          body: pledgeAmountSection,
        },
        {
          title: t('pledges.create.wizard.coverStepTitle'),
          subtitle: t('pledges.create.wizard.coverStepSubtitle'),
          body: coverSection,
        },
        {
          title: t('pledges.create.wizard.tagsStepTitle'),
          subtitle: t('pledges.create.wizard.tagsStepSubtitle'),
          body: countryTagsSection,
        },
      ]}
      // Step 1 gates on title + description (both required), step 2
      // gates on the pledge amount (required, and must resolve to a
      // positive sats value). The deadline lives on step 2 alongside
      // the amount but isn't gated — it's optional. Every step after
      // that is opt-in.
      canAdvanceFromStep={(s) => {
        if (s === 1) return titleProvided && descriptionProvided;
        if (s === 2) return pledgeProvided;
        return true;
      }}
      // The shortcut appears from step 2 onward. On step 2 it shares
      // its disabled state with Next via canAdvanceFromStep — the
      // button stays grayed out until the pledge amount resolves to
      // a positive sats value, then lights up as the user's escape
      // hatch out of the remaining optional steps. Step 1 hides it
      // because publishing without a title or description would
      // trip server-side validation.
      launchAvailableFromStep={2}
      launchNowLabel={t('pledges.create.wizard.launchNow')}
      errorAlert={errorAlert}
      submitButtonContent={submitButtonContent}
      submitting={submitting}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
    />
  );
}

export default CreateActionPage;
