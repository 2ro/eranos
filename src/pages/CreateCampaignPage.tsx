import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { Capacitor } from '@capacitor/core';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  HandHeart,
  Loader2,
  MapPin,
  MessageCircle,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';

import { PersonSearch } from '@/components/AddMemberDialog';
import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { OrganizationContextChip } from '@/components/OrganizationContextChip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { formatSats, satsToUSDWhole, usdToSats } from '@/lib/bitcoin';
import {
  CAMPAIGN_KIND,
  encodeCampaignNaddr,
  parseCampaign,
  slugifyCampaignIdentifier,
} from '@/lib/campaign';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import { getTodayDateInput } from '@/lib/dateInput';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { COUNTRIES, searchCountries, searchCountry, type CountryEntry } from '@/lib/countries';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { cn } from '@/lib/utils';

interface EditTarget {
  pubkey: string;
  identifier: string;
  relays?: string[];
}

/** Canonical origin used in shareable invite / notify links. */
function getShareOrigin(): string {
  return 'https://agora.spot';
}

/**
 * Copy text to clipboard with a uniform toast reaction. Returns true on
 * success so the caller can update transient UI state.
 */
async function copyShareText(
  text: string,
  toast: ReturnType<typeof useToast>['toast'],
  successTitle: string,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: successTitle, description: 'Paste it into a DM, email, or text message.' });
    return true;
  } catch {
    toast({
      title: 'Copy failed',
      description: 'Your browser blocked clipboard access. Select and copy the text manually.',
      variant: 'destructive',
    });
    return false;
  }
}

async function shareTextOrCopy(
  text: string,
  toast: ReturnType<typeof useToast>['toast'],
  fallbackSuccessTitle: string,
): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text });
      return;
    }

    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
  }

  await copyShareText(text, toast, fallbackSuccessTitle);
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
 * Decode the optional `?org=` query parameter. Accepts either an
 * `naddr1...` pointing at a kind 34550 community definition (canonical)
 * or a raw `34550:<pubkey>:<d-tag>` coordinate. Returns null when the
 * value is missing, malformed, or points at a non-community kind.
 *
 * The form only honors the resolved coordinate when the current user is
 * the founder or a moderator of that organization, so a stale link can't
 * silently mint an org-tagged event.
 */
function decodeOrgParam(value: string | null): { aTag: string } | null {
  if (!value) return null;

  const hexCoord = /^34550:[0-9a-f]{64}:.+$/i;
  if (hexCoord.test(value)) {
    return { aTag: value };
  }

  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'naddr' || decoded.data.kind !== 34550) return null;
    return {
      aTag: `34550:${decoded.data.pubkey}:${decoded.data.identifier}`,
    };
  } catch {
    return null;
  }
}

