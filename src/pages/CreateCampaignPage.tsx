import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useTranslation } from 'react-i18next';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  HandHeart,
  HelpCircle,
  Loader2,
} from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { CountrySelect } from '@/components/CountrySelect';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Wizard } from '@/components/Wizard';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { ProfileIdentityEditor } from '@/components/onboarding/ProfileIdentityEditor';
import { LoginArea } from '@/components/auth/LoginArea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AutoGrowTextarea } from '@/components/ui/auto-grow-textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePublishOrgProfile } from '@/hooks/usePublishOrgProfile';
import { useOnboarding } from '@/contexts/onboardingContextDef';
import { useToast } from '@/hooks/useToast';
import {
  CAMPAIGN_KIND,
  buildCampaignSlug,
  encodeCampaignNaddr,
  parseCampaign,
  sanitizeCampaignTitle,
} from '@/lib/campaign';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { isValidSlatepackAddress } from '@/lib/grinProof';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { withAgoraTag } from '@/lib/agoraNoteTags';
import { getCountryInfo } from '@/lib/countries';
import { getEditableContentTags } from '@/lib/contentTags';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_CATEGORY_SLUGS } from '@/lib/campaignCategories';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { cn } from '@/lib/utils';

interface EditTarget {
  pubkey: string;
  identifier: string;
  relays?: string[];
}

