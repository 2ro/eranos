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
  ArrowRight,
  Bitcoin,
  Check,
  EyeOff,
  Globe,
  HandHeart,
  HelpCircle,
  Loader2,
  ShieldCheck,
  Wallet,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useOnboarding } from '@/contexts/onboardingContextDef';
import { useToast } from '@/hooks/useToast';
import { formatBTC, satsToUSD } from '@/lib/bitcoin';
import {
  CAMPAIGN_KIND,
  buildCampaignSlug,
  encodeCampaignNaddr,
  parseCampaign,
  parseCampaignWallet,
  sanitizeCampaignTitle,
} from '@/lib/campaign';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { genUserName } from '@/lib/genUserName';
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

function parseProfileMetadata(content: string | undefined): Record<string, unknown> {
  if (!content) return {};

  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid profile JSON should not block required campaign setup.
  }

  return {};
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
  const hdWallet = useHdWallet();
  const hdWalletAvailable = hdWallet.availability.status === 'available';
  const silentPaymentSupported = hdWalletAvailable && !!hdWallet.silentPaymentAddress;
  const userAuthor = useAuthor(user?.pubkey);
  const userMetadata = userAuthor.data?.metadata;
  const userDisplayName = user
    ? (userMetadata?.name ?? userMetadata?.display_name ?? genUserName(user.pubkey))
    : '';

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
  /**
   * Wallet form state.
   *
   * - {@link walletSource} picks the top-level source: `'mine'` (the
   *   user's HD wallet, only selectable when nsec is available) or
   *   `'custom'` (paste any mainnet bech32(m) endpoint).
   * - {@link mineAccept} picks which donation types the HD-wallet
   *   campaign accepts:
   *     - `'all'` — publishes both a fresh on-chain address and the
   *       static silent-payment code.
   *     - `'public'` — on-chain only (advances the HD receive cursor).
   *     - `'private'` — silent-payment only.
   * - {@link customOnchain} / {@link customSp} are the typed values
   *   when {@link walletSource} is `'custom'`. At least one of them
   *   must parse to a valid endpoint of the matching mode.
   *
   * Without nsec access the dropdown is hidden entirely; the user
   * sees only the two custom inputs.
   *
   * Both fields are seeded from the synchronously-available HD-wallet
   * availability on first render so the dropdown opens already showing
   * the user's Agora wallet (and the matching `mineAccept` choice)
   * instead of the empty "Choose a wallet" placeholder. The effect
   * below still re-runs on availability changes for the edge case
   * where the hook resolves a tick later, but the common nsec-login
   * path no longer flickers through `'custom'` on mount.
   */
  const [walletSource, setWalletSource] = useState<'mine' | 'custom'>(
    () => (hdWalletAvailable ? 'mine' : 'custom'),
  );
  const [mineAccept, setMineAccept] = useState<'all' | 'public' | 'private'>(
    () => (hdWalletAvailable && !silentPaymentSupported ? 'public' : 'all'),
  );
  const [customOnchain, setCustomOnchain] = useState('');
  const [customSp, setCustomSp] = useState('');
  const [goalUsd, setGoalUsd] = useState('');
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

  // When the HD wallet becomes available on a fresh campaign, default
  // the source to "My wallet". Skipped in edit mode (we always start
  // in 'custom' with the existing values pre-filled — see the
  // edit-prepopulation effect below) and once the defaults have been
  // applied, so re-renders that re-derive `hdWalletAvailable` don't
  // override an explicit user choice.
  const [walletDefaultsApplied, setWalletDefaultsApplied] = useState(false);
  useEffect(() => {
    if (isEditMode || walletDefaultsApplied) return;
    if (!hdWalletAvailable) return;
    setWalletSource('mine');
    setMineAccept(silentPaymentSupported ? 'all' : 'public');
    setWalletDefaultsApplied(true);
  }, [isEditMode, walletDefaultsApplied, hdWalletAvailable, silentPaymentSupported]);

  // Without nsec access, the dropdown is hidden and `walletSource` is
  // pinned to `'custom'`. Guard against a stale `'mine'` from a prior
  // logged-in session if the user signs out without unmounting the
  // page.
  useEffect(() => {
    if (!hdWalletAvailable && walletSource !== 'custom') {
      setWalletSource('custom');
    }
  }, [hdWalletAvailable, walletSource]);

  // If silent-payment support disappears (e.g., login switched to a
  // login type that can't derive SP), coerce a stale 'all' / 'private'
  // selection to 'public' so the submit handler never has to
  // apologize for a UI choice the user can't actually make.
  useEffect(() => {
    if (!silentPaymentSupported && mineAccept !== 'public') {
      setMineAccept('public');
    }
  }, [silentPaymentSupported, mineAccept]);

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

  // Live-parsed custom inputs, used to drive disclaimers and inline
  // validation. Empty strings parse to `null` (no inline error).
  const parsedCustomOnchain = useMemo(
    () => (customOnchain.trim() ? parseCampaignWallet(customOnchain) : null),
    [customOnchain],
  );
  const parsedCustomSp = useMemo(
    () => (customSp.trim() ? parseCampaignWallet(customSp) : null),
    [customSp],
  );

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
    // Edit mode always starts in 'custom' with the existing endpoints
    // pre-filled. We don't try to auto-detect whether the stored `w`
    // tags came from the user's HD wallet — switching wallets is an
    // explicit choice the user must make, and the cursor must not be
    // burned on a no-op edit.
    setWalletSource('custom');
    setCustomOnchain(editCampaign.wallets.onchain?.value ?? '');
    setCustomSp(editCampaign.wallets.sp?.value ?? '');
    setWalletDefaultsApplied(true);
    setGoalUsd(editCampaign.goalUsd !== undefined ? String(editCampaign.goalUsd) : '');
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

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('campaignsCreate.errorLoginRequired'));

      const name = profileData.name.trim();
      const about = profileData.about.trim();
      const picture = profileData.picture.trim();
      const banner = profileData.banner.trim();

      if (!name || !picture) {
        throw new Error(t('onboarding.profile.publishFailedDescription'));
      }

      const prev = await fetchFreshEvent(nostr, { kinds: [0], authors: [user.pubkey] });
      const metadata = parseProfileMetadata(prev?.content);
      metadata.name = name;
      if (about) metadata.about = about;
      metadata.picture = picture;
      if (banner) metadata.banner = banner;

      await publishEvent({ kind: 0, content: JSON.stringify(metadata), prev: prev ?? undefined });
    },
    onSuccess: () => {
      if (user) void queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
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

      // Resolve the campaign's `w` endpoints.
      //
      // - 'mine'   → derive from the user's HD wallet. {@link mineAccept}
      //   selects which modes are published. The on-chain receive
      //   index is advanced later (just before the `w` tag is
      //   appended) so a validation failure between here and there
      //   doesn't burn an index.
      // - 'custom' → validate the typed values up-front. At least one
      //   must parse to its expected mode.
      //
      // `willUseHdOnchain` and `spWallet` are the resolved targets;
      // `customOnchainWallet` is populated when 'custom' is selected
      // and the bc1 field parses.
      let customOnchainWallet = null as ReturnType<typeof parseCampaignWallet>;
      let customSpWallet = null as ReturnType<typeof parseCampaignWallet>;
      let willUseHdOnchain = false;
      let spWallet = null as ReturnType<typeof parseCampaignWallet>;

      if (walletSource === 'mine') {
        if (!hdWalletAvailable) {
          throw new Error(t('campaignsCreate.errorHdUnavailable'));
        }
        const wantsOnchain = mineAccept === 'all' || mineAccept === 'public';
        const wantsSp = mineAccept === 'all' || mineAccept === 'private';
        if (wantsSp && !silentPaymentSupported) {
          throw new Error(t('campaignsCreate.errorSpUnavailable'));
        }
        willUseHdOnchain = wantsOnchain;
        if (wantsSp && hdWallet.silentPaymentAddress) {
          spWallet = parseCampaignWallet(hdWallet.silentPaymentAddress.address);
        }
      } else {
        // 'custom'
        const customOnchainTrimmed = customOnchain.trim();
        const customSpTrimmed = customSp.trim();
        if (customOnchainTrimmed) {
          customOnchainWallet = parseCampaignWallet(customOnchainTrimmed);
          if (!customOnchainWallet || customOnchainWallet.mode !== 'onchain') {
            throw new Error(t('campaignsCreate.errorOnchainInvalid'));
          }
        }
        if (customSpTrimmed) {
          customSpWallet = parseCampaignWallet(customSpTrimmed);
          if (!customSpWallet || customSpWallet.mode !== 'sp') {
            throw new Error(t('campaignsCreate.errorSpInvalid'));
          }
        }
        spWallet = customSpWallet;
      }

      // At least one endpoint must resolve.
      if (!willUseHdOnchain && !customOnchainWallet && !spWallet) {
        throw new Error(t('campaignsCreate.errorWalletRequired'));
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

      // Last step before the `w` tags: advance the HD wallet cursor
      // if the user chose 'mine' and the selected accept mode includes
      // on-chain. Deliberately the *last* mutation we do before
      // publishing so a validation failure earlier in this function
      // doesn't burn an index.
      let onchainWallet = customOnchainWallet;
      if (!onchainWallet && willUseHdOnchain) {
        const next = hdWallet.nextReceiveAddress();
        if (!next) {
          throw new Error(t('campaignsCreate.errorHdDeriveFailed'));
        }
        const parsed = parseCampaignWallet(next.address);
        if (!parsed || parsed.mode !== 'onchain') {
          throw new Error(t('campaignsCreate.errorHdDeriveInvalid'));
        }
        onchainWallet = parsed;
      }

      if (!onchainWallet && !spWallet) {
        // Defense in depth — the earlier guard already covers this,
        // but the type narrower can't see across the cursor advance.
        throw new Error(t('campaignsCreate.errorWalletRequiredFallback'));
      }
      if (onchainWallet) tags.push(['w', onchainWallet.value]);
      if (spWallet) tags.push(['w', spWallet.value]);
      if (goalNum !== undefined) tags.push(['goal', String(goalNum)]);
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

  const walletSection = (
    <FormSection title={t('campaignsCreate.wallet')} requirement="Required">
      <WalletPicker
        hdWalletAvailable={hdWalletAvailable}
        silentPaymentSupported={silentPaymentSupported}
        displayName={userDisplayName}
        picture={userMetadata?.picture}
        totalBalance={hdWallet.totalBalance}
        balanceLoading={hdWalletAvailable && hdWallet.isLoading}
        walletSource={walletSource}
        onWalletSourceChange={setWalletSource}
        mineAccept={mineAccept}
        onMineAcceptChange={setMineAccept}
        customOnchain={customOnchain}
        onCustomOnchainChange={setCustomOnchain}
        parsedCustomOnchain={parsedCustomOnchain}
        customSp={customSp}
        onCustomSpChange={setCustomSp}
        parsedCustomSp={parsedCustomSp}
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
      namePlaceholder="Campaign title"
      nameMaxLength={200}
      onUploadingChange={setCoverUploading}
      onImageUploadComplete={(field, nip94Tags) => {
        if (field === 'banner') setBannerNip94Tags(nip94Tags);
      }}
    />
  );

  const storySection = (
    <Textarea
      id="campaign-story"
      value={story}
      onChange={(e) => {
        setStory(e.target.value);
        // Auto-grow: reset then size to content so the box expands
        // downward as the user types instead of scrolling internally.
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onFocus={(e) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      placeholder={t('campaignsCreate.storyPlaceholder')}
      className={cn(
        'min-h-[200px] w-full resize-none overflow-hidden p-3',
        'text-lg leading-7 md:text-lg',
        // Match the muted, borderless look of the organization bio step.
        'rounded-lg border-2 border-transparent bg-muted/40',
        'hover:bg-muted/60 hover:border-border',
        'focus-visible:bg-transparent focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0',
        'placeholder:text-muted-foreground/40 transition-colors duration-150',
      )}
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
            {walletSection}
            {countrySection}
            {tagsSection}
            {bannerSection}
            {storySection}
            {goalSection}
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
      title: t('campaignsCreate.wizard.walletStepTitle'),
      subtitle: t('campaignsCreate.wizard.walletStepSubtitle'),
      body: walletSection,
    },
    {
      title: t('campaignsCreate.wizard.storyStepTitle'),
      subtitle: t('campaignsCreate.wizard.storyStepSubtitle'),
      body: storySection,
    },
    {
      title: t('campaignsCreate.wizard.goalStepTitle'),
      subtitle: t('campaignsCreate.wizard.goalStepSubtitle'),
      body: goalSection,
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
  // The wallet picker is validated at submit because its validity depends on
  // which inputs the user touched.
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
      // title and wallet steps. Earlier steps don't
      // even render the button because the wallet picker hasn't been
      // shown yet — publishing without it would be a confusing error.
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


// ─── Layout helpers ──────────────────────────────────────────────────────────

/**
 * Wallet picker for the campaign form.
 *
 * Two modes selectable via a single inline toggle:
 *
 *  1. **My wallet** (`'mine'`, default when nsec is available) — a
 *     primary-tinted hero card (modelled on the onboarding "Save your
 *     key" surface) whose centerpiece is a linked-icon trio
 *     (campaign ↔ key ↔ wallet) explaining that donations land in the
 *     creator's own Agora wallet. An avatar + live USD/BTC balance
 *     chip confirms the exact destination, and a "Use a custom wallet"
 *     sub-link swaps into custom mode. The HD-wallet mode also
 *     surfaces a segmented "Accept" picker (All / Public / Private)
 *     that picks which donation types the campaign accepts.
 *  2. **Custom** (`'custom'`) — two address inputs (on-chain + silent
 *     payment). At least one must parse to a valid endpoint of its
 *     mode.
 *
 * Users without nsec access (extension / bunker logins) never see the
 * "mine" branch — `hdWalletAvailable` is false and we drop straight
 * to the custom inputs.
 */
function WalletPicker({
  hdWalletAvailable,
  silentPaymentSupported,
  displayName,
  picture,
  totalBalance,
  balanceLoading,
  walletSource,
  onWalletSourceChange,
  mineAccept,
  onMineAcceptChange,
  customOnchain,
  onCustomOnchainChange,
  parsedCustomOnchain,
  customSp,
  onCustomSpChange,
  parsedCustomSp,
}: {
  hdWalletAvailable: boolean;
  silentPaymentSupported: boolean;
  displayName: string;
  picture?: string;
  /** Live HD-wallet balance in sats (confirmed + pending + SP). */
  totalBalance: number;
  /** True while the initial HD scan is still running — drives skeleton. */
  balanceLoading: boolean;
  walletSource: 'mine' | 'custom';
  onWalletSourceChange: (value: 'mine' | 'custom') => void;
  mineAccept: 'all' | 'public' | 'private';
  onMineAcceptChange: (value: 'all' | 'public' | 'private') => void;
  customOnchain: string;
  onCustomOnchainChange: (value: string) => void;
  parsedCustomOnchain: ReturnType<typeof parseCampaignWallet>;
  customSp: string;
  onCustomSpChange: (value: string) => void;
  parsedCustomSp: ReturnType<typeof parseCampaignWallet>;
}) {
  const { t } = useTranslation();
  const { data: btcPrice } = useBtcPrice();
  const initial = displayName.charAt(0).toUpperCase() || '?';
  const myWalletLabel = displayName
    ? t('campaignsCreate.myWalletLabel', { name: displayName })
    : t('campaignsCreate.myWalletDefault');

  // When no HD wallet is available (extension / bunker login) there's
  // no "mine" branch to choose — render only the custom inputs with a
  // short intro line so the user understands what's expected.
  if (!hdWalletAvailable) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('campaignsCreate.customWalletIntro')}
        </p>
        <CustomWalletInput
          id="campaign-wallet-onchain"
          label={t('campaignsCreate.bitcoinAddress')}
          placeholder={t('campaignsCreate.bitcoinAddressPlaceholder')}
          value={customOnchain}
          onChange={onCustomOnchainChange}
          parsed={parsedCustomOnchain}
          expectedMode="onchain"
        />
        <CustomWalletInput
          id="campaign-wallet-sp"
          label={t('campaignsCreate.silentPaymentCode')}
          placeholder={t('campaignsCreate.silentPaymentCodePlaceholder')}
          value={customSp}
          onChange={onCustomSpChange}
          parsed={parsedCustomSp}
          expectedMode="sp"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {walletSource === 'mine' ? (
        <>
          {/* Hero card. Modelled on the onboarding "Save your key"
              surface: a primary-tinted card whose visual centerpiece
              is an icon pair (the campaign -> the wallet) so a
              first-time creator instantly grasps that donations land
              in their own Agora wallet. The avatar + live balance
              below confirm the exact destination. */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/10 p-5 space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-2 ring-primary/30">
                <HandHeart className="size-7 text-primary" />
              </div>
              <ArrowRight className="size-5 shrink-0 text-primary rtl:rotate-180" />
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-2 ring-primary/30">
                <Wallet className="size-7 text-primary" />
              </div>
            </div>

            <p className="whitespace-pre-line text-center text-sm leading-relaxed text-foreground">
              {t('campaignsCreate.walletHeroNote')}
            </p>

            {/* Destination confirmation — avatar + live balance, framed
                as a self-contained chip so it reads as "this exact
                wallet" rather than incidental chrome. */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-background/60 px-3 py-2.5">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={picture} alt={displayName} />
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{myWalletLabel}</p>
                {balanceLoading ? (
                  <Skeleton className="mt-1 h-4 w-24" />
                ) : btcPrice ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <span className="font-medium text-foreground">
                      {satsToUSD(totalBalance, btcPrice)}
                    </span>
                    <span className="mx-1.5 opacity-60">·</span>
                    <span>{formatBTC(totalBalance)} BTC</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatBTC(totalBalance)} BTC
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 border-t border-primary/20 pt-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('campaignsCreate.walletHeroReassurance')}
              </p>
            </div>
          </div>

          {/* "Use a custom wallet" sub-link — the only affordance for
              swapping to custom mode. */}
          <button
            type="button"
            onClick={() => onWalletSourceChange('custom')}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {t('campaignsCreate.walletUseCustom')}
          </button>

          {/* Accept-mode segmented picker. Default 'all' (HD + SP); the
              non-SP options are only relevant if SP is unsupported. */}
          <AcceptModePicker
            value={mineAccept}
            onChange={onMineAcceptChange}
            silentPaymentSupported={silentPaymentSupported}
          />
        </>
      ) : (
        <>
          {/* Header — name the current mode, then offer the swap back
              on its own line beneath. Each child is wrapped in a block
              `<div>` so the two inline-flex pieces don't end up
              side-by-side on a wide enough viewport. */}
          <div className="space-y-1">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-medium">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Wallet className="size-3.5" />
                </span>
                {t('campaignsCreate.walletCustom')}
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onWalletSourceChange('mine')}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                {t('campaignsCreate.walletUseMine')}
              </button>
            </div>
          </div>

          {/* Restate the field-driven accept model in the same plain
              voice as the "mine" branch's accept picker, so swapping to
              custom mode doesn't drop the public/private hand-holding. */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('campaignsCreate.customWalletIntro')}
          </p>

          <CustomWalletInput
            id="campaign-wallet-onchain"
            label={t('campaignsCreate.bitcoinAddress')}
            placeholder={t('campaignsCreate.bitcoinAddressPlaceholder')}
            value={customOnchain}
            onChange={onCustomOnchainChange}
            parsed={parsedCustomOnchain}
            expectedMode="onchain"
          />
          <CustomWalletInput
            id="campaign-wallet-sp"
            label={t('campaignsCreate.silentPaymentCode')}
            placeholder={t('campaignsCreate.silentPaymentCodePlaceholder')}
            value={customSp}
            onChange={onCustomSpChange}
            parsed={parsedCustomSp}
            expectedMode="sp"
          />
        </>
      )}
    </div>
  );
}

/**
 * "What donations will you accept?" picker for the HD-wallet branch.
 *
 * Written for a first-time, possibly anxious creator: instead of three
 * terse jargon pills (Accept All / Public Only / Private Only) it
 * presents three full-width selectable cards, each with a friendly
 * icon, a plain-language title, and a one-line reassurance. The two
 * SP-dependent options are disabled (with a short note) when silent
 * payments aren't supported on this login (extension / bunker).
 */
function AcceptModePicker({
  value,
  onChange,
  silentPaymentSupported,
}: {
  value: 'all' | 'public' | 'private';
  onChange: (next: 'all' | 'public' | 'private') => void;
  silentPaymentSupported: boolean;
}) {
  const { t } = useTranslation();

  const options: {
    key: 'all' | 'public' | 'private';
    icon: typeof Globe;
    title: string;
    description: string;
    requiresSp?: boolean;
  }[] = [
    {
      key: 'all',
      icon: HandHeart,
      title: t('campaignsCreate.acceptAllTitle'),
      description: t('campaignsCreate.acceptAllHint'),
      requiresSp: true,
    },
    {
      key: 'public',
      icon: Globe,
      title: t('campaignsCreate.acceptPublicTitle'),
      description: t('campaignsCreate.acceptPublicHint'),
    },
    {
      key: 'private',
      icon: EyeOff,
      title: t('campaignsCreate.acceptPrivateTitle'),
      description: t('campaignsCreate.acceptPrivateHint'),
      requiresSp: true,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t('campaignsCreate.acceptHeading')}</p>
      <div className="space-y-2" role="radiogroup" aria-label={t('campaignsCreate.acceptHeading')}>
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.key;
          const disabled = option.requiresSp && !silentPaymentSupported;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40',
                disabled && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-background',
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {disabled ? t('campaignsCreate.acceptUnavailable') : option.description}
                </span>
              </span>
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                )}
                aria-hidden="true"
              >
                {selected && <Check className="size-3" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Single labeled custom-wallet input. Mirrors the accept-picker
 * language so the field-driven custom flow keeps the same public /
 * private framing: a {@link Bitcoin}/{@link EyeOff} icon next to the
 * label and a one-line caption spell out what filling this field
 * means, so the user never has to infer "address = public,
 * code = private".
 *
 * The inline error fires only when a non-empty value either fails to
 * parse OR parses to a mode that doesn't match {@link expectedMode}
 * (e.g., an `sp1…` typed into the on-chain field).
 */
function CustomWalletInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  parsed,
  expectedMode,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  parsed: ReturnType<typeof parseCampaignWallet>;
  expectedMode: 'onchain' | 'sp';
}) {
  const { t } = useTranslation();
  const trimmed = value.trim();
  const hasError = trimmed.length > 0 && (!parsed || parsed.mode !== expectedMode);
  const errorMessage =
    expectedMode === 'onchain'
      ? t('campaignsCreate.onchainInvalid')
      : t('campaignsCreate.spInvalid');
  const MeaningIcon = expectedMode === 'onchain' ? Bitcoin : EyeOff;
  const meaning =
    expectedMode === 'onchain'
      ? t('campaignsCreate.customOnchainMeaning')
      : t('campaignsCreate.customSpMeaning');
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <MeaningIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
      </div>
      <div className="relative">
        <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          className={cn('pl-9 font-mono text-xs', hasError && 'border-destructive focus-visible:ring-destructive')}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          aria-invalid={hasError}
        />
      </div>
      {hasError ? (
        <p className="text-xs text-destructive">{errorMessage}</p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{meaning}</p>
      )}
    </div>
  );
}

export default CreateCampaignPage;
