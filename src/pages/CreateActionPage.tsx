import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Loader2,
  MapPin,
  Megaphone,
  Plus,
  X,
} from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { usdToSats } from '@/lib/bitcoin';
import { COUNTRIES, searchCountries, type CountryEntry } from '@/lib/countries';
import { parseContentTagInput } from '@/lib/contentTags';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { getTodayDateInput } from '@/lib/dateInput';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { unixSecondsInTimezone } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { withAgoraTag } from '@/lib/agoraNoteTags';

export function CreateActionPage() {
  useLayoutOptions({ noMaxWidth: true });

  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const { data: btcPrice } = useBtcPrice();

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
  const [tagInput, setTagInput] = useState('');
  const [pledgeUsd, setPledgeUsd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [countryCode, setCountryCode] = useState(pageCountryCode);
  const [countryQuery, setCountryQuery] = useState(pageCountryCode ? (COUNTRIES[pageCountryCode]?.name ?? pageCountryCode) : '');
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

  useSeoMeta({
    title: 'Create pledge | Agora',
    description: 'Create a donor pledge to inspire concrete action on Agora.',
  });

  const pledgeSatsPreview = useMemo(() => {
    const n = Number(pledgeUsd.replace(/[, $]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return usdToSats(n, btcPrice);
  }, [btcPrice, pledgeUsd]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create a pledge.');

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();

      if (!trimmedTitle) throw new Error('Title is required.');
      if (!trimmedDescription) throw new Error('Description is required.');
      if (!pledgeUsd.trim()) throw new Error('Pledge amount is required.');

      const pledgeUsdNum = Number(pledgeUsd.replace(/[, $]/g, ''));
      if (!Number.isFinite(pledgeUsdNum) || pledgeUsdNum <= 0) {
        throw new Error('Pledge amount must be a positive USD amount.');
      }
      const pledgeSats = usdToSats(pledgeUsdNum, btcPrice);
      if (pledgeSats <= 0) {
        throw new Error('Waiting for BTC/USD price to calculate the pledge amount.');
      }

      const now = Date.now();
      const slug = trimmedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const dTag = `${slug || 'pledge'}-${now}`;
      const pledgeTags = parseContentTagInput(tagInput);

      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['bounty', String(pledgeSats)],
        ['t', 'agora-action'],
        ['alt', `Agora pledge: ${trimmedTitle}`],
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
        throw new Error('Cover image must be a valid https:// URL.');
      }
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }

      if (deadline) {
        if (deadline < minDeadline) {
          throw new Error('Deadline cannot be in the past.');
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
      toast({ title: 'Pledge created' });
      navigate('/pledges');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: 'Could not create pledge',
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
              <Megaphone className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Log in to create a pledge</h2>
              <p className="text-muted-foreground">
                Pledges are signed Nostr events. You need a Nostr login to publish one.
              </p>
              <Button asChild>
                <Link to="/pledges">Back to pledges</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    pledgeUsd.trim().length > 0 &&
    pledgeSatsPreview > 0 &&
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
              Create pledge
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
          {/* Title */}
          <FormSection title="Title" requirement="Required">
            <Input
              placeholder="Document a beach cleanup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </FormSection>

          {/* Country */}
          <FormSection title="Country" requirement="Recommended">
            <CountrySelect
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

          {/* Tags */}
          <FormSection title="Tags" requirement="Recommended">
            <Input
              id="pledge-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="beach-cleanup, protest-documentation, internet-blackout"
            />
          </FormSection>

          {/* Cover image */}
          <FormSection title="Cover image" requirement="Optional">
            <CoverImageField
              value={coverImage}
              onChange={setCoverImage}
              onUploadingChange={setCoverUploading}
            />
          </FormSection>

          {/* Description */}
          <FormSection title="Description" requirement="Required">
            <Textarea
              placeholder="Explain the action, evidence, or outcome you want to inspire, what submissions should include, and how you plan to evaluate them..."
              rows={7}
              className="font-mono text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormSection>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Pledge amount */}
            <FormSection title="Pledge" requirement="Required">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="100"
                  value={pledgeUsd}
                  onChange={(e) => setPledgeUsd(e.target.value)}
                  className="pl-7 pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  USD
                </span>
              </div>
            </FormSection>

            {/* Deadline */}
            <FormSection title="Deadline" requirement="Optional">
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
          </div>

          {deadline && (
            <FormSection title="Timezone" requirement="Required">
              <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" /> Timezone
                </div>
                <TimezoneSwitcher value={timezone} onChange={setTimezone} />
                <p className="text-xs text-muted-foreground">
                  Start and deadline times will be interpreted in this timezone.
                </p>
              </div>
            </FormSection>
          )}
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="pt-1">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full"
          >
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
                Create pledge
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

function CountrySelect({
  query,
  selectedCode,
  onQueryChange,
  onSelect,
  onClear,
}: {
  query: string;
  selectedCode: string;
  onQueryChange: (value: string) => void;
  onSelect: (country: CountryEntry) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCountry = selectedCode ? COUNTRIES[selectedCode] : undefined;
  const results = useMemo(() => searchCountries(query), [query]);
  const showResults = open && results.length > 0;

  const selectCountry = (country: CountryEntry) => {
    onSelect(country);
    setOpen(false);
    setSelectedIndex(0);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="pledge-country"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showResults) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex((prev) => (prev + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              selectCountry(results[selectedIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="h-9 rounded-full border-0 bg-secondary pl-10 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Search countries, e.g. Venezuela"
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="pledge-country-results"
        />
        {(query || selectedCode) && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 rounded-full p-1 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:transition-colors"
            aria-label="Clear country"
          >
            <X className="size-4" />
          </button>
        )}

        {showResults && (
          <div
            id="pledge-country-results"
            role="listbox"
            className="absolute z-20 mt-2 max-h-[200px] w-full overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
          >
            {results.map((country, index) => (
              <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCountry(country)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/60',
                  index === selectedIndex && 'bg-secondary/60',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-lg leading-none" role="img" aria-label={`Flag of ${country.name}`}>
                  {country.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{country.name}</span>
                  <span className="block text-xs text-muted-foreground">{country.code}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCountry && (
        <p className="text-xs text-muted-foreground">
          Publishes <span className="font-mono text-foreground">i: iso3166:{selectedCode}</span> for country sorting.
        </p>
      )}
    </div>
  );
}

export default CreateActionPage;