function makeRecipientProfile(pubkey: string): SearchProfile {
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

function makeRecipientProfileFromAuthor(
  pubkey: string,
  author: { event?: NostrEvent; metadata?: NostrMetadata } | undefined,
): SearchProfile {
  if (!author?.event) return makeRecipientProfile(pubkey);

  return {
    pubkey,
    metadata: author.metadata ?? {},
    event: author.event,
  };
}

function formatGoalUsd(goalSats: number | undefined, btcPrice: number | undefined): string {
  if (!goalSats || !btcPrice) return '';
  const usd = (goalSats / 100_000_000) * btcPrice;
  if (!Number.isFinite(usd) || usd <= 0) return '';
  return usd.toFixed(usd >= 100 ? 0 : 2);
}

function normalizeCampaignTag(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

function parseCampaignTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(',')) {
    const tag = normalizeCampaignTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function getExactCountryCode(query: string): string | undefined {
  const match = searchCountry(query);
  return match?.exact ? match.country.code : undefined;
}

function formatDateInput(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export function CreateCampaignPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const { btcPrice } = useBitcoinWallet();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [goalUsd, setGoalUsd] = useState('');
  const [goalTouched, setGoalTouched] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [recipients, setRecipients] = useState<SearchProfile[]>([]);
  const [organizationATag, setOrganizationATag] = useState('');
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);
  const [prepopulatedGoalEventId, setPrepopulatedGoalEventId] = useState<string | null>(null);

  const editNaddr = searchParams.get('edit');
  const editTarget = useMemo(() => getEditTarget(editNaddr), [editNaddr]);
  const isEditMode = !!editNaddr;

  // ── Organization context (implicit) ────────────────────────────────────
  // `?org=` carries the org coordinate from the entry point — typically
  // an org detail page CTA. We accept either an `naddr1...` (preferred,
  // canonical) or a raw `34550:<pubkey>:<d-tag>` coordinate. The form
  // never exposes a user-editable selector — the campaign is "under the
  // user" by default, and "under the org" when the user started from
  // inside that org's page.
  const orgParam = searchParams.get('org');
  const orgFromParam = useMemo(() => decodeOrgParam(orgParam), [orgParam]);
  const { data: manageableOrgs, isLoading: manageableOrgsLoading } = useManageableOrganizations();

  // The org we'll actually attach to the published event. We only honor
  // the param when the current user is the founder or a moderator of
  // that org — otherwise drop it silently so a stale link can't forge
  // an org association.
  const authorizedOrgFromParam = useMemo(() => {
    if (!orgFromParam || !manageableOrgs) return null;
    return manageableOrgs.find((entry) => entry.community.aTag === orgFromParam.aTag) ?? null;
  }, [orgFromParam, manageableOrgs]);

  useEffect(() => {
    if (isEditMode) return;
    setOrganizationATag(authorizedOrgFromParam?.community.aTag ?? '');
  }, [isEditMode, authorizedOrgFromParam]);

  const editCampaignQuery = useCampaign({
    pubkey: editTarget?.pubkey ?? '',
    identifier: editTarget?.identifier ?? '',
    ...(editTarget?.relays ? { relays: editTarget.relays } : {}),
  });
  const editCampaign = isEditMode ? editCampaignQuery.data : null;
  const editRecipientPubkeys = useMemo(
    () => editCampaign?.recipients.map((recipient) => recipient.pubkey) ?? [],
    [editCampaign],
  );
  const editRecipientProfiles = useQuery({
    queryKey: ['campaign-edit-recipients', editRecipientPubkeys],
    queryFn: async ({ signal }): Promise<SearchProfile[]> => {
      const cachedProfiles = new Map<string, SearchProfile>();
      const missingPubkeys: string[] = [];

      for (const pubkey of editRecipientPubkeys) {
        const cachedAuthor = queryClient.getQueryData<{ event?: NostrEvent; metadata?: NostrMetadata }>([
          'author',
          pubkey,
        ]);

        if (cachedAuthor?.event) {
          cachedProfiles.set(pubkey, makeRecipientProfileFromAuthor(pubkey, cachedAuthor));
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
          cachedProfiles.set(pubkey, makeRecipientProfileFromAuthor(pubkey, parsed));
        }
      }

      return editRecipientPubkeys.map((pubkey) => cachedProfiles.get(pubkey) ?? makeRecipientProfile(pubkey));
    },
    enabled: isEditMode && editRecipientPubkeys.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // The slug is protocol plumbing: derive it from the title instead of asking
  // fundraisers to understand Nostr d-tags.
  const derivedIdentifier = useMemo(() => slugifyCampaignIdentifier(title), [title]);
  const activeIdentifier = editCampaign?.identifier ?? derivedIdentifier;
  const goalSatsPreview = useMemo(() => {
    const n = Number(goalUsd.replace(/[, $]/g, ''));
    return usdToSats(n, btcPrice);
  }, [btcPrice, goalUsd]);
  const minDeadline = useMemo(() => getTodayDateInput(), []);

  useSeoMeta({
    title: isEditMode ? 'Edit campaign | Agora' : 'Start a campaign | Agora',
    description: isEditMode ? 'Update your fundraising campaign on Agora.' : 'Launch a fundraising campaign on Agora.',
  });

  useEffect(() => {
    if (!editCampaign || prepopulatedEventId === editCampaign.event.id) return;

    setTitle(editCampaign.title);
    setSummary(editCampaign.summary);
    setStory(editCampaign.story);
    setImageUrl(editCampaign.image ?? '');
    setTagInput(editCampaign.tags.join(', '));
    setDeadline(formatDateInput(editCampaign.deadline));
    const editCountryCode = editCampaign.countryCode ?? getExactCountryCode(editCampaign.location ?? '') ?? '';
    setCountryCode(editCountryCode);
    setCountryQuery(editCountryCode ? COUNTRIES[editCountryCode]?.name ?? editCountryCode : '');
    setRecipients(editCampaign.recipients.map((recipient) => makeRecipientProfile(recipient.pubkey)));
    // Restore the organization root-scope tag (uppercase `A`) so the
    // selector hydrates with the same org the campaign was originally
    // attached to. We accept the tag as-is; the publish branch verifies
    // the current user is still authorized to publish under that org.
    const existingOrgATag = editCampaign.event.tags.find(
      ([n, v]) => n === 'A' && typeof v === 'string' && v.startsWith('34550:'),
    )?.[1] ?? '';
    setOrganizationATag(existingOrgATag);
    setPrepopulatedEventId(editCampaign.event.id);
  }, [editCampaign, prepopulatedEventId]);

  useEffect(() => {
    const profiles = editRecipientProfiles.data;
    if (!profiles || profiles.length === 0) return;

    setRecipients((prev) => prev.map((recipient) => {
      const profile = profiles.find((item) => item.pubkey === recipient.pubkey);
      return profile ?? recipient;
    }));
  }, [editRecipientProfiles.data]);

  useEffect(() => {
    if (!editCampaign || prepopulatedGoalEventId === editCampaign.event.id || goalUsd.trim()) return;

    const formattedGoal = formatGoalUsd(editCampaign.goalSats, btcPrice);
    if (!formattedGoal) return;

    setGoalUsd(formattedGoal);
    setPrepopulatedGoalEventId(editCampaign.event.id);
  }, [btcPrice, editCampaign, goalUsd, prepopulatedGoalEventId]);

  const addRecipient = (profile: SearchProfile) => {
    setRecipients((prev) => prev.some((r) => r.pubkey === profile.pubkey) ? prev : [...prev, profile]);
  };

  const addRecipients = (profiles: SearchProfile[]) => {
    setRecipients((prev) => {
      const seen = new Set(prev.map((r) => r.pubkey));
      const next = [...prev];
      for (const profile of profiles) {
        if (seen.has(profile.pubkey)) continue;
        seen.add(profile.pubkey);
        next.push(profile);
      }
      return next;
    });
  };

  const removeRecipient = (pubkey: string) => {
    setRecipients((prev) => prev.filter((r) => r.pubkey !== pubkey));
  };

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

      // Validate recipients.
      const parsedRecipients: { pubkey: string }[] = [];
      const seen = new Set<string>();
      for (const r of recipients) {
        const pubkey = r.pubkey;
        if (seen.has(pubkey)) continue;
        seen.add(pubkey);
        parsedRecipients.push({ pubkey });
      }

      if (parsedRecipients.length === 0) {
        throw new Error('Add at least one recipient.');
      }

      // Goal / deadline.
      // In edit mode, preserve the exact stored sats unless the user changed the field.
      let goalNum: number | undefined;
      if (isEditMode && !goalTouched) {
        goalNum = editCampaign?.goalSats;
      } else if (goalUsd.trim()) {
        const n = Number(goalUsd.replace(/[, $]/g, ''));
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Goal must be a positive USD amount.');
        }
        goalNum = usdToSats(n, btcPrice);
        if (goalNum <= 0) {
          throw new Error('Bitcoin price is unavailable. Try again before setting a USD goal.');
        }
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

      const resolvedCountryCode = countryCode || getExactCountryCode(countryQuery);
      const campaignTags = parseCampaignTagInput(tagInput);

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

      // Validate image URL (must be https).
      const trimmedImageUrl = imageUrl.trim();
      const sanitizedImage = trimmedImageUrl ? sanitizeUrl(trimmedImageUrl) : undefined;
      if (trimmedImageUrl && !sanitizedImage) {
        throw new Error('Cover image must be a valid https:// URL.');
      }

      const tags: string[][] = [
        ['d', slug],
        ['title', trimmedTitle],
        ['alt', `Fundraising campaign: ${trimmedTitle}`],
      ];
      if (summary.trim()) tags.splice(2, 0, ['summary', summary.trim()]);
      for (const tag of campaignTags) tags.push(['t', tag]);
      if (sanitizedImage) tags.push(['image', sanitizedImage]);
      if (goalNum !== undefined) tags.push(['goal', String(goalNum)]);
      if (deadlineNum !== undefined) tags.push(['deadline', String(deadlineNum)]);
      if (resolvedCountryCode) {
        tags.push(['i', createCountryIdentifier(resolvedCountryCode)]);
        tags.push(['k', 'iso3166']);
      }
      // Organization association (NIP-22 root-scope convention): an
      // uppercase `A` tag points at the NIP-72 community definition so
      // the campaign surfaces as official activity on that org's page.
      // The `K` companion tag records the referenced kind, and `P` hints
      // at the org founder for clients that batch-resolve authors.
      if (organizationATag) {
        const orgAuthor = organizationATag.split(':')[1];
        tags.push(['A', organizationATag]);
        tags.push(['K', String(COMMUNITY_DEFINITION_KIND)]);
        if (orgAuthor) tags.push(['P', orgAuthor]);
      }
      for (const r of parsedRecipients) {
        tags.push(['p', r.pubkey]);
      }

      const published = await publishEvent({
        kind: CAMPAIGN_KIND,
        content: story,
        tags,
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
            aTag={organizationATag}
            authorizedOrg={authorizedOrgFromParam}
            param={orgParam}
            paramDecoded={orgFromParam}
            manageableLoading={manageableOrgsLoading}
            isEditMode={isEditMode}
          />
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Title & identifier */}
          <FormSection title="Title" requirement="Required">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Save the Last Bookstore"
              maxLength={200}
              required
            />
            <p className="text-xs text-muted-foreground flex items-baseline gap-1 min-w-0">
              <span className="shrink-0">URL preview:</span>
              <span className="font-mono text-foreground truncate min-w-0">
                /{activeIdentifier || 'your-campaign-title'}{!isEditMode && derivedIdentifier.length >= 64 && '...'}
              </span>
              {isEditMode && <span className="shrink-0">(kept from original)</span>}
            </p>
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
              id="campaign-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="human rights, legal defense, independent media"
            />
          </FormSection>

          {/* Recipients */}
          <FormSection
            title="Beneficiaries"
            requirement="Required"
          >
            <div className="space-y-3">
              <PersonSearch
                onAdd={addRecipient}
                onAddMany={addRecipients}
                excludePubkeys={recipients.map((r) => r.pubkey)}
              />

              {/* "Recipient not here yet?" invite affordance. Always visible
                  because even campaigns with existing recipients may have one
                  beneficiary who's still off-Nostr. */}
              <button
                type="button"
                onClick={() => {
                  const url = `${getShareOrigin()}/receive`;
                  const message = `I want to create a fundraiser for you on Agora! Sign up to create your account and start receiving donations directly to your Bitcoin wallet: ${url}`;
                  void shareTextOrCopy(message, toast, 'Invite copied');
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 motion-safe:transition-colors"
              >
                <UserPlus className="size-4" />
                Recipient not here yet? Invite them
                <Share2 className="size-3.5 opacity-70" />
              </button>

              {recipients.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Beneficiaries ({recipients.length})
                  </Label>
                  <div className="space-y-1.5">
                    {recipients.map((recipient) => (
                      <RecipientRow
                        key={recipient.pubkey}
                        profile={recipient}
                        campaignTitle={title}
                        onRemove={() => removeRecipient(recipient.pubkey)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* Cover image */}
          <FormSection title="Cover image" requirement="Optional">
            <CoverImageField
              value={imageUrl}
              onChange={setImageUrl}
              onUploadingChange={setCoverUploading}
            />
          </FormSection>

          {/* Summary */}
          <FormSection title="Summary" requirement="Optional">
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
            {/* Goal */}
            <FormSection title="Goal" requirement="Optional">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="campaign-goal"
                  type="text"
                  inputMode="decimal"
                  placeholder="100,000"
                  value={goalUsd}
                  onChange={(e) => {
                    setGoalUsd(e.target.value);
                    setGoalTouched(true);
                  }}
                  className="pl-7 pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  USD
                </span>
              </div>
              {isEditMode && editCampaign?.goalSats && !goalTouched && (
                <p className="text-xs text-muted-foreground">
                  Current saved goal: {formatSats(editCampaign.goalSats)} sats
                  {btcPrice
                    ? <> &mdash; about {satsToUSDWhole(editCampaign.goalSats, btcPrice)} today</>
                    : null
                  }. Only edit this field if you want to change the goal.
                </p>
              )}
              {(!isEditMode || goalTouched) && goalSatsPreview > 0 && btcPrice && (
                <p className="text-xs text-muted-foreground">
                  Your goal will be saved as {formatSats(goalSatsPreview)} sats &mdash; about{' '}
                  {satsToUSDWhole(goalSatsPreview, btcPrice)} today.
                  The dollar estimate may change with Bitcoin's price.
                </p>
              )}
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
                Uploading cover…
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
          Publishes <span className="font-mono text-foreground">i: iso3166:{selectedCode}</span> for country sorting.
        </p>
      )}
    </div>
  );
}

function RecipientRow({
  profile,
  campaignTitle,
  onRemove,
}: {
  profile: SearchProfile;
  campaignTitle: string;
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const displayName = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
  const picture = sanitizeUrl(profile.metadata.picture);

  const handleNotify = () => {
    const url = `${getShareOrigin()}/claim`;
    const titleClause = campaignTitle.trim() ? ` called "${campaignTitle.trim()}"` : '';
    const message = `I just started a fundraiser for you on Agora${titleClause}! Sign in here for more info and to claim your donations: ${url}`;
    void shareTextOrCopy(message, toast, `Message for ${displayName} copied`);
  };

  return (
    <div className="rounded-lg bg-secondary/30 p-2.5">
      <div className="flex items-center gap-3">
        <Avatar className="size-8 shrink-0">
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback className="text-xs">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleNotify}
          className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="size-3.5" />
          Notify
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${displayName}`}
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default CreateCampaignPage;
