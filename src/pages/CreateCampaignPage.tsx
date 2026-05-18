import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  HandHeart,
  ImagePlus,
  Loader2,
  X,
} from 'lucide-react';

import { PersonSearch } from '@/components/AddMemberDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCampaign } from '@/hooks/useCampaign';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { formatSats, satsToUSD, usdToSats } from '@/lib/bitcoin';
import {
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_CATEGORY_LABELS,
  CAMPAIGN_KIND,
  encodeCampaignNaddr,
  parseCampaign,
  type CampaignCategory,
  slugifyCampaignIdentifier,
} from '@/lib/campaign';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
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
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState<CampaignCategory>('human-rights');
  const [goalUsd, setGoalUsd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [recipients, setRecipients] = useState<SearchProfile[]>([]);
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);
  const [prepopulatedGoalEventId, setPrepopulatedGoalEventId] = useState<string | null>(null);

  const editNaddr = searchParams.get('edit');
  const editTarget = useMemo(() => getEditTarget(editNaddr), [editNaddr]);
  const isEditMode = !!editNaddr;
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
    setCategory(editCampaign.category ?? 'human-rights');
    setDeadline(formatDateInput(editCampaign.deadline));
    setLocation(editCampaign.location ?? '');
    setRecipients(editCampaign.recipients.map((recipient) => makeRecipientProfile(recipient.pubkey)));
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

  const handleImagePick = async (file: File) => {
    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (!url) throw new Error('Upload returned no URL');
      setImageUrl(url);
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

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
      let goalNum: number | undefined;
      if (goalUsd.trim()) {
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
        const ts = Math.floor(new Date(deadline).getTime() / 1000);
        if (!Number.isFinite(ts) || ts <= 0) {
          throw new Error('Deadline is not a valid date.');
        }
        deadlineNum = ts;
      }

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
      const sanitizedImage = imageUrl.trim() ? sanitizeUrl(imageUrl.trim()) : undefined;

      const tags: string[][] = [
        ['d', slug],
        ['title', trimmedTitle],
        ['t', category],
        ['alt', `Fundraising campaign: ${trimmedTitle}`],
      ];
      if (summary.trim()) tags.splice(2, 0, ['summary', summary.trim()]);
      if (sanitizedImage) tags.push(['image', sanitizedImage]);
      if (goalNum !== undefined) tags.push(['goal', String(goalNum)]);
      if (deadlineNum !== undefined) tags.push(['deadline', String(deadlineNum)]);
      if (location.trim()) tags.push(['location', location.trim()]);
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
        <div className="space-y-3">
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
          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
            {isEditMode
              ? 'Update the essentials. Details are optional.'
              : 'Add title and beneficiaries first. Details are optional.'}
          </p>
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Title & identifier */}
          <FormSection title="Title" requirement="Required" description="Campaign URL is created automatically.">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Save the Last Bookstore"
              maxLength={200}
              required
            />
            <p className="text-xs text-muted-foreground">
              URL preview:{' '}
              <span className="font-mono text-foreground">
                /{activeIdentifier || 'your-campaign-title'}
              </span>
              {isEditMode && ' (kept from original)'}
            </p>
          </FormSection>

          {/* Recipients */}
          <FormSection
            title="Beneficiaries"
            requirement="Required"
            description="Who receives donations. Splits are even."
          >
            <div className="space-y-3">
              <PersonSearch
                onAdd={addRecipient}
                onAddMany={addRecipients}
                excludePubkeys={recipients.map((r) => r.pubkey)}
              />
              {recipients.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Beneficiaries ({recipients.length})
                  </Label>
                  <div className="space-y-1.5">
                    {recipients.map((recipient) => (
                      <RecipientRow
                        key={recipient.pubkey}
                        profile={recipient}
                        onRemove={() => removeRecipient(recipient.pubkey)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                  Search by name, NIP-05, npub, or nprofile.
                </p>
              )}
            </div>
          </FormSection>

          {/* Cover image */}
          <FormSection title="Cover image" requirement="Optional" description="Shown on campaign cards.">
            <CoverPicker
              url={imageUrl}
              isUploading={isUploading}
              onPick={handleImagePick}
              onClear={() => setImageUrl('')}
            />
            <Input
              type="url"
              inputMode="url"
              placeholder="Or paste an https:// image URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </FormSection>

          {/* Optional details */}
          <CollapsibleFormSection
            title="Details"
            requirement="Optional"
            description="Extra context for donors."
          >
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-summary">Summary</Label>
                <Textarea
                  id="campaign-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="A short pitch for cards and previews."
                  rows={2}
                  maxLength={300}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="campaign-story">Story</Label>
                <Textarea
                  id="campaign-story"
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="Tell donors why this matters. Markdown is supported."
                  rows={7}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-category">Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as CampaignCategory)}
                  >
                    <SelectTrigger id="campaign-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CAMPAIGN_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-goal">Goal (USD)</Label>
                  <Input
                    id="campaign-goal"
                    type="text"
                    inputMode="decimal"
                    placeholder="100,000"
                    value={goalUsd}
                    onChange={(e) => setGoalUsd(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {goalSatsPreview > 0 && btcPrice
                      ? `${formatSats(goalSatsPreview)} sats (${satsToUSD(goalSatsPreview, btcPrice)}).`
                      : 'Stored as sats.'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-deadline">Deadline (optional)</Label>
                  <Input
                    id="campaign-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-location">Location (optional)</Label>
                  <Input
                    id="campaign-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Portland, OR"
                  />
                </div>
              </div>
            </div>
          </CollapsibleFormSection>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="outline" onClick={() => isEditMode ? navigate(-1) : navigate('/')}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {isEditMode ? 'Updating…' : 'Publishing…'}
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

function FormSection({
  title,
  requirement,
  description,
  children,
}: {
  title: string;
  requirement: 'Required' | 'Optional';
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-xl p-3 sm:p-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              requirement === 'Required'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {requirement}
          </span>
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function CollapsibleFormSection({
  title,
  requirement,
  description,
  children,
}: {
  title: string;
  requirement: 'Required' | 'Optional';
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible className="rounded-xl" defaultOpen={false}>
      <CollapsibleTrigger
        type="button"
        className="group flex w-full items-start justify-between gap-4 p-3 text-left sm:p-4"
      >
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {title}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                requirement === 'Required'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {requirement}
            </span>
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground motion-safe:transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CoverPicker({
  url,
  isUploading,
  onPick,
  onClear,
}: {
  url: string;
  isUploading: boolean;
  onPick: (file: File) => void | Promise<void>;
  onClear: () => void;
}) {
  const sanitized = sanitizeUrl(url);
  return (
    <label
      className={cn(
        'relative block h-40 w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-border bg-gradient-to-br from-muted/40 via-background to-muted/20 motion-safe:transition-colors hover:border-primary sm:h-48',
        isUploading && 'opacity-70 pointer-events-none',
      )}
    >
      {sanitized ? (
        <>
          <img src={sanitized} alt="" className="absolute inset-0 size-full object-cover" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
            className="absolute top-3 right-3 rounded-full bg-background/85 backdrop-blur p-1.5 hover:bg-background motion-safe:transition-colors"
            aria-label="Remove image"
          >
            <X className="size-4" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          {isUploading ? (
            <>
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">Uploading…</span>
            </>
          ) : (
            <>
              <ImagePlus className="size-8" />
              <span className="text-sm">Click to upload a cover image</span>
              <span className="text-xs">PNG, JPG, or WEBP</span>
            </>
          )}
        </div>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );
}

function RecipientRow({ profile, onRemove }: { profile: SearchProfile; onRemove: () => void }) {
  const displayName = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
  const picture = sanitizeUrl(profile.metadata.picture);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-secondary/30 p-2.5">
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
        size="icon"
        onClick={onRemove}
        aria-label={`Remove ${displayName}`}
        className="shrink-0"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

export default CreateCampaignPage;
