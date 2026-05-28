import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useTranslation, Trans } from 'react-i18next';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  Bitcoin,
  HandHeart,
  HelpCircle,
  Loader2,
  MapPin,
  Pencil,
  Radar,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { CountryFlag } from '@/components/CountryFlag';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { LoginArea } from '@/components/auth/LoginArea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { formatBTC, satsToUSD } from '@/lib/bitcoin';
import {
  CAMPAIGN_KIND,
  encodeCampaignNaddr,
  parseCampaign,
  parseCampaignWallet,
  slugifyCampaignIdentifier,
} from '@/lib/campaign';
import { getTodayDateInput } from '@/lib/dateInput';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { genUserName } from '@/lib/genUserName';
import { createOrganizationAssociationTags, decodeOrganizationParam } from '@/lib/organizationContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { withAgoraTag } from '@/lib/agoraNoteTags';
import { getCountryInfo, searchCountries, type CountryEntry } from '@/lib/countries';
import { getEditableContentTags, parseContentTagInput } from '@/lib/contentTags';
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

function formatDateInput(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
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
  const { toast } = useToast();
  const hdWallet = useHdWallet();
  const hdWalletAvailable = hdWallet.availability.status === 'available';
  const silentPaymentSupported = hdWalletAvailable && !!hdWallet.silentPaymentAddress;
  const userAuthor = useAuthor(user?.pubkey);
  const userMetadata = userAuthor.data?.metadata;
  const userDisplayName = user
    ? (userMetadata?.name ?? userMetadata?.display_name ?? genUserName(user.pubkey))
    : '';

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
  const [deadline, setDeadline] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [organizationATag, setOrganizationATag] = useState('');
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);

  const editNaddr = searchParams.get('edit');
  const editTarget = useMemo(() => getEditTarget(editNaddr), [editNaddr]);
  const isEditMode = !!editNaddr;

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
  // fundraisers to understand Nostr d-tags.
  const derivedIdentifier = useMemo(() => slugifyCampaignIdentifier(title), [title]);
  const activeIdentifier = editCampaign?.identifier ?? derivedIdentifier;
  const minDeadline = useMemo(() => getTodayDateInput(), []);

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
    setDeadline(formatDateInput(editCampaign.deadline));
    const editCountryCode = editCampaign.countryCode ?? '';
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? (getCountryInfo(editCountryCode)?.subdivisionName ?? getCountryInfo(editCountryCode)?.name ?? editCountryCode) : '');
    setTagInput(getEditableContentTags(editCampaign.event.tags).join(', '));
    const existingOrgATag = editCampaign.event.tags.find(
      ([n, v]) => n === 'A' && typeof v === 'string' && v.startsWith('34550:'),
    )?.[1] ?? '';
    setOrganizationATag(existingOrgATag);
    setPrepopulatedEventId(editCampaign.event.id);
  }, [editCampaign, prepopulatedEventId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('campaignsCreate.errorLoginRequired'));
      if (isEditMode && !editCampaign) throw new Error(t('campaignsCreate.errorEditLoadFailed'));
      if (editCampaign && editCampaign.pubkey !== user.pubkey) {
        throw new Error(t('campaignsCreate.errorEditNotOwner'));
      }
      const trimmedTitle = title.trim();
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

      let deadlineNum: number | undefined;
      if (deadline.trim()) {
        if (deadline < minDeadline) {
          throw new Error(t('campaignsCreate.errorDeadlinePast'));
        }
        const ts = Math.floor(new Date(deadline).getTime() / 1000);
        if (!Number.isFinite(ts) || ts <= 0) {
          throw new Error(t('campaignsCreate.errorDeadlineInvalid'));
        }
        deadlineNum = ts;
      }

      const resolvedCountryCode = countryCode;
      const contentTags = parseContentTagInput(tagInput);

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
      if (deadlineNum !== undefined) tags.push(['deadline', String(deadlineNum)]);
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
  const titleSection = (
    <FormSection title={t('forms.title')} requirement="Required">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('campaignsCreate.titlePlaceholder')}
        maxLength={200}
        required
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
      <Input
        id="campaign-tags"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        placeholder={t('campaignsCreate.tagsPlaceholder')}
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

  const storySection = (
    <FormSection title={t('campaignsCreate.story')} requirement="Recommended">
      <Textarea
        id="campaign-story"
        value={story}
        onChange={(e) => setStory(e.target.value)}
        placeholder={t('campaignsCreate.storyPlaceholder')}
        rows={7}
        className="font-mono text-base md:text-sm"
      />
    </FormSection>
  );

  const goalDeadlineSection = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {/* Goal — integer USD */}
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

      {/* Deadline */}
      <FormSection title={t('campaignsCreate.deadline')} requirement="Optional">
        <Input
          id="campaign-deadline"
          type="date"
          min={minDeadline}
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="[color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
        />
      </FormSection>
    </div>
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
            {goalDeadlineSection}
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

  // Required-field gates for the wizard's Next buttons. Title is the
  // only field we can cleanly gate client-side; the wallet picker is
  // a multi-mode parser whose validity depends on which inputs the
  // user touched, so we surface that error via the submit-time
  // validator (formError) once they try to publish.
  const titleProvided = title.trim().length > 0;

  return (
    <CampaignWizard
      orgChip={orgChip}
      steps={[
        {
          title: t('campaignsCreate.wizard.titleStepTitle'),
          subtitle: t('campaignsCreate.wizard.titleStepSubtitle'),
          body: titleSection,
        },
        {
          title: t('campaignsCreate.wizard.walletStepTitle'),
          subtitle: t('campaignsCreate.wizard.walletStepSubtitle'),
          body: walletSection,
        },
        {
          title: t('campaignsCreate.wizard.bannerStepTitle'),
          subtitle: t('campaignsCreate.wizard.bannerStepSubtitle'),
          body: bannerSection,
        },
        {
          title: t('campaignsCreate.wizard.storyStepTitle'),
          subtitle: t('campaignsCreate.wizard.storyStepSubtitle'),
          body: storySection,
        },
        {
          title: t('campaignsCreate.wizard.goalStepTitle'),
          subtitle: t('campaignsCreate.wizard.goalStepSubtitle'),
          body: goalDeadlineSection,
        },
        {
          title: t('campaignsCreate.wizard.tagsStepTitle'),
          subtitle: t('campaignsCreate.wizard.tagsStepSubtitle'),
          body: <>{countrySection}{tagsSection}</>,
        },
      ]}
      canAdvanceFromStep={(s) => (s === 1 ? titleProvided : true)}
      // The shortcut appears once the user has cleared the two
      // required steps (title @ 1, wallet @ 2). Earlier steps don't
      // even render the button because the wallet picker hasn't been
      // shown yet — publishing without it would be a confusing error.
      launchAvailableFromStep={3}
      errorAlert={errorAlert}
      submitButtonContent={submitButtonContent}
      submitting={submitMutation.isPending || coverUploading}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
    />
  );
}

