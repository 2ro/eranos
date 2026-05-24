import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useTranslation, Trans } from 'react-i18next';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react';

import { PersonSearch } from '@/components/PersonSearch';
import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { COUNTRIES, searchCountries, type CountryEntry } from '@/lib/countries';
import { parseContentTagInput } from '@/lib/contentTags';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import { withAgoraTag } from '@/lib/agoraNoteTags';

/**
 * Convert text into a URL-safe slug for the NIP-72 community's d-tag.
 * Lifted verbatim from CreateCommunityDialog so the same name produces the
 * same identifier.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a minimal SearchProfile shell when we only know a pubkey. Used as a
 * fallback row for any moderator whose kind-0 metadata isn't reachable.
 */
function makeProfileFromPubkey(pubkey: string): SearchProfile {
  return {
    pubkey,
    metadata: {},
    event: {
      id: '',
      pubkey,
      created_at: 0,
      kind: 0,
      tags: [],
      content: '{}',
      sig: '',
    },
  };
}

function makeProfileFromAuthor(
  pubkey: string,
  author: { event?: NostrEvent; metadata?: NostrMetadata } | undefined,
): SearchProfile {
  if (!author?.event) return makeProfileFromPubkey(pubkey);
  return {
    pubkey,
    metadata: author.metadata ?? {},
    event: author.event,
  };
}

interface EditTarget {
  pubkey: string;
  identifier: string;
  relays?: string[];
}

/**
 * Decode an `?edit=<naddr>` query param into a typed target. Returns null
 * for anything that isn't a valid kind-34550 naddr, which we surface as the
 * "Invalid edit link" guard card below.
 */
function getEditTarget(value: string | null): EditTarget | null {
  if (!value) return null;
  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'naddr' || decoded.data.kind !== COMMUNITY_DEFINITION_KIND) {
      return null;
    }
    return {
      pubkey: decoded.data.pubkey,
      identifier: decoded.data.identifier,
      ...(decoded.data.relays ? { relays: decoded.data.relays } : {}),
    };
  } catch {
    return null;
  }
}