function getEditTarget(value: string | null): EditTarget | null {
  if (!value) return null;

  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'naddr' || decoded.data.kind !== CAMPAIGN_KIND) return null;
    return {
      pubkey: decoded.data.pubkey,
      identifier: decoded.data.identifier,
      ...(decoded.data.relays ? { relays: decoded.data.relays } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Build a NIP-92 `imeta` tag from a Blossom upload's NIP-94 tag array.
 *
 * NIP-94 returns pairs like `[["url", "<url>"], ["x", "<sha256>"], ["m", "image/jpeg"], ...]`.
 * NIP-92 packs the same key/value pairs into a single space-separated tag:
 * `["imeta", "url <url>", "x <sha256>", "m image/jpeg", ...]`.
 *
 * The `url` entry MUST come first (NIP-92 convention). Other keys are
 * emitted in their original order.
 */
function buildImetaFromNip94(nip94Tags: string[][]): string[] {
  const result: string[] = ['imeta'];
  // url first
  const urlPair = nip94Tags.find((t) => t[0] === 'url');
  if (urlPair && urlPair[1]) result.push(`url ${urlPair[1]}`);
  for (const [key, value] of nip94Tags) {
    if (key === 'url') continue;
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (key.includes(' ')) continue;
    result.push(`${key} ${value}`);
  }
  return result;
}

export function CreateCampaignPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { role: onboardingRole, startSignup } = useOnboarding();
  const { toast } = useToast();
  const userAuthor = useAuthor(user?.pubkey);
  const userMetadata = userAuthor.data?.metadata;

  // Campaign creation requires an identifiable fundraiser profile. Donor
  // signup stays profile-free; this requirement is scoped to /campaigns/new.
  const editNaddr = searchParams.get('edit');
  const isEditMode = !!editNaddr;

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  /** NIP-94-format tag pairs from the most recent banner upload, used to build the NIP-92 imeta tag on publish. */
  const [bannerNip94Tags, setBannerNip94Tags] = useState<string[][] | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [goalUsd, setGoalUsd] = useState('');
  // Grin receiving config (Plan 2, C1/C3) — both paths optional.
  const [grinAddress, setGrinAddress] = useState('');
  const [goblinPayEndpub, setGoblinPayEndpub] = useState('');
  const [goblinPaySigner, setGoblinPaySigner] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState('');
  /**
   * Selected category slugs. Stored as a Set for O(1) toggle, but
   * persisted to the event as ordinary `t` tags (one per slug) so the
   * categories are indistinguishable from any other content tag at
   * the protocol layer — that's deliberate, since a curated picker is
   * just a UX shortcut on top of the same field that's always backed
   * campaign tags.
   */
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set());
  const [organizationATag, setOrganizationATag] = useState('');
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({ name: '', about: '', picture: '', banner: '', website: '' });
  const [profilePrefilledPubkey, setProfilePrefilledPubkey] = useState<string | null>(null);
  const [includeCampaignProfileStep, setIncludeCampaignProfileStep] = useState(false);
  const [profileImageUploading, setProfileImageUploading] = useState(false);

  const editTarget = useMemo(() => getEditTarget(editNaddr), [editNaddr]);

  // ── Organization context (implicit) ────────────────────────────────────
  const orgParam = searchParams.get('org');
  const orgFromParam = useMemo(() => decodeOrganizationParam(orgParam), [orgParam]);
  const { data: manageableOrgs, isLoading: manageableOrgsLoading } = useManageableOrganizations();

  const authorizedOrgFromParam = useMemo(() => {
    if (!orgFromParam || !manageableOrgs) return null;
    return manageableOrgs.find((entry) => entry.community.aTag === orgFromParam.aTag) ?? null;
  }, [orgFromParam, manageableOrgs]);
  const authorizedOrgForAttachedATag = useMemo(() => {
    if (!organizationATag || !manageableOrgs) return null;
    return manageableOrgs.find((entry) => entry.community.aTag === organizationATag) ?? null;
  }, [manageableOrgs, organizationATag]);

  useEffect(() => {
    if (isEditMode) return;
    setOrganizationATag(authorizedOrgFromParam?.community.aTag ?? '');
  }, [isEditMode, authorizedOrgFromParam]);

  useEffect(() => {
    setProfilePrefilledPubkey(null);
    setIncludeCampaignProfileStep(false);
  }, [user?.pubkey]);

  useEffect(() => {
    if (!user) return;
    if (isEditMode) return;
    if (userAuthor.isLoading) return;
    if (profilePrefilledPubkey === user.pubkey) return;

    setProfileData({
      name: userMetadata?.name ?? userMetadata?.display_name ?? '',
      about: userMetadata?.about ?? '',
      picture: userMetadata?.picture ?? '',
      banner: userMetadata?.banner ?? '',
      website: (userMetadata?.website as string) ?? '',
    });
    setProfilePrefilledPubkey(user.pubkey);
  }, [isEditMode, profilePrefilledPubkey, user, userAuthor.isLoading, userMetadata]);

  useEffect(() => {
    if (!user) return;
    if (isEditMode) return;
    if (userAuthor.isLoading) return;

    const hasDisplayName = !!(userMetadata?.name || userMetadata?.display_name);
    const hasAvatar = !!userMetadata?.picture;
    if (!hasDisplayName || !hasAvatar) {
      setIncludeCampaignProfileStep(true);
    }
  }, [isEditMode, user, userAuthor.isLoading, userMetadata]);

  const editCampaignQuery = useCampaign({
    pubkey: editTarget?.pubkey ?? '',
    identifier: editTarget?.identifier ?? '',
    ...(editTarget?.relays ? { relays: editTarget.relays } : {}),
  });
  const editCampaign = isEditMode ? editCampaignQuery.data : null;

  // The slug is protocol plumbing: derive it from the title instead of asking
  // fundraisers to understand Nostr d-tags. `buildCampaignSlug` handles
  // non-Latin titles via transliteration (Arabic → ASCII, etc.) and falls
  // back to a random `campaign-XXXXXX` for scripts that can't be
  // transliterated — so users typing in any language can publish. The
  // result never surfaces in any user-visible URL; campaign links are
  // bech32-encoded `naddr1…` strings that bundle the d-tag inside the
  // payload, so the slug's only audience is relays and other clients.
  const derivedSlug = useMemo(() => buildCampaignSlug(title), [title]);
  const activeIdentifier = editCampaign?.identifier ?? derivedSlug.slug;

  useSeoMeta({
    title: `${isEditMode ? t('campaignsCreate.seoTitleEdit') : t('campaignsCreate.seoTitleCreate')} | ${config.appName}`,
    description: isEditMode
      ? t('campaignsCreate.seoDescriptionEdit', { appName: config.appName })
      : t('campaignsCreate.seoDescriptionCreate', { appName: config.appName }),
  });

  useEffect(() => {
    if (!editCampaign || prepopulatedEventId === editCampaign.event.id) return;

    setTitle(editCampaign.title);
    setStory(editCampaign.story);
    setBannerUrl(editCampaign.banner ?? '');
    // We don't have NIP-94 tags for an existing event — the imeta is
    // already on the event. We'll re-emit it from the original event
    // tags below if the URL is unchanged.
    setBannerNip94Tags(null);
    setGoalUsd(editCampaign.goalUsd !== undefined ? String(editCampaign.goalUsd) : '');
    setGrinAddress(editCampaign.grinAddress ?? '');
    setGoblinPayEndpub(editCampaign.goblinPayEndpub ?? '');
    setGoblinPaySigner(editCampaign.goblinPaySignerPubkey ?? '');
    const editCountryCode = editCampaign.countryCode ?? '';
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? (getCountryInfo(editCountryCode)?.subdivisionName ?? getCountryInfo(editCountryCode)?.name ?? editCountryCode) : '');
    // Pull the existing `t` tags and intersect with the known
    // category slugs — unknown tags (legacy free-form values written
    // by older builds, or anything outside the curated picker) are
    // currently dropped on edit. Once the picker is the only path to
    // setting tags, every event going forward will only carry slugs
    // the picker can round-trip.
    const existingContentTags = getEditableContentTags(editCampaign.event.tags);
    setSelectedCategories(
      new Set(existingContentTags.filter((tag) => CAMPAIGN_CATEGORY_SLUGS.has(tag))),
    );
    const existingOrgATag = editCampaign.event.tags.find(
      ([n, v]) => n === 'A' && typeof v === 'string' && v.startsWith('34550:'),
    )?.[1] ?? '';
    setOrganizationATag(existingOrgATag);
    setPrepopulatedEventId(editCampaign.event.id);
  }, [editCampaign, prepopulatedEventId]);

  // Campaign creators who lack a display name or avatar publish them via the
  // shared kind-0 publisher (read-modify-write, preserves other metadata).
  // The required-field gate (name + avatar) and the campaign-specific failure
  // toast live here; everything else is handled by the hook.
  const publishProfile = usePublishOrgProfile();
  const profileMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('campaignsCreate.errorLoginRequired'));
      if (!profileData.name.trim() || !profileData.picture.trim()) {
        throw new Error(t('onboarding.profile.publishFailedDescription'));
      }
      await publishProfile.mutateAsync({ draft: profileData });
    },
    onError: () => {
      toast({
        title: t('onboarding.profile.publishFailedTitle'),
        description: t('onboarding.profile.publishFailedDescription'),
        variant: 'destructive',
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('campaignsCreate.errorLoginRequired'));
      if (isEditMode && !editCampaign) throw new Error(t('campaignsCreate.errorEditLoadFailed'));
      if (editCampaign && editCampaign.pubkey !== user.pubkey) {
        throw new Error(t('campaignsCreate.errorEditNotOwner'));
      }
      const trimmedTitle = sanitizeCampaignTitle(title).trim();
      const slug = activeIdentifier;

      if (!trimmedTitle) throw new Error(t('campaignsCreate.errorTitleRequired'));
      if (!slug) throw new Error(t('campaignsCreate.errorTitleInvalid'));
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
        throw new Error(t('campaignsCreate.errorSlugInvalid'));
      }

      // Goal — integer USD (no unit, no currency conversion).
      let goalNum: number | undefined;
      const trimmedGoal = goalUsd.replace(/[, $]/g, '').trim();
      if (trimmedGoal) {
        const n = Number(trimmedGoal);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
          throw new Error(t('campaignsCreate.errorGoalInvalid'));
        }
        goalNum = n;
      }

      const resolvedCountryCode = countryCode;
      // Iterate the canonical category list (not the Set) so the tag
      // order on the event is stable and matches the picker's display
      // order — easier to reason about in cross-client renderers.
      const contentTags = CAMPAIGN_CATEGORIES
        .map((c) => c.slug)
        .filter((slug) => selectedCategories.has(slug));

      let prev: NostrEvent | null = null;
      if (isEditMode) {
        prev = await fetchFreshEvent(nostr, {
          kinds: [CAMPAIGN_KIND],
          authors: [user.pubkey],
          '#d': [slug],
        });
        if (!prev || !parseCampaign(prev)) {
          throw new Error(t('campaignsCreate.errorEditLatestMissing'));
        }
      } else {
        // d-tag collision guard. Block silent overwrite of an existing campaign
        // by the same author — even with the same author, we want explicit edit
        // flows, not "create with the same slug".
        const existing = await nostr.query([
          { kinds: [CAMPAIGN_KIND], authors: [user.pubkey], '#d': [slug], limit: 1 },
        ]);
        if (existing.length > 0) {
          throw new Error(t('campaignsCreate.errorSlugCollision', { slug }));
        }
      }

      // Grin receiving config — validate whatever was provided.
      const trimmedGrin = grinAddress.trim().toLowerCase();
      if (trimmedGrin && !isValidSlatepackAddress(trimmedGrin)) {
        throw new Error(t('campaignsCreate.errorGrinAddressInvalid'));
      }
      const trimmedEndpub = goblinPayEndpub.trim();
      if (trimmedEndpub) {
        let ok = false;
        try {
          const decoded = nip19.decode(trimmedEndpub);
          ok = decoded.type === 'npub' || decoded.type === 'nprofile';
        } catch {
          ok = false;
        }
        if (!ok) throw new Error(t('campaignsCreate.errorGoblinPayInvalid'));
      }
      const trimmedSigner = goblinPaySigner.trim();
      let signerHex = '';
      if (trimmedSigner) {
        if (/^[0-9a-f]{64}$/i.test(trimmedSigner)) {
          signerHex = trimmedSigner.toLowerCase();
        } else {
          try {
            const decoded = nip19.decode(trimmedSigner);
            if (decoded.type === 'npub') signerHex = decoded.data;
          } catch {
            // fall through to the error below
          }
          if (!signerHex) throw new Error(t('campaignsCreate.errorGoblinPaySignerInvalid'));
        }
      }

      // Validate banner URL (must be https).
      const trimmedBanner = bannerUrl.trim();
      const sanitizedBanner = trimmedBanner ? sanitizeUrl(trimmedBanner) : undefined;
      if (trimmedBanner && !sanitizedBanner) {
        throw new Error(t('campaignsCreate.errorBannerInvalid'));
      }

      const tags: string[][] = [
        ['d', slug],
        ['title', trimmedTitle],
      ];
      if (sanitizedBanner) {
        tags.push(['banner', sanitizedBanner]);
        // NIP-92 imeta pairs with the banner. Two sources, in priority order:
        // 1. A fresh upload during this session — convert the NIP-94 tag
        //    array from the uploader into the NIP-92 space-separated form.
        // 2. The existing event's imeta tag — re-emit it verbatim when the
        //    URL hasn't changed during an edit.
        const imeta = (() => {
          if (bannerNip94Tags) {
            const url = bannerNip94Tags.find((t) => t[0] === 'url')?.[1];
            if (url === sanitizedBanner) {
              return buildImetaFromNip94(bannerNip94Tags);
            }
          }
          if (isEditMode && editCampaign?.banner === sanitizedBanner) {
            const existing = editCampaign.event.tags.find(([n]) => n === 'imeta');
            if (existing) return existing;
          }
          return null;
        })();
        if (imeta) tags.push(imeta);
      }
      tags.push(['alt', t('campaignsCreate.altText', { title: trimmedTitle })]);

      if (goalNum !== undefined) tags.push(['goal', String(goalNum)]);
      // Grin receiving tags (see lib/campaign.ts for the shapes).
      if (trimmedGrin) tags.push(['grin', trimmedGrin]);
      if (trimmedEndpub || signerHex) {
        const goblinPayTag = ['goblinpay', trimmedEndpub];
        if (signerHex) goblinPayTag.push(signerHex);
        tags.push(goblinPayTag);
      }
      if (resolvedCountryCode) {
        tags.push(['i', createCountryIdentifier(resolvedCountryCode)]);
        tags.push(['k', 'iso3166']);
      }
      for (const tag of contentTags) tags.push(['t', tag]);
      // Organization association (NIP-22 root-scope convention): an
      // uppercase `A` tag points at the NIP-72 community definition so
      // the campaign surfaces as official activity on that org's page.
      const publishOrganizationATag = isEditMode
        ? authorizedOrgForAttachedATag?.community.aTag ?? ''
        : organizationATag;
      if (publishOrganizationATag) {
        tags.push(...createOrganizationAssociationTags(publishOrganizationATag));
      }

      const published = await publishEvent({
        kind: CAMPAIGN_KIND,
        content: story,
        tags: withAgoraTag(tags),
        prev: prev ?? undefined,
      });

      const parsed = parseCampaign(published);
      if (!parsed) {
        throw new Error(t('campaignsCreate.errorPublishedInvalid'));
      }
      return parsed;
    },
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaign.pubkey, campaign.identifier] });
      // Refresh the campaign list queries used by the home/discover/profile
      // views so a newly launched (or just-edited) campaign shows up without
      // a manual reload.
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      void queryClient.invalidateQueries({ queryKey: ['campaigns-all'] });
      const publishOrganizationATag = isEditMode
        ? authorizedOrgForAttachedATag?.community.aTag ?? ''
        : organizationATag;
      if (publishOrganizationATag) {
        void queryClient.invalidateQueries({ queryKey: ['organization-activity', publishOrganizationATag] });
      }
      // Campaigns carrying a country code surface on that country's feed.
      if (campaign.countryCode) {
        void queryClient.invalidateQueries({ queryKey: ['agora-feed-paginated', campaign.countryCode] });
        void queryClient.invalidateQueries({ queryKey: ['agora-feed-new-posts', campaign.countryCode] });
      }
      // Campaigns (kind 33863) also surface in the home Agora activity
      // feed regardless of country code.
      void queryClient.invalidateQueries({ queryKey: ['agora-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['mixed-feed'] });
      toast({
        title: isEditMode ? t('campaignsCreate.successEdit') : t('campaignsCreate.successCreate'),
        description: isEditMode ? t('campaignsCreate.successEditDesc') : t('campaignsCreate.successCreateDesc'),
      });
      navigate(`/${encodeCampaignNaddr(campaign)}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: isEditMode ? t('campaignsCreate.errorTitleEdit') : t('campaignsCreate.errorTitleCreate'),
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
                <HandHeart className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold">{t('campaignsCreate.loginGateTitle')}</h2>
                <p className="text-muted-foreground text-sm">
                  {t('campaignsCreate.loginGateBody')}
                </p>
              </div>
              <LoginArea className="max-w-60" />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!isEditMode && userAuthor.isLoading) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('campaignsCreate.loadingCampaign')}</p>
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
              <h2 className="text-xl font-semibold">{t('campaignsCreate.invalidEditTitle')}</h2>
              <p className="text-muted-foreground">
                {t('campaignsCreate.invalidEditBody')}
              </p>
              <Button type="button" onClick={() => navigate('/campaigns/new')}>
                {t('campaignsCreate.startNewCampaign')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (isEditMode && editCampaignQuery.isLoading) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('campaignsCreate.loadingCampaign')}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (isEditMode && (!editCampaign || editCampaign.pubkey !== user.pubkey)) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <AlertTriangle className="size-10 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">{t('campaignsCreate.cannotEditTitle')}</h2>
              <p className="text-muted-foreground">
                {t('campaignsCreate.cannotEditBody')}
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

  // ── Form section nodes ─────────────────────────────────────────────────
  // Built once and rendered either all together (edit mode) or one step
  // at a time (create mode wizard). Keeping them as locals — instead of
  // extracting into sub-components — avoids dragging the dozen+ state
  // setters into a new prop surface.
  const needsCampaignProfile = !isEditMode && includeCampaignProfileStep;
  const profileNameProvided = profileData.name.trim().length > 0;
  const profileAvatarProvided = profileData.picture.trim().length > 0;
  const profileSection = (
    <ProfileIdentityEditor
      className={cn(
        (profileMutation.isPending || profileImageUploading) && 'opacity-50 pointer-events-none',
      )}
      draft={profileData}
      onChange={(patch) => setProfileData((prev) => ({ ...prev, ...patch }))}
      bioField="none"
      showBanner={false}
      onUploadingChange={setProfileImageUploading}
    />
  );

  const titleSection = (
    <FormSection title={t('forms.title')} requirement="Required">
      {/* Styled to match the "Your name" field from the profile step
          (ProfileCard's EditableInput) — muted idle bg, border on
          hover/focus — rather than the boxed shadcn Input. */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('campaignsCreate.titlePlaceholder')}
        maxLength={200}
        required
        className={cn(
          'rounded-lg px-2',
          'border-2 border-transparent',
          'bg-muted/40',
          'hover:bg-muted/60 hover:border-border',
          'focus:bg-transparent focus:border-primary',
          'transition-colors duration-150',
          'placeholder:text-muted-foreground/40',
          'outline-none',
          'w-full min-w-0 py-1.5 text-xl font-bold',
        )}
      />
    </FormSection>
  );

  const countrySection = (
    <FormSection title={t('forms.country')} requirement="Recommended">
      <CountrySelect
        query={countryQuery}
        selectedCode={countryCode}
        onQueryChange={(value) => {
          setCountryQuery(value);
          const selectedCountry = countryCode ? getCountryInfo(countryCode) : undefined;
          const selectedName = selectedCountry?.subdivisionName ?? selectedCountry?.name;
          if (selectedCountry && value !== selectedName && value.toUpperCase() !== countryCode) {
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
  );

  const tagsSection = (
    <FormSection title={t('forms.tags')} requirement="Optional">
      <CategoryPicker
        selected={selectedCategories}
        onToggle={(slug) => {
          setSelectedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) {
              next.delete(slug);
            } else {
              next.add(slug);
            }
            return next;
          });
        }}
      />
    </FormSection>
  );

  const bannerSection = (
    <FormSection title={t('campaignsCreate.banner')} requirement="Recommended">
      <CoverImageField
        value={bannerUrl}
        onChange={(url) => {
          setBannerUrl(url);
          // Discard stale NIP-94 tags whenever the URL changes — a manual
          // paste or template pick won't carry matching metadata.
          setBannerNip94Tags(null);
        }}
        onUploadingChange={setCoverUploading}
        onUploadComplete={(nip94Tags) => {
          // Capture the NIP-94 tag array so we can convert it into a
          // NIP-92 imeta tag at publish time.
          setBannerNip94Tags(nip94Tags);
        }}
      />
    </FormSection>
  );

  const campaignIdentitySection = (
    <ProfileIdentityEditor
      className={cn(coverUploading && 'opacity-50 pointer-events-none')}
      draft={{
        name: title,
        website: '',
        about: '',
        picture: '',
        banner: bannerUrl,
      }}
      onChange={(patch) => {
        if (patch.name !== undefined) setTitle(patch.name);
        if (patch.banner !== undefined) {
          setBannerUrl(patch.banner);
          setBannerNip94Tags(null);
        }
      }}
      bioField="none"
      showBanner
      showAvatar={false}
      namePlaceholder={t('onboarding.profile.campaignNamePlaceholder')}
      nameMaxLength={200}
      onUploadingChange={setCoverUploading}
      onImageUploadComplete={(field, nip94Tags) => {
        if (field === 'banner') setBannerNip94Tags(nip94Tags);
      }}
    />
  );

  const storySection = (
    <AutoGrowTextarea
      id="campaign-story"
      value={story}
      onValueChange={setStory}
      placeholder={t('campaignsCreate.storyPlaceholder')}
    />
  );

  const goalSection = (
    <FormSection
      title={(
        <span className="inline-flex items-center gap-1.5">
          {t('campaignsCreate.goal')}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={t('campaignsCreate.goalNote')}
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
              {t('campaignsCreate.goalNote')}
            </TooltipContent>
          </Tooltip>
        </span>
      )}
      requirement="Optional"
    >
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id="campaign-goal"
          type="text"
          inputMode="numeric"
          placeholder={t('campaignsCreate.goalPlaceholder')}
          value={goalUsd}
          onChange={(e) => setGoalUsd(e.target.value)}
          className="pl-7 pr-14"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          USD
        </span>
      </div>
    </FormSection>
  );

  // Grin receiving config: how donations reach this campaign. Both paths
  // are optional; without either, the campaign page shows no donate button
  // (unless the instance itself runs a GoblinPay for its campaigns).
  const grinSection = (
    <FormSection title={t('campaignsCreate.grinHeading')} requirement="Recommended">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('campaignsCreate.grinNote')}</p>
        <div className="space-y-1.5">
          <label htmlFor="campaign-grin-address" className="text-xs font-medium text-muted-foreground">
            {t('campaignsCreate.grinAddressLabel')}
          </label>
          <Input
            id="campaign-grin-address"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="grin1…"
            value={grinAddress}
            onChange={(e) => setGrinAddress(e.target.value)}
            className="font-mono"
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="campaign-goblinpay-endpub" className="text-xs font-medium text-muted-foreground">
            {t('campaignsCreate.goblinPayLabel')}
          </label>
          <Input
            id="campaign-goblinpay-endpub"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="npub1… / nprofile1…"
            value={goblinPayEndpub}
            onChange={(e) => setGoblinPayEndpub(e.target.value)}
            className="font-mono"
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="campaign-goblinpay-signer" className="text-xs font-medium text-muted-foreground">
            {t('campaignsCreate.goblinPaySignerLabel')}
          </label>
          <Input
            id="campaign-goblinpay-signer"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="npub1…"
            value={goblinPaySigner}
            onChange={(e) => setGoblinPaySigner(e.target.value)}
            className="font-mono"
            dir="ltr"
          />
          <p className="text-[11px] text-muted-foreground">{t('campaignsCreate.goblinPaySignerNote')}</p>
        </div>
      </div>
    </FormSection>
  );

  const header = (
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
          {isEditMode ? t('campaignsCreate.headingEdit') : t('campaignsCreate.headingCreate')}
        </h1>
      </div>
      <OrganizationContextChip
        aTag={isEditMode && organizationATag && !authorizedOrgForAttachedATag && !manageableOrgsLoading ? '' : organizationATag}
        authorizedOrg={isEditMode ? authorizedOrgForAttachedATag : authorizedOrgFromParam}
        param={orgParam}
        paramDecoded={orgFromParam}
        manageableLoading={manageableOrgsLoading}
        isEditMode={isEditMode}
      />
    </div>
  );

  const errorAlert = formError ? (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertDescription>{formError}</AlertDescription>
    </Alert>
  ) : null;

  const submitButtonContent = submitMutation.isPending ? (
    <>
      <Loader2 className="size-4 mr-2 animate-spin" />
      {isEditMode ? t('campaignsCreate.updating') : t('forms.publishing')}
    </>
  ) : coverUploading ? (
    <>
      <Loader2 className="size-4 mr-2 animate-spin" />
      {t('campaignsCreate.uploadingBanner')}
    </>
  ) : (
    <>
      <HandHeart className="size-4 mr-2" />
      {isEditMode ? t('campaignsCreate.submitEdit') : t('campaignsCreate.submitCreate')}
    </>
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    submitMutation.mutate();
  };

  // Edit mode keeps the original single-page form — pre-populated fields
  // need to be visible and editable in one place, and the multi-step
  // wizard is optimized for a linear first-time flow.
  if (isEditMode) {
    return (
      <main className="min-h-screen pb-16">
        <form className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-5" onSubmit={handleSubmit}>
          {header}

          <div className="rounded-2xl bg-card/50 p-2">
            {titleSection}
            {countrySection}
            {tagsSection}
            {bannerSection}
            {storySection}
            {goalSection}
            {grinSection}
          </div>

          {errorAlert}

          <div className="pt-1">
            <Button type="submit" disabled={submitMutation.isPending || coverUploading} className="w-full">
              {submitButtonContent}
            </Button>
          </div>
        </form>
      </main>
    );
  }

  // ── Create-mode wizard ────────────────────────────────────────────────

  // The org chip surfaces inside step 1 of the wizard so the captive
  // overlay doesn't lose the "publishing under <org>" context that
  // previously sat under the page header.
  const orgChip = (
    <OrganizationContextChip
      aTag={isEditMode && organizationATag && !authorizedOrgForAttachedATag && !manageableOrgsLoading ? '' : organizationATag}
      authorizedOrg={isEditMode ? authorizedOrgForAttachedATag : authorizedOrgFromParam}
      param={orgParam}
      paramDecoded={orgFromParam}
      manageableLoading={manageableOrgsLoading}
      isEditMode={isEditMode}
    />
  );

  const wizardSteps = [
    ...(needsCampaignProfile
      ? [{
        title: t('onboarding.profile.campaignTitle'),
        subtitle: t('onboarding.profile.campaignSubtitle'),
        body: profileSection,
      }]
      : []),
    {
      title: t('campaignsCreate.wizard.titleStepTitle'),
      subtitle: t('campaignsCreate.wizard.titleStepSubtitle'),
      body: campaignIdentitySection,
    },
    {
      title: t('campaignsCreate.wizard.storyStepTitle'),
      subtitle: t('campaignsCreate.wizard.storyStepSubtitle'),
      body: storySection,
    },
    {
      title: t('campaignsCreate.wizard.goalStepTitle'),
      subtitle: t('campaignsCreate.wizard.goalStepSubtitle'),
      body: (
        <>
          {goalSection}
          {grinSection}
        </>
      ),
    },
    {
      title: t('campaignsCreate.wizard.tagsStepTitle'),
      subtitle: t('campaignsCreate.wizard.tagsStepSubtitle'),
      body: (
        <>
          {countrySection}
          {tagsSection}
        </>
      ),
    },
  ];

  // Required-field gates for the wizard's Next buttons. Profile is required
  // only for campaign creators missing name/avatar; title is always required.
  const titleProvided = title.trim().length > 0;
  const profileStep = needsCampaignProfile ? 1 : null;
  const titleStep = needsCampaignProfile ? 2 : 1;
  const launchStep = needsCampaignProfile ? 3 : 2;

  return (
    <Wizard
      headingAriaLabel={t('campaignsCreate.headingCreate')}
      step1Lead={orgChip}
      steps={wizardSteps}
      canAdvanceFromStep={(s) => {
        if (s === profileStep) return profileNameProvided && profileAvatarProvided && !profileImageUploading;
        if (s === titleStep) return titleProvided && !coverUploading;
        return true;
      }}
      onBeforeAdvance={async (s) => {
        if (s !== profileStep) return true;
        await profileMutation.mutateAsync();
        return true;
      }}
      // The shortcut appears once the user has cleared the required
      // title step — everything after it is optional polish.
      launchAvailableFromStep={launchStep}
      launchNowLabel={t('campaignsCreate.wizard.launchNow')}
      errorAlert={errorAlert}
      submitButtonContent={submitButtonContent}
      submitting={submitMutation.isPending || profileMutation.isPending || coverUploading || profileImageUploading}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
      onBackFromFirstStep={onboardingRole === 'creator' ? () => startSignup() : undefined}
    />
  );
}

export default CreateCampaignPage;
