import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
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
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
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
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

export function CreateCampaignPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const { btcPrice } = useBitcoinWallet();
  const navigate = useNavigate();
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

  // The slug is protocol plumbing: derive it from the title instead of asking
  // fundraisers to understand Nostr d-tags.
  const derivedIdentifier = useMemo(() => slugifyCampaignIdentifier(title), [title]);
  const goalSatsPreview = useMemo(() => {
    const n = Number(goalUsd.replace(/[, $]/g, ''));
    return usdToSats(n, btcPrice);
  }, [btcPrice, goalUsd]);

  useSeoMeta({
    title: 'Start a campaign | Agora',
    description: 'Launch a fundraising campaign on Agora.',
  });

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
      const trimmedTitle = title.trim();
      const slug = derivedIdentifier;

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
      });

      const parsed = parseCampaign(published);
      if (!parsed) {
        throw new Error('Published event failed validation. Please refresh and try again.');
      }
      return parsed;
    },
    onSuccess: (campaign) => {
      toast({ title: 'Campaign launched', description: 'Your fundraiser is live.' });
      navigate(`/${encodeCampaignNaddr(campaign)}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({ title: 'Could not publish campaign', description: msg, variant: 'destructive' });
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

  return (
    <main className="min-h-screen pb-16">
      <form
        className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-8"
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Start a campaign</h1>
          </div>
          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground">
            Add the essentials first. You can expand Details when you are ready to add a pitch,
            category, goal, timeline, or location.
          </p>
        </div>

        {/* Title & identifier */}
        <FormSection title="Title" requirement="Required" description="What are you raising money for? The campaign URL is created from this title automatically.">
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
              /{derivedIdentifier || 'your-campaign-title'}
            </span>
          </p>
        </FormSection>

        {/* Recipients */}
        <FormSection
          title="Beneficiaries"
          requirement="Required"
          description="One or more Nostr accounts that receive split-payment donations. Donations are split evenly across everyone in the campaign."
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
                <div className="space-y-2">
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
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Search for people by name, NIP-05, npub, or nprofile to add beneficiaries.
              </p>
            )}
          </div>
        </FormSection>

        {/* Cover image */}
        <FormSection title="Cover image" requirement="Optional" description="Choose a hero image for your campaign card.">
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
          description="Add more context for donors when you have it."
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-summary">Summary</Label>
              <Textarea
                id="campaign-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="A short one-paragraph pitch shown in cards and previews."
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
                    ? `Publishes as ${formatSats(goalSatsPreview)} sats (${satsToUSD(goalSatsPreview, btcPrice)} at current BTC price).`
                    : 'Stored on Nostr as sats using the current BTC/USD price.'}
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

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 justify-end pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Publishing…
              </>
            ) : (
              <>
                <HandHeart className="size-4 mr-2" />
                Launch campaign
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
    <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
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
      <div className="space-y-3">{children}</div>
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
    <Collapsible className="rounded-2xl border border-border/70 bg-card shadow-sm" defaultOpen={false}>
      <CollapsibleTrigger
        type="button"
        className="group flex w-full items-start justify-between gap-4 p-4 text-left sm:p-5"
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
      <CollapsibleContent className="px-4 pb-4 sm:px-5 sm:pb-5">
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
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-secondary/30 p-2">
      <Avatar className="size-8 shrink-0">
        {picture && <AvatarImage src={picture} alt="" />}
        <AvatarFallback className="text-xs">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{displayName}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {profile.pubkey.slice(0, 12)}…{profile.pubkey.slice(-8)}
        </div>
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
