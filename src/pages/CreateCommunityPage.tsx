import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useTranslation } from 'react-i18next';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { AlertTriangle, ArrowLeft, Loader2, Users, X } from 'lucide-react';

import { CategoryPicker } from '@/components/CategoryPicker';
import { CountrySelect } from '@/components/CountrySelect';
import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { PersonSearch } from '@/components/PersonSearch';
import { Wizard } from '@/components/Wizard';
import { LoginArea } from '@/components/auth/LoginArea';
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
import { getCountryInfo } from '@/lib/countries';
import { getEditableContentTags } from '@/lib/contentTags';
import {
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_CATEGORY_SLUGS,
} from '@/lib/campaignCategories';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
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
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [coverUploading, setCoverUploading] = useState(false);
  // Additional moderators on top of the founder. The founder is implicit —
  // they're always pubkey #0 in the published moderator list and are not
  // rendered as a chip here.
  const [moderators, setModerators] = useState<SearchProfile[]>([]);
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);

  // Fetch the existing community when editing.
  const editCommunityQuery = useQuery({
    queryKey: [
      'community',
      editTarget?.pubkey ?? '',
      editTarget?.identifier ?? '',
      editTarget?.relays ?? [],
    ],
    queryFn: async ({
      signal,
    }): Promise<{ event: NostrEvent; community: ParsedCommunity } | null> => {
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
        const cachedAuthor = queryClient.getQueryData<{
          event?: NostrEvent;
          metadata?: NostrMetadata;
        }>(['author', pubkey]);
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
    title: `${
      isEditMode ? t('groups.create.seoTitleEdit') : t('groups.create.seoTitleCreate')
    } | ${config.appName}`,
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
    setCountryQuery(
      editCountryCode
        ? getCountryInfo(editCountryCode)?.subdivisionName ??
            getCountryInfo(editCountryCode)?.name ??
            editCountryCode
        : '',
    );
    // Only pre-select categories that exist in the curated set. Any other
    // `t` tags the old free-form input may have published (e.g.
    // "mutual-aid") are intentionally dropped from the picker — the user
    // would have no way to re-select them, and saving the edit would
    // silently re-publish stale tags they can't see. Same posture the
    // campaign wizard adopted when its tag input was replaced.
    const existingContentTags = getEditableContentTags(editCommunity.event.tags);
    setSelectedCategories(
      new Set(existingContentTags.filter((tag) => CAMPAIGN_CATEGORY_SLUGS.has(tag))),
    );
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

      // Emit categories in CAMPAIGN_CATEGORIES order — the curated list
      // is the canonical ordering, easier to reason about in
      // cross-client renderers than an alphabetized/insertion-order
      // dump.
      const contentTags = CAMPAIGN_CATEGORIES
        .map((c) => c.slug)
        .filter((slug) => selectedCategories.has(slug));

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
      toast({
        title: edited
          ? t('groups.create.successEdit')
          : t('groups.create.successCreate'),
      });
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

  const submitting = submitMutation.isPending || coverUploading;
  const nameProvided = name.trim().length > 0;

  // ─── Pre-wizard guards ─────────────────────────────────────────────────
  // The login gate, invalid-edit guard, loading state, and non-owner
  // guard render their own page chrome — they're not wizard steps. The
  // wizard only mounts once the user is signed in and (in edit mode) we
  // have a community they actually own.

  if (!user) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Users className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold">{t('groups.create.loginGateTitle')}</h2>
                <p className="text-muted-foreground text-sm">
                  {t('groups.create.loginGateBody')}
                </p>
              </div>
              <LoginArea className="max-w-60" />
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
              <AlertTriangle className="size-10 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">{t('groups.create.invalidEditTitle')}</h2>
              <p className="text-muted-foreground">{t('groups.create.invalidEditBody')}</p>
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
              <AlertTriangle className="size-10 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">{t('groups.create.cannotEditTitle')}</h2>
              <p className="text-muted-foreground">{t('groups.create.cannotEditBody')}</p>
              <Button type="button" onClick={() => navigate(-1)}>
                {t('common.goBack')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // ─── Wizard step bodies ────────────────────────────────────────────────
  // Each section is constructed once and slotted into the wizard's step
  // body below. Keeping the JSX up here (rather than inline in the
  // `steps` array) makes the wizard call read like a table of contents.

  const nameDescriptionSection = (
    <>
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

      <FormSection title={t('groups.create.description')} requirement="Recommended">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('groups.create.descriptionPlaceholder')}
          rows={4}
        />
      </FormSection>
    </>
  );

  const coverSection = (
    <FormSection title={t('groups.create.coverImage')} requirement="Recommended">
      <CoverImageField
        value={imageUrl}
        onChange={setImageUrl}
        onUploadingChange={setCoverUploading}
      />
    </FormSection>
  );

  const moderatorsSection = (
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
  );

  const countryCategoriesSection = (
    <>
      <FormSection title={t('groups.create.country')} requirement="Optional">
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

      <FormSection title={t('groups.create.tags')} requirement="Optional">
        <CategoryPicker selected={selectedCategories} onToggle={toggleCategory} />
      </FormSection>
    </>
  );

  // ─── Submit + error chrome ─────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    submitMutation.mutate();
  };

  const submitButtonContent = submitMutation.isPending ? (
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
  );

  const errorAlert = formError ? (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertDescription>{formError}</AlertDescription>
    </Alert>
  ) : null;

  // Edit mode keeps the original single-page form — pre-populated fields
  // need to be visible and editable in one place, and the multi-step
  // wizard is optimized for a linear first-time flow. Mirrors the same
  // create-vs-edit split the campaign flow uses.
  if (isEditMode) {
    return (
      <main className="min-h-screen pb-16">
        <form
          className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-5"
          onSubmit={handleSubmit}
        >
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
              {t('groups.create.headingEdit')}
            </h1>
          </div>

          <div className="rounded-2xl bg-card/50 p-2">
            {nameDescriptionSection}
            {countryCategoriesSection}
            {coverSection}
            {moderatorsSection}
          </div>

          {errorAlert}

          <div className="pt-1">
            <Button type="submit" disabled={submitting || !nameProvided} className="w-full">
              {submitButtonContent}
            </Button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <Wizard
      headingAriaLabel={t('groups.create.headingCreate')}
      steps={[
        {
          title: t('groups.create.wizard.nameStepTitle'),
          subtitle: t('groups.create.wizard.nameStepSubtitle'),
          body: nameDescriptionSection,
        },
        {
          title: t('groups.create.wizard.coverStepTitle'),
          subtitle: t('groups.create.wizard.coverStepSubtitle'),
          body: coverSection,
        },
        {
          title: t('groups.create.wizard.moderatorsStepTitle'),
          subtitle: t('groups.create.wizard.moderatorsStepSubtitle'),
          body: moderatorsSection,
        },
        {
          title: t('groups.create.wizard.tagsStepTitle'),
          subtitle: t('groups.create.wizard.tagsStepSubtitle'),
          body: countryCategoriesSection,
        },
      ]}
      // The name field on step 1 is the only required gate — the slug
      // is derived from it, and we can't submit without a non-empty
      // d-tag. Every other step is optional and advances freely.
      canAdvanceFromStep={(s) => (s === 1 ? nameProvided : true)}
      // Once name is provided (step 1 cleared) the user has everything
      // we need to publish. Surface a "Skip Next & Launch" shortcut on
      // step 1 itself so the remaining three steps — cover, moderators,
      // country/categories — are explicitly opt-in. The shortcut shares
      // its disabled state with Next via `canAdvanceFromStep`, so it
      // only lights up once the name field is non-empty.
      launchAvailableFromStep={1}
      launchNowLabel={t('groups.create.wizard.launchNow')}
      errorAlert={errorAlert}
      submitButtonContent={submitButtonContent}
      submitting={submitting}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
    />
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

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