// ─── Wizard wrapper ──────────────────────────────────────────────────────────

interface WizardStep {
  /** Centered heading at the top of the step. Concise — one short phrase. */
  title: string;
  /** Muted single-line subtitle beneath the heading. Optional. */
  subtitle?: string;
  /** The form fields for this step. */
  body: ReactNode;
}

/**
 * Multi-step layout for creating a new campaign.
 *
 * Rendered as a **fullscreen captive overlay** (`fixed inset-0 z-50`)
 * so it sits above the persistent TopNav — the same treatment Chad's
 * {@link OnboardingGate} uses for the signup flow. From the user's
 * perspective creating a campaign is a focused, distraction-free task,
 * not "another page in the app."
 *
 * Visually it mirrors the captive onboarding: a sticky single-bar
 * progress fill across the top, a top-right X to escape, a top-left
 * back arrow from step 2 onward, a centered narrow column for each
 * step, and a big rounded-full primary CTA.
 *
 * Step 1 holds the **required** title field; step 2 holds the
 * **required** wallet picker. Once both are filled in, every step from
 * {@link launchAvailableFromStep} onward surfaces a ghost "Skip Next &
 * Launch" shortcut beneath the primary Next button so the rest of the
 * wizard is opt-in. The last step is terminal: its only forward action
 * is the primary launch button.
 *
 * The form lives in this wrapper (not the parent) so the publish
 * button — wherever it ends up in the wizard — submits the same form
 * and reuses the parent's `handleSubmit`.
 */
