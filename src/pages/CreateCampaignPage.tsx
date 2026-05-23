import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  HandHeart,
  Loader2,
  MapPin,
  Wallet,
  X,
} from 'lucide-react';

import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { BitcoinPublicDisclaimer } from '@/components/BitcoinPublicDisclaimer';
import { BitcoinPrivateDisclaimer } from '@/components/BitcoinPrivateDisclaimer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuthor } from '@/hooks/useAuthor';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useLayoutOptions } from '@/contexts/LayoutContext';
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
import { COUNTRIES, searchCountries, type CountryEntry } from '@/lib/countries';
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
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

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
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  /** NIP-94-format tag pairs from the most recent banner upload, used to build the NIP-92 imeta tag on publish. */
  const [bannerNip94Tags, setBannerNip94Tags] = useState<string[][] | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  /**
   * Wallet form state. The campaign's published `w` tags are the
   * combination of:
   *
   *  - The HD wallet's fresh receive address (advanced at submit time)
   *    when {@link useMyWallet} is on.
   *  - The user's static silent-payment code when
   *    {@link useMyPrivateWallet} is on.
   *  - Anything the user typed into {@link customOnchain} /
   *    {@link customSp} (when the "Add another address" disclosure is
   *    open).
   *
   * A custom input always wins for its mode — so a user who types a
   * cold-storage `bc1p…` while leaving {@link useMyWallet} on publishes
   * the typed address (and we do NOT advance the HD cursor for that
   * publish). At least one of the four sources must resolve to a valid
   * wallet endpoint.
   */
  const [useMyWallet, setUseMyWallet] = useState(false);
  const [useMyPrivateWallet, setUseMyPrivateWallet] = useState(false);
  const [customOnchain, setCustomOnchain] = useState('');
  const [customSp, setCustomSp] = useState('');
  /** Whether the "Add another address" disclosure is expanded. */
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [goalUsd, setGoalUsd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState('');
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
  // both chips on. Skipped in edit mode (we always start with chips
  // off and the existing values pre-filled into the custom inputs —
  // see the edit-prepopulation effect below) and once the user has
  // interacted, so re-renders that re-derive `hdWalletAvailable` don't
  // override an explicit choice. We wait until silent-payment support
  // is resolved (both `hdWalletAvailable` and `silentPaymentSupported`
  // derive from the same nsec, so they normally land in the same
  // render) so the SP chip toggles on by default too.
  const [walletDefaultsApplied, setWalletDefaultsApplied] = useState(false);
  useEffect(() => {
    if (isEditMode || walletDefaultsApplied) return;
    if (!hdWalletAvailable) return;
    setUseMyWallet(true);
    if (silentPaymentSupported) setUseMyPrivateWallet(true);
    setWalletDefaultsApplied(true);
  }, [isEditMode, walletDefaultsApplied, hdWalletAvailable, silentPaymentSupported]);

  // Without nsec access, the chips are hidden and the custom inputs are
  // the only way to declare wallets. Make sure the disclosure is open
  // in that case so the inputs are visible.
  useEffect(() => {
    if (!hdWalletAvailable) setShowCustomFields(true);
  }, [hdWalletAvailable]);

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
    title: isEditMode ? 'Edit campaign | Agora' : 'Start a campaign | Agora',
    description: isEditMode ? 'Update your fundraising campaign on Agora.' : 'Launch a fundraising campaign on Agora.',
  });

  useEffect(() => {
    if (!editCampaign || prepopulatedEventId === editCampaign.event.id) return;

    setTitle(editCampaign.title);
    setSummary(editCampaign.summary);
    setStory(editCampaign.story);
    setBannerUrl(editCampaign.banner ?? '');
    // We don't have NIP-94 tags for an existing event — the imeta is
    // already on the event. We'll re-emit it from the original event
    // tags below if the URL is unchanged.
    setBannerNip94Tags(null);
    // Edit mode always starts with both chips off, the existing
    // endpoints pre-filled into the custom inputs, and the disclosure
    // open. We don't try to auto-detect whether the stored `w` tags
    // came from the user's HD wallet — switching wallets is an
    // explicit choice the user must make, and the cursor must not be
    // burned on a no-op edit.
    setUseMyWallet(false);
    setUseMyPrivateWallet(false);
    setCustomOnchain(editCampaign.wallets.onchain?.value ?? '');
    setCustomSp(editCampaign.wallets.sp?.value ?? '');
    setShowCustomFields(true);
    setWalletDefaultsApplied(true);
    setGoalUsd(editCampaign.goalUsd !== undefined ? String(editCampaign.goalUsd) : '');
    setDeadline(formatDateInput(editCampaign.deadline));
    const editCountryCode = editCampaign.countryCode ?? '';
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? COUNTRIES[editCountryCode]?.name ?? editCountryCode : '');
    const existingOrgATag = editCampaign.event.tags.find(
      ([n, v]) => n === 'A' && typeof v === 'string' && v.startsWith('34550:'),
    )?.[1] ?? '';
    setOrganizationATag(existingOrgATag);
    setPrepopulatedEventId(editCampaign.event.id);
  }, [editCampaign, prepopulatedEventId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create a campaign.');
      if (isEditMode && !editCampaign) throw new Error('Campaign could not be loaded for editing.');
      if (editCampaign && editCampaign.pubkey !== user.pubkey) {
        throw new Error('Only the campaign author can edit this campaign.');
      }
      const trimmedTitle = title.trim();
      const slug = activeIdentifier;

      if (!trimmedTitle) throw new Error('Title is required.');
      if (!slug) throw new Error('Title must include letters or numbers so a campaign URL can be created.');
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
        throw new Error('Identifier must be lowercase letters, numbers, and hyphens.');
      }

      // Resolve the campaign's `w` endpoints. For each mode, a typed
      // value in the disclosure wins; otherwise the corresponding chip
      // (when on) contributes the HD-derived value. We validate any
      // typed values up-front so a malformed input is reported before
      // any irreversible work (no cursor burn, no relay round-trips).
      // The HD cursor advance happens later, just before the `w` tag
      // is appended, so a failure between here and there doesn't
      // silently consume a receive index.
      const customOnchainTrimmed = customOnchain.trim();
      const customSpTrimmed = customSp.trim();

      let customOnchainWallet = null as ReturnType<typeof parseCampaignWallet>;
      if (showCustomFields && customOnchainTrimmed) {
        customOnchainWallet = parseCampaignWallet(customOnchainTrimmed);
        if (!customOnchainWallet || customOnchainWallet.mode !== 'onchain') {
          throw new Error(
            'The on-chain address is not a recognized mainnet bech32(m) address (bc1q… / bc1p…).',
          );
        }
      }

      let customSpWallet = null as ReturnType<typeof parseCampaignWallet>;
      if (showCustomFields && customSpTrimmed) {
        customSpWallet = parseCampaignWallet(customSpTrimmed);
        if (!customSpWallet || customSpWallet.mode !== 'sp') {
          throw new Error(
            'The silent-payment code is not a recognized BIP-352 code (sp1…).',
          );
        }
      }

      // For each mode, choose the effective endpoint: custom wins,
      // otherwise the chip (if on) supplies its value. The HD-derived
      // onchain address is *not* derived yet — see the deferred step
      // near the `w` tag.
      const willUseHdOnchain = useMyWallet && !customOnchainWallet;
      const spWallet =
        customSpWallet ??
        (useMyPrivateWallet && hdWallet.silentPaymentAddress
          ? parseCampaignWallet(hdWallet.silentPaymentAddress.address)
          : null);

      if (useMyWallet && !customOnchainWallet && !hdWalletAvailable) {
        throw new Error('Built-in wallet is unavailable for this login.');
      }
      if (useMyPrivateWallet && !customSpWallet && !silentPaymentSupported) {
        throw new Error('Silent-payment address is unavailable for this login.');
      }

      // At least one endpoint must resolve. If neither the on-chain nor
      // the SP path will produce a value, bail before any work.
      if (!willUseHdOnchain && !customOnchainWallet && !spWallet) {
        throw new Error(
          'Provide at least one wallet endpoint — a Bitcoin mainnet address (bc1q… / bc1p…) or a silent-payment code (sp1…).',
        );
      }

      // Goal — integer USD (no unit, no currency conversion).
      let goalNum: number | undefined;
      const trimmedGoal = goalUsd.replace(/[, $]/g, '').trim();
      if (trimmedGoal) {
        const n = Number(trimmedGoal);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
          throw new Error('Goal must be a positive whole-dollar amount.');
        }
        goalNum = n;
      }

      let deadlineNum: number | undefined;
      if (deadline.trim()) {
        if (deadline < minDeadline) {
          throw new Error('Deadline cannot be in the past.');
        }
        const ts = Math.floor(new Date(deadline).getTime() / 1000);
        if (!Number.isFinite(ts) || ts <= 0) {
          throw new Error('Deadline is not a valid date.');
        }
        deadlineNum = ts;
      }

      const resolvedCountryCode = countryCode;

      let prev: NostrEvent | null = null;
      if (isEditMode) {
        prev = await fetchFreshEvent(nostr, {
          kinds: [CAMPAIGN_KIND],
          authors: [user.pubkey],
          '#d': [slug],
        });
        if (!prev || !parseCampaign(prev)) {
          throw new Error('Could not find the latest version of this campaign to update.');
        }
      } else {
        // d-tag collision guard. Block silent overwrite of an existing campaign
        // by the same author — even with the same author, we want explicit edit
        // flows, not "create with the same slug".
        const existing = await nostr.query([
          { kinds: [CAMPAIGN_KIND], authors: [user.pubkey], '#d': [slug], limit: 1 },
        ]);
        if (existing.length > 0) {
          throw new Error(
            `You already have a campaign with the identifier "${slug}". Choose another.`,
          );
        }
      }

      // Validate banner URL (must be https).
      const trimmedBanner = bannerUrl.trim();
      const sanitizedBanner = trimmedBanner ? sanitizeUrl(trimmedBanner) : undefined;
      if (trimmedBanner && !sanitizedBanner) {
        throw new Error('Banner must be a valid https:// URL.');
      }

      const tags: string[][] = [
        ['d', slug],
        ['title', trimmedTitle],
      ];
      if (summary.trim()) tags.push(['summary', summary.trim()]);
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
      tags.push(['alt', `Fundraising campaign: ${trimmedTitle}`]);

      // Last step before the `w` tags: advance the HD wallet cursor if
      // the user chose to use the HD on-chain wallet AND didn't
      // override it with a typed value. This is deliberately the *last*
      // mutation we do before publishing so a validation failure
      // earlier in this function doesn't burn an index.
      let onchainWallet = customOnchainWallet;
      if (!onchainWallet && willUseHdOnchain) {
        const next = hdWallet.nextReceiveAddress();
        if (!next) {
          throw new Error('Could not derive a fresh on-chain address from your wallet.');
        }
        const parsed = parseCampaignWallet(next.address);
        if (!parsed || parsed.mode !== 'onchain') {
          throw new Error('Derived wallet address failed validation. Please add a custom address instead.');
        }
        onchainWallet = parsed;
      }

      if (!onchainWallet && !spWallet) {
        // Defense in depth — the earlier guard already covers this,
        // but the type narrower can't see across the cursor advance.
        throw new Error('Wallet endpoint is required.');
      }
      if (onchainWallet) tags.push(['w', onchainWallet.value]);
      if (spWallet) tags.push(['w', spWallet.value]);
      if (goalNum !== undefined) tags.push(['goal', String(goalNum)]);
      if (deadlineNum !== undefined) tags.push(['deadline', String(deadlineNum)]);
      if (resolvedCountryCode) {
        tags.push(['i', createCountryIdentifier(resolvedCountryCode)]);
        tags.push(['k', 'iso3166-1']);
      }
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
        throw new Error('Published event failed validation. Please refresh and try again.');
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
        title: isEditMode ? 'Campaign updated' : 'Campaign launched',
        description: isEditMode ? 'Your fundraiser changes are live.' : 'Your fundraiser is live.',
      });
      navigate(`/${encodeCampaignNaddr(campaign)}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: isEditMode ? 'Could not update campaign' : 'Could not publish campaign',
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
              <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Log in to start a campaign</h2>
              <p className="text-muted-foreground">
                Campaigns are signed Nostr events. You need a Nostr login to publish one.
              </p>
              <Button asChild>
                <Link to="/">Go home</Link>
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
              <h2 className="text-xl font-semibold">Invalid edit link</h2>
              <p className="text-muted-foreground">
                This campaign edit link is missing a valid campaign address.
              </p>
              <Button type="button" onClick={() => navigate('/campaigns/new')}>
                Start a new campaign
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
              <p className="text-sm text-muted-foreground">Loading campaign…</p>
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
              <AlertTriangle className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Campaign cannot be edited</h2>
              <p className="text-muted-foreground">
                Only the author of this campaign can update it.
              </p>
              <Button type="button" onClick={() => navigate(-1)}>
                Go back
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
              aria-label="Go back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isEditMode ? 'Edit campaign' : 'Start a campaign'}
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

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Title */}
          <FormSection title="Title" requirement="Required">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Save the Last Bookstore"
              maxLength={200}
              required
            />
          </FormSection>

          {/* Wallet (required) */}
          <FormSection title="Bitcoin wallet" requirement="Required">
            <WalletPicker
              hdWalletAvailable={hdWalletAvailable}
              silentPaymentSupported={silentPaymentSupported}
              displayName={userDisplayName}
              picture={userMetadata?.picture}
              useMyWallet={useMyWallet}
              onToggleMyWallet={() => setUseMyWallet((v) => !v)}
              useMyPrivateWallet={useMyPrivateWallet}
              onToggleMyPrivateWallet={() => setUseMyPrivateWallet((v) => !v)}
              showCustomFields={showCustomFields}
              onToggleCustomFields={() => setShowCustomFields((v) => !v)}
              customOnchain={customOnchain}
              onCustomOnchainChange={setCustomOnchain}
              parsedCustomOnchain={parsedCustomOnchain}
              customSp={customSp}
              onCustomSpChange={setCustomSp}
              parsedCustomSp={parsedCustomSp}
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

          {/* Banner image */}
          <FormSection title="Banner image" requirement="Recommended">
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

          {/* Summary */}
          <FormSection title="Summary" requirement="Recommended">
            <Textarea
              id="campaign-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Help our neighborhood legal clinic defend peaceful protesters."
              rows={2}
              maxLength={300}
            />
          </FormSection>

          {/* Story */}
          <FormSection title="Story" requirement="Optional">
            <Textarea
              id="campaign-story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Share the background, who benefits, and how funds will be used."
              rows={7}
              className="font-mono text-sm"
            />
          </FormSection>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Goal — integer USD */}
            <FormSection title="Goal" requirement="Optional">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="campaign-goal"
                  type="text"
                  inputMode="numeric"
                  placeholder="25,000"
                  value={goalUsd}
                  onChange={(e) => setGoalUsd(e.target.value)}
                  className="pl-7 pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  USD
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Whole US Dollars. Donors pay in Bitcoin; clients estimate the USD-equivalent at view time.
              </p>
            </FormSection>

            {/* Deadline */}
            <FormSection title="Deadline" requirement="Optional">
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
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="pt-1">
          <Button type="submit" disabled={submitMutation.isPending || coverUploading} className="w-full">
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {isEditMode ? 'Updating…' : 'Publishing…'}
              </>
            ) : coverUploading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Uploading banner…
              </>
            ) : (
              <>
                <HandHeart className="size-4 mr-2" />
                {isEditMode ? 'Update campaign' : 'Launch campaign'}
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

/**
 * Wallet picker for the campaign form. Renders two avatar chips ("My
 * wallet" / "My private wallet") for nsec users plus a collapsible
 * "Add another address" disclosure with bc1 and sp1 inputs.
 *
 * Without nsec access, the chips are hidden and the two custom inputs
 * are shown unconditionally — that's the only path to a wallet
 * endpoint for users who logged in via extension or bunker.
 *
 * The disclosure is always rendered; toggling it controls whether the
 * custom inputs contribute to the published `w` tags. A typed value
 * wins over the corresponding chip's HD-derived value (so a user can
 * publish a cold-storage `bc1p…` even with "My wallet" still ticked).
 */
function WalletPicker({
  hdWalletAvailable,
  silentPaymentSupported,
  displayName,
  picture,
  useMyWallet,
  onToggleMyWallet,
  useMyPrivateWallet,
  onToggleMyPrivateWallet,
  showCustomFields,
  onToggleCustomFields,
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
  useMyWallet: boolean;
  onToggleMyWallet: () => void;
  useMyPrivateWallet: boolean;
  onToggleMyPrivateWallet: () => void;
  showCustomFields: boolean;
  onToggleCustomFields: () => void;
  customOnchain: string;
  onCustomOnchainChange: (value: string) => void;
  parsedCustomOnchain: ReturnType<typeof parseCampaignWallet>;
  customSp: string;
  onCustomSpChange: (value: string) => void;
  parsedCustomSp: ReturnType<typeof parseCampaignWallet>;
}) {
  const initial = displayName.charAt(0).toUpperCase() || '?';
  // The on-chain disclaimer fires whenever the campaign will publish an
  // on-chain endpoint — either via "My wallet" or a valid typed bc1.
  const willPublishOnchain =
    (useMyWallet && hdWalletAvailable) ||
    (showCustomFields && parsedCustomOnchain?.mode === 'onchain');
  // The SP disclaimer fires whenever the campaign will publish an SP
  // endpoint — either via "My private wallet" or a valid typed sp1.
  const willPublishSp =
    (useMyPrivateWallet && silentPaymentSupported) ||
    (showCustomFields && parsedCustomSp?.mode === 'sp');

  return (
    <div className="space-y-3">
      {hdWalletAvailable && (
        <div className="flex flex-wrap gap-2">
          <WalletChip
            selected={useMyWallet}
            onToggle={onToggleMyWallet}
            label={displayName ? `${displayName}'s wallet` : 'My wallet'}
            picture={picture}
            initial={initial}
          />
          <WalletChip
            selected={useMyPrivateWallet && silentPaymentSupported}
            onToggle={onToggleMyPrivateWallet}
            disabled={!silentPaymentSupported}
            label={displayName ? `${displayName}'s private wallet` : 'My private wallet'}
            picture={picture}
            initial={initial}
          />
        </div>
      )}

      {hdWalletAvailable && (
        <button
          type="button"
          onClick={onToggleCustomFields}
          className="text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:transition-colors"
          aria-expanded={showCustomFields}
        >
          {showCustomFields ? '− Hide custom addresses' : '+ Add another address'}
        </button>
      )}

      {showCustomFields && (
        <div className="space-y-3 pt-1">
          {!hdWalletAvailable && (
            <p className="text-xs text-muted-foreground">
              Enter a Bitcoin address, a silent-payment code, or both. At least one is required.
            </p>
          )}
          <CustomWalletInput
            id="campaign-wallet-onchain"
            label="Bitcoin address"
            placeholder="bc1q… or bc1p…"
            value={customOnchain}
            onChange={onCustomOnchainChange}
            parsed={parsedCustomOnchain}
            expectedMode="onchain"
          />
          <CustomWalletInput
            id="campaign-wallet-sp"
            label="Silent-payment code"
            placeholder="sp1…"
            value={customSp}
            onChange={onCustomSpChange}
            parsed={parsedCustomSp}
            expectedMode="sp"
          />
        </div>
      )}

      {!hdWalletAvailable && !showCustomFields && (
        // Defensive — the effect on mount forces showCustomFields=true
        // when nsec is unavailable. This branch shouldn't render, but
        // we surface a hint just in case.
        <p className="text-xs text-muted-foreground">
          Log in with a Nostr secret key to use a built-in wallet, or enter a Bitcoin address below.
        </p>
      )}

      {willPublishOnchain && (
        <BitcoinPublicDisclaimer
          tone="soft"
          includeCashOutAdvice={false}
          leadText={
            willPublishSp
              ? 'Donations to the Bitcoin address are public and can be traced.'
              : 'Donations are public and can be traced.'
          }
          popoverText={
            <>
              Bitcoin is a public ledger. Transactions sent to this
              wallet will be visible to everyone. Funds you send from
              it can be traced back to you and your donors, even after
              being exchanged by multiple people.
            </>
          }
        />
      )}
      {willPublishSp && <BitcoinPrivateDisclaimer />}
    </div>
  );
}

/** Avatar-style toggle chip used for "My wallet" / "My private wallet". */
function WalletChip({
  selected,
  onToggle,
  disabled,
  label,
  picture,
  initial,
}: {
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
  picture?: string;
  initial: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm motion-safe:transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-secondary',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-card',
      )}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={picture} alt="" />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <span className="truncate max-w-[200px]">{label}</span>
      {selected && <Check className="size-3.5 text-primary shrink-0" />}
    </button>
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
  const trimmed = value.trim();
  const hasError = trimmed.length > 0 && (!parsed || parsed.mode !== expectedMode);
  const errorMessage =
    expectedMode === 'onchain'
      ? 'Not a recognized mainnet Bitcoin address (bc1q… / bc1p…).'
      : 'Not a recognized BIP-352 silent-payment code (sp1…).';
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
          className="h-9 rounded-full border-0 bg-secondary pl-10 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Search countries, e.g. Venezuela"
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
            aria-label="Clear country"
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
          Publishes <span className="font-mono text-foreground">i: iso3166-1:{selectedCode}</span> for country sorting.
        </p>
      )}
    </div>
  );
}

export default CreateCampaignPage;