export function CreateCommunityPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const editNaddr = searchParams.get('edit');
  const editTarget = useMemo(() => getEditTarget(editNaddr), [editNaddr]);
  const isEditMode = !!editNaddr;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  // Additional moderators on top of the founder. The founder is implicit —
  // they're always pubkey #0 in the published moderator list and are not
  // rendered as a chip here.
  const [moderators, setModerators] = useState<SearchProfile[]>([]);
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);

  // Fetch the existing community when editing.
  const editCommunityQuery = useQuery({
    queryKey: ['community', editTarget?.pubkey ?? '', editTarget?.identifier ?? '', editTarget?.relays ?? []],
    queryFn: async ({ signal }): Promise<{ event: NostrEvent; community: ParsedCommunity } | null> => {
      if (!editTarget) return null;
      const relayPool = editTarget.relays?.length ? nostr.group(editTarget.relays) : nostr;
      const events = await relayPool.query(
        [
          {
            kinds: [COMMUNITY_DEFINITION_KIND],
            authors: [editTarget.pubkey],
            '#d': [editTarget.identifier],
            limit: 5,
          },
        ],
        { signal },
      );
      if (events.length === 0) return null;
      const newest = events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
      const community = parseCommunityEvent(newest);
      if (!community) return null;
      return { event: newest, community };
    },
    enabled: isEditMode && !!editTarget,
    staleTime: 30_000,
  });

  const editCommunity = isEditMode ? editCommunityQuery.data ?? null : null;
  const editModeratorPubkeys = useMemo(
    () => editCommunity?.community.moderatorPubkeys ?? [],
    [editCommunity],
  );

  // Resolve kind-0 profiles for the existing moderators so the chip rows
  // can render avatars and names. Mirrors the campaign edit-recipients
  // query so we get the same caching behavior.
  const editModeratorProfiles = useQuery({
    queryKey: ['community-edit-moderators', editModeratorPubkeys],
    queryFn: async ({ signal }): Promise<SearchProfile[]> => {
      const cachedProfiles = new Map<string, SearchProfile>();
      const missingPubkeys: string[] = [];

      for (const pubkey of editModeratorPubkeys) {
        const cachedAuthor = queryClient.getQueryData<{ event?: NostrEvent; metadata?: NostrMetadata }>([
          'author',
          pubkey,
        ]);
        if (cachedAuthor?.event) {
          cachedProfiles.set(pubkey, makeProfileFromAuthor(pubkey, cachedAuthor));
        } else {
          missingPubkeys.push(pubkey);
        }
      }

      if (missingPubkeys.length > 0) {
        const events = await nostr.query(
          [{ kinds: [0], authors: missingPubkeys, limit: missingPubkeys.length }],
          { signal },
        );

        const latestByPubkey = new Map<string, NostrEvent>();
        for (const event of events) {
          const existing = latestByPubkey.get(event.pubkey);
          if (!existing || event.created_at > existing.created_at) {
            latestByPubkey.set(event.pubkey, event);
          }
        }

        for (const pubkey of missingPubkeys) {
          const event = latestByPubkey.get(pubkey);
          if (!event) continue;
          const parsed = parseAuthorEvent(event);
          queryClient.setQueryData(['author', pubkey], parsed);
          cachedProfiles.set(pubkey, makeProfileFromAuthor(pubkey, parsed));
        }
      }

      return editModeratorPubkeys.map(
        (pubkey) => cachedProfiles.get(pubkey) ?? makeProfileFromPubkey(pubkey),
      );
    },
    enabled: isEditMode && editModeratorPubkeys.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const derivedSlug = useMemo(() => slugify(name), [name]);
  // The d-tag is immutable once a community is published — the slug shown
  // in edit mode is whatever the community already has, not a fresh slugify
  // of the (possibly edited) name.
  const activeSlug = editCommunity?.community.dTag ?? derivedSlug;

  useSeoMeta({
    title: `${isEditMode ? t('groups.create.seoTitleEdit') : t('groups.create.seoTitleCreate')} | ${config.appName}`,
    description: isEditMode
      ? t('groups.create.seoDescriptionEdit', { appName: config.appName })
      : t('groups.create.seoDescriptionCreate', { appName: config.appName }),
  });

  // Prefill the form when the community loads.
  useEffect(() => {
    if (!editCommunity || prepopulatedEventId === editCommunity.event.id) return;
    setName(editCommunity.community.name);
    setDescription(editCommunity.community.description);
    setImageUrl(editCommunity.community.image ?? '');
    const editCountryCode = editCommunity.community.countryCode ?? '';
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? COUNTRIES[editCountryCode]?.name ?? editCountryCode : '');
    setTagInput(editCommunity.community.topicTags.join(', '));
    setModerators(editCommunity.community.moderatorPubkeys.map(makeProfileFromPubkey));
    setPrepopulatedEventId(editCommunity.event.id);
  }, [editCommunity, prepopulatedEventId]);

  // As kind-0 events resolve, swap pubkey-only stubs for full profiles.
  useEffect(() => {
    const profiles = editModeratorProfiles.data;
    if (!profiles || profiles.length === 0) return;
    setModerators((prev) =>
      prev.map((moderator) => {
        const profile = profiles.find((p) => p.pubkey === moderator.pubkey);
        return profile ?? moderator;
      }),
    );
  }, [editModeratorProfiles.data]);

  const addModerator = useCallback((profile: SearchProfile) => {
    setModerators((prev) =>
      prev.some((m) => m.pubkey === profile.pubkey) ? prev : [...prev, profile],
    );
  }, []);

  const addModerators = useCallback((profiles: SearchProfile[]) => {
    setModerators((prev) => {
      const seen = new Set(prev.map((m) => m.pubkey));
      const next = [...prev];
      for (const profile of profiles) {
        if (seen.has(profile.pubkey)) continue;
        seen.add(profile.pubkey);
        next.push(profile);
      }
      return next;
    });
  }, []);

  const removeModerator = useCallback((pubkey: string) => {
    setModerators((prev) => prev.filter((m) => m.pubkey !== pubkey));
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('groups.create.errorLoginRequired'));
      if (isEditMode && !editCommunity) {
        throw new Error(t('groups.create.errorEditLoadFailed'));
      }
      if (editCommunity && editCommunity.event.pubkey !== user.pubkey) {
        throw new Error(t('groups.create.errorEditNotOwner'));
      }

      const trimmedName = name.trim();
      if (!trimmedName) throw new Error(t('groups.create.errorNameRequired'));

      const slug = activeSlug;
      if (!slug) {
        throw new Error(t('groups.create.errorNameInvalid'));
      }

      // Founder is always implicit and shouldn't be in the extra-moderators
      // array, but defensively strip if a stale stub snuck in.
      const extraModerators = moderators.filter((m) => m.pubkey !== user.pubkey);

      const trimmedImageUrl = imageUrl.trim();
      const sanitizedImage = trimmedImageUrl ? sanitizeUrl(trimmedImageUrl) : undefined;
      if (trimmedImageUrl && !sanitizedImage) {
        throw new Error(t('groups.create.errorCoverInvalid'));
      }
      const contentTags = parseContentTagInput(tagInput);

      // ── Edit branch ────────────────────────────────────────────────────
      if (isEditMode && editCommunity) {
        const relayPool = editTarget?.relays?.length ? nostr.group(editTarget.relays) : nostr;
        const prev = await fetchFreshEvent(relayPool, {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [user.pubkey],
          '#d': [slug],
        });
        if (!prev || !parseCommunityEvent(prev)) {
          throw new Error(t('groups.create.errorEditLatestMissing'));
        }

        // Strip the tag names we're going to rewrite; preserve everything
        // else (any `relay` hints, alt-language tags, …). The legacy
        // `['a', …, 'member']` member-badge tag is no longer relevant
        // under Agora's founder/moderator-only model — we drop it on
        // edit so old badge wiring doesn't linger.
        const preserved = prev.tags.filter(
          ([n, v, , role]) =>
            !['d', 'name', 'description', 'image', 'alt', 'i', 'k', 't'].includes(n) &&
            !(n === 'p' && role === 'moderator') &&
            !(n === 'a' && typeof v === 'string' && v.startsWith('30009:') && role === 'member'),
        );

        const nextTags: string[][] = [
          ['d', slug],
          ['name', trimmedName],
        ];
        if (description.trim()) {
          nextTags.push(['description', description.trim()]);
        }
        if (sanitizedImage) {
          nextTags.push(['image', sanitizedImage]);
        }
        for (const mod of extraModerators) {
          nextTags.push(['p', mod.pubkey, '', 'moderator']);
        }
        if (countryCode) {
          nextTags.push(['i', createCountryIdentifier(countryCode)]);
          nextTags.push(['k', 'iso3166']);
        }
        for (const tag of contentTags) nextTags.push(['t', tag]);
        nextTags.push(...preserved);
        nextTags.push(['alt', t('groups.create.altText', { name: trimmedName })]);

        const updated = await publishEvent({
          kind: COMMUNITY_DEFINITION_KIND,
          content: prev.content,
          tags: withAgoraTag(nextTags),
          prev,
        });
        return { event: updated, slug, edited: true };
      }

      // ── Create branch ──────────────────────────────────────────────────
      // d-tag collision check: don't silently overwrite an existing
      // community of yours with the same slug.
      const existing = await nostr.query([
        {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [user.pubkey],
          '#d': [slug],
          limit: 1,
        },
      ]);
      if (existing.length > 0) {
        throw new Error(t('groups.create.errorSlugCollision', { slug }));
      }

      // Build the kind 34550 community-definition tag set. Agora's
      // organization model has no badge-based membership any more, so we
      // do not mint a "Member of …" badge or attach an `a` tag with a
      // `member` role marker.
      const tags: string[][] = [
        ['d', slug],
        ['name', trimmedName],
      ];
      if (description.trim()) {
        tags.push(['description', description.trim()]);
      }
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }
      for (const mod of extraModerators) {
        tags.push(['p', mod.pubkey, '', 'moderator']);
      }
      if (countryCode) {
        tags.push(['i', createCountryIdentifier(countryCode)]);
        tags.push(['k', 'iso3166']);
      }
      for (const tag of contentTags) tags.push(['t', tag]);
      tags.push(['alt', t('groups.create.altText', { name: trimmedName })]);

      const created = await publishEvent({
        kind: COMMUNITY_DEFINITION_KIND,
        content: '',
        tags: withAgoraTag(tags),
      });

      return { event: created, slug, edited: false };
    },
    onSuccess: async ({ event, slug, edited }) => {
      const naddr = nip19.naddrEncode({
        kind: COMMUNITY_DEFINITION_KIND,
        pubkey: event.pubkey,
        identifier: slug,
      });
      queryClient.setQueryData(
        ['addr-event', COMMUNITY_DEFINITION_KIND, event.pubkey, slug],
        event,
      );
      void queryClient.invalidateQueries({
        queryKey: ['community', event.pubkey, slug],
      });
      void queryClient.invalidateQueries({
        queryKey: ['my-communities'],
        exact: false,
      });
      void queryClient.invalidateQueries({
        queryKey: ['community-activity-feed'],
        exact: false,
      });
      toast({ title: edited ? t('groups.create.successEdit') : t('groups.create.successCreate') });
      navigate(`/${naddr}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: isEditMode ? t('groups.create.errorTitleEdit') : t('groups.create.errorTitleCreate'),
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
              <Users className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">{t('groups.create.loginGateTitle')}</h2>
              <p className="text-muted-foreground">
                {t('groups.create.loginGateBody')}
              </p>
              <Button asChild>
                <Link to="/groups">{t('groups.create.backToGroups')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (isEditMode && !editTarget) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <AlertTriangle className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">{t('groups.create.invalidEditTitle')}</h2>
              <p className="text-muted-foreground">
                {t('groups.create.invalidEditBody')}
              </p>
              <Button type="button" onClick={() => navigate('/groups/new')}>
                {t('groups.create.startNewGroup')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (isEditMode && editCommunityQuery.isLoading) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('groups.create.loadingGroup')}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (
    isEditMode &&
    (!editCommunity || editCommunity.event.pubkey !== user.pubkey)
  ) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <AlertTriangle className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">{t('groups.create.cannotEditTitle')}</h2>
              <p className="text-muted-foreground">
                {t('groups.create.cannotEditBody')}
              </p>
              <Button type="button" onClick={() => navigate(-1)}>
                {t('common.goBack')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

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
              {isEditMode ? t('groups.create.headingEdit') : t('groups.create.headingCreate')}
            </h1>
          </div>
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Name */}
          <FormSection title={t('groups.create.name')} requirement="Required">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('groups.create.namePlaceholder')}
              maxLength={100}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t('groups.create.urlPreview')}{' '}
              <span className="font-mono text-foreground">
                /{activeSlug || t('groups.create.urlPlaceholder')}
              </span>
              {isEditMode && ` ${t('groups.create.urlKeptOriginal')}`}
            </p>
          </FormSection>

          {/* Description */}
          <FormSection title={t('groups.create.description')} requirement="Recommended">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('groups.create.descriptionPlaceholder')}
              rows={3}
            />
          </FormSection>

          {/* Country */}
          <FormSection title={t('groups.create.country')} requirement="Optional">
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
          <FormSection title={t('groups.create.tags')} requirement="Optional">
            <Input
              id="group-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={t('groups.create.tagsPlaceholder')}
            />
          </FormSection>

          {/* Cover image */}
          <FormSection title={t('groups.create.coverImage')} requirement="Recommended">
            <CoverImageField
              value={imageUrl}
              onChange={setImageUrl}
              onUploadingChange={setCoverUploading}
            />
          </FormSection>

          {/* Moderators */}
          <FormSection title={t('groups.create.moderators')} requirement="Optional">
            <div className="space-y-3">
              <PersonSearch
                onAdd={addModerator}
                onAddMany={addModerators}
                // Hide the founder and anyone already queued from search
                // results so they can't be added twice. The founder isn't
                // shown as a chip — they're always implicit.
                excludePubkeys={[user.pubkey, ...moderators.map((m) => m.pubkey)]}
              />

              {moderators.length > 0 && (
                <>
                  <Label className="text-xs text-muted-foreground">
                    {t('groups.create.moderatorsCount', { count: moderators.length })}
                  </Label>
                  <div className="space-y-1.5">
                    {moderators.map((moderator) => (
                      <ModeratorRow
                        key={moderator.pubkey}
                        profile={moderator}
                        onRemove={() => removeModerator(moderator.pubkey)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </FormSection>
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
            disabled={submitMutation.isPending || coverUploading || !name.trim() || !activeSlug}
            className="w-full"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {isEditMode ? t('groups.create.updating') : t('groups.create.creating')}
              </>
            ) : coverUploading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {t('groups.create.uploadingCover')}
              </>
            ) : (
              <>
                <Users className="size-4 mr-2" />
                {isEditMode ? t('groups.create.submitEdit') : t('groups.create.submitCreate')}
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

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
  const { t } = useTranslation();
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
          id="group-country"
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
          placeholder={t('groups.create.countryPlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="group-country-results"
        />
        {(query || selectedCode) && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 rounded-full p-1 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:transition-colors"
            aria-label={t('groups.create.countryClearAria')}
          >
            <X className="size-4" />
          </button>
        )}

        {showResults && (
          <div
            id="group-country-results"
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-lg leading-none" role="img" aria-label={t('groups.create.flagOfAria', { name: country.name })}>
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
          <Trans
            i18nKey="groups.create.countryHint"
            values={{ code: selectedCode }}
            components={{ 0: <span className="font-mono text-foreground" /> }}
          />
        </p>
      )}
    </div>
  );
}

function ModeratorRow({
  profile,
  onRemove,
}: {
  profile: SearchProfile;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const displayName =
    profile.metadata.display_name ||
    profile.metadata.name ||
    genUserName(profile.pubkey);
  const picture = sanitizeUrl(profile.metadata.picture);

  return (
    <div className="rounded-lg bg-secondary/30 p-2.5">
      <div className="flex items-center gap-3">
        <Avatar className="size-8 shrink-0">
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback className="text-xs">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={t('groups.create.removeModeratorAria', { name: displayName })}
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default CreateCommunityPage;