function CampaignWizard({
  orgChip,
  steps,
  errorAlert,
  submitButtonContent,
  submitting,
  canAdvanceFromStep,
  launchAvailableFromStep,
  onSubmit,
  onClose,
}: {
  orgChip: ReactNode;
  /** 1-indexed list of steps. Length determines the total. */
  steps: WizardStep[];
  errorAlert: ReactNode;
  submitButtonContent: ReactNode;
  submitting: boolean;
  /**
   * Predicate gating forward progress from a given (1-indexed) step.
   * Return `false` to disable Next on that step. Steps not gated by
   * this fn are always allowed to advance.
   */
  canAdvanceFromStep: (step: number) => boolean;
  /**
   * 1-indexed step from which the "Skip Next & Launch" shortcut
   * appears. Earlier steps render only the Next button — the user
   * shouldn't be able to publish before the required fields are
   * collected.
   */
  launchAvailableFromStep: number;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const totalSteps = steps.length;
  const current = steps[step - 1];
  const isTerminal = step === totalSteps;
  const progress = (step / totalSteps) * 100;

  const launchVisible = step >= launchAvailableFromStep;
  const canAdvance = canAdvanceFromStep(step);
  const canSubmit = launchVisible && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t('campaignsCreate.headingCreate')}
    >
      {/* Sticky single-bar progress indicator, mirroring the captive
          onboarding flow. */}
      <div className="sticky top-0 z-10 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top-right close. Lets users escape if they truly don't want to
          continue — deliberately unobtrusive so casual taps don't drop
          them out of the flow. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.goBack')}
        className="absolute right-4 top-4 sm:right-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Top-left back. Mirrors the close button so the user can step
          back through the wizard without scrolling to the footer. Only
          rendered from step 2 onward — step 1's escape route is the X. */}
      {step > 1 && (
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(s - 1, 1))}
          disabled={submitting}
          aria-label={t('campaignsCreate.wizard.back')}
          className="absolute left-4 top-4 sm:left-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}

      <form
        className="flex-1 flex items-start sm:items-center justify-center px-6 pt-16 pb-12"
        onSubmit={onSubmit}
      >
        <div
          key={step}
          className="w-full max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          {/* Centered title block — captive-onboarding cadence: large
              heading + muted subtitle, no progress eyebrow (the
              top-of-page bar carries that signal). */}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold tracking-tight">{current.title}</h2>
            {current.subtitle && (
              <p className="text-sm text-muted-foreground">{current.subtitle}</p>
            )}
          </div>

          {/* Step body. The org chip rides along on step 1 so the
              "publishing under <org>" context is the first thing the
              user sees. No card chrome — onboarding keeps the content
              area visually quiet so the focus stays on the fields. */}
          <div className="space-y-3">
            {step === 1 && orgChip}
            {current.body}
          </div>

          {errorAlert}

          {/* Footer.
            - Non-terminal steps: primary "Next" advances the wizard.
              From `launchAvailableFromStep` onward a ghost "Skip Next
              & Launch" shortcut sits beneath it so the rest of the
              wizard is opt-in.
            - Terminal step: primary "Launch campaign" is the only
              forward action.
            - Back navigation lives in the top-left header chrome, not
              here. */}
          <div className="space-y-3 pt-1">
            {isTerminal ? (
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full h-12 text-base rounded-full"
              >
                {submitButtonContent}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={() => setStep((s) => Math.min(s + 1, totalSteps))}
                  disabled={submitting || !canAdvance}
                  className="w-full h-12 text-base rounded-full"
                >
                  {t('campaignsCreate.wizard.next')}
                </Button>
                {launchVisible && (
                  <Button
                    type="submit"
                    variant="ghost"
                    disabled={!canSubmit}
                    className="w-full"
                  >
                    {submitting ? submitButtonContent : t('campaignsCreate.wizard.launchNow')}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

/**
 * Wallet picker for the campaign form.
 *
 * Two modes selectable via a single inline toggle:
 *
 *  1. **My wallet** (`'mine'`, default when nsec is available) — a
 *     compact identity card shows the user's avatar, display name and
 *     live USD/BTC balance, modelled on the wallet-page balance
 *     treatment. A small pencil affordance to the right is the entry
 *     point to swap into custom mode; mirror-link beneath the inputs
 *     swaps back. The HD-wallet mode also surfaces a segmented
 *     "Accept" picker (All / Public / Private) that picks which
 *     donation types the campaign accepts.
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
          {/* Identity + balance card. Tapping the pencil swaps into the
              custom-wallet inputs without changing wizard step. */}
          <button
            type="button"
            onClick={() => onWalletSourceChange('custom')}
            aria-label={t('campaignsCreate.walletEditAria')}
            className="group w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-3">
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
              <Pencil className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
          </button>

          {/* "Use a custom wallet" sub-link — quieter affordance for the
              same swap, since the pencil alone is easy to miss. */}
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
          {/* Header strip — name the current mode and offer the swap
              back to the user's wallet. Mirrors the pencil card so
              both directions of the toggle feel symmetric. */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Wallet className="size-3.5" />
              </span>
              {t('campaignsCreate.walletCustom')}
            </div>
            <button
              type="button"
              onClick={() => onWalletSourceChange('mine')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
              {t('campaignsCreate.walletUseMine')}
            </button>
          </div>

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
 * Segmented "Accept" picker for the HD-wallet branch. Three pill
 * buttons (All / Public / Private) with a one-line caption beneath
 * that explains the current selection. Public is always available;
 * the All and Private buttons disable when SP isn't supported
 * (extension / bunker logins).
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

  const caption = {
    all: t('campaignsCreate.acceptAllHint'),
    public: t('campaignsCreate.acceptPublicHint'),
    private: t('campaignsCreate.acceptPrivateHint'),
  }[value];

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        value={value}
        // Radix ToggleGroup emits '' when the user toggles off the
        // selected item. Required campaigns can never be in "no
        // mode" state — coerce empty back to the previous value.
        onValueChange={(next) => {
          if (!next) return;
          onChange(next as 'all' | 'public' | 'private');
        }}
        variant="outline"
        className="grid w-full grid-cols-3 gap-1.5"
      >
        <ToggleGroupItem
          value="all"
          disabled={!silentPaymentSupported}
          className="h-auto justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
          aria-label={t('campaignsCreate.acceptAll')}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('campaignsCreate.acceptAllShort')}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="public"
          className="h-auto justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
          aria-label={t('campaignsCreate.acceptPublic')}
        >
          <Bitcoin className="h-3.5 w-3.5" />
          {t('campaignsCreate.acceptPublicShort')}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="private"
          disabled={!silentPaymentSupported}
          className="h-auto justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
          aria-label={t('campaignsCreate.acceptPrivate')}
        >
          <Radar className="h-3.5 w-3.5" />
          {t('campaignsCreate.acceptPrivateShort')}
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

/**
 * Single labeled custom-wallet input. The inline error fires only when
 * a non-empty value either fails to parse OR parses to a mode that
 * doesn't match {@link expectedMode} (e.g., an `sp1…` typed into the
 * on-chain field).
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
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
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
      {hasError && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCountry = selectedCode ? getCountryInfo(selectedCode) : undefined;
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
          id="campaign-country"
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
          className="h-9 rounded-full border-0 bg-secondary pl-10 pr-10 text-base md:text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder={t('forms.countrySearchPlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="campaign-country-results"
        />
        {(query || selectedCode) && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 rounded-full p-1 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:transition-colors"
            aria-label={t('campaignsCreate.countryClearAria')}
          >
            <X className="size-4" />
          </button>
        )}

        {showResults && (
          <div
            id="campaign-country-results"
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary leading-none">
                  <CountryFlag
                    code={country.code}
                    emoji={country.flag}
                    label={t('campaignsCreate.flagOfAria', { name: country.name })}
                    className="text-lg"
                  />
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
            i18nKey="campaignsCreate.countryHint"
            values={{ code: selectedCode }}
            components={{ 0: <span className="font-mono text-foreground" /> }}
          />
        </p>
      )}
    </div>
  );
}

export default CreateCampaignPage;
