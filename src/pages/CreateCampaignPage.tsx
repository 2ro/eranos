import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  ArrowLeft,
  HandHeart,
  ImagePlus,
  Loader2,
  PlusCircle,
  X,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useLayoutOptions } from '@/contexts/LayoutContext';
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

/** A pending recipient row in the form (before validation). */
interface RecipientDraft {
  /** Hex pubkey or npub1… entered by the user. */
  input: string;
  /** Optional weight string (parsed at submit time). */
  weight: string;
}

const HEX_64_RE = /^[0-9a-f]{64}$/;

function decodePubkey(input: string): string | null {
  const trimmed = input.trim();
  if (HEX_64_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('npub1') || trimmed.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      return null;
    }
  }
  return null;
}

export function CreateCampaignPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey ?? '');
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [summary, setSummary] = useState('');
  const [story, setStory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState<CampaignCategory>('community');
  const [goalSats, setGoalSats] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [recipients, setRecipients] = useState<RecipientDraft[]>([{ input: '', weight: '' }]);
  const [formError, setFormError] = useState('');

  // Auto-derive the slug from the title until the user manually edits it.
  const derivedIdentifier = useMemo(() => slugifyCampaignIdentifier(title), [title]);
  const effectiveIdentifier = identifierTouched ? identifier : derivedIdentifier;

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

  const setRecipientField = (index: number, patch: Partial<RecipientDraft>) => {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRecipient = () => {
    setRecipients((prev) => [...prev, { input: '', weight: '' }]);
  };

  const removeRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create a campaign.');
      const trimmedTitle = title.trim();
      const slug = effectiveIdentifier.trim();

      if (!trimmedTitle) throw new Error('Title is required.');
      if (!slug) throw new Error('Identifier is required.');
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
        throw new Error('Identifier must be lowercase letters, numbers, and hyphens.');
      }

      // Validate recipients.
      const parsedRecipients: { pubkey: string; weight: number }[] = [];
      const seen = new Set<string>();
      for (const r of recipients) {
        if (!r.input.trim()) continue;
        const pubkey = decodePubkey(r.input);
        if (!pubkey) {
          throw new Error(`Invalid recipient: "${r.input.trim()}". Use an npub or hex pubkey.`);
        }
        if (seen.has(pubkey)) continue;
        seen.add(pubkey);

        let weight = 1;
        if (r.weight.trim()) {
          const parsed = Number(r.weight);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error(`Recipient weight must be a positive number.`);
          }
          weight = parsed;
        }
        parsedRecipients.push({ pubkey, weight });
      }

      if (parsedRecipients.length === 0) {
        throw new Error('Add at least one recipient.');
      }

      // Goal / deadline.
      let goalNum: number | undefined;
      if (goalSats.trim()) {
        const n = Number(goalSats.replace(/[, ]/g, ''));
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
          throw new Error('Goal must be a positive integer in sats.');
        }
        goalNum = n;
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
        const pTag: string[] = ['p', r.pubkey];
        if (r.weight !== 1) {
          // Relay hint kept empty so the weight lands at the 4th element per spec.
          pTag.push('');
          pTag.push(String(r.weight));
        }
        tags.push(pTag);
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

  const creatorMetadata = author.data?.metadata;
  const creatorName =
    creatorMetadata?.display_name || creatorMetadata?.name || genUserName(user.pubkey);
  const creatorPicture = sanitizeUrl(creatorMetadata?.picture);

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
        {/* Organizer banner */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Avatar className="size-8">
            {creatorPicture && <AvatarImage src={creatorPicture} alt="" />}
            <AvatarFallback>{creatorName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span>
            Publishing as <span className="font-medium text-foreground">{creatorName}</span>
          </span>
        </div>

        {/* Cover image */}
        <FormSection title="Cover image" description="Choose a hero image for your campaign card.">
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

        {/* Title & identifier */}
        <FormSection title="Title" description="What are you raising money for?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Save the Last Bookstore"
            maxLength={200}
            required
          />
          <div className="space-y-1.5">
            <Label htmlFor="campaign-identifier" className="text-xs text-muted-foreground">
              Identifier (URL slug)
            </Label>
            <Input
              id="campaign-identifier"
              value={effectiveIdentifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setIdentifierTouched(true);
              }}
              placeholder="save-the-last-bookstore"
              pattern="^[a-z0-9][a-z0-9-]{0,63}$"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. Used in the campaign's permanent address.
            </p>
          </div>
        </FormSection>

        {/* Summary */}
        <FormSection
          title="Summary"
          description="A short one-paragraph pitch shown in cards and previews."
        >
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Help our 40-year-old bookstore make rent through winter."
            rows={2}
            maxLength={300}
          />
        </FormSection>

        {/* Story */}
        <FormSection
          title="Story"
          description="Tell donors why this matters. Markdown is supported."
        >
          <Textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Write your campaign story here. You can use Markdown for headings, lists, and emphasis."
            rows={10}
            className="font-mono text-sm"
          />
        </FormSection>

        {/* Category + goal + deadline + location */}
        <FormSection title="Details" description="A few more facts about your campaign.">
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
              <Label htmlFor="campaign-goal">Goal (sats, optional)</Label>
              <Input
                id="campaign-goal"
                type="text"
                inputMode="numeric"
                placeholder="10000000"
                value={goalSats}
                onChange={(e) => setGoalSats(e.target.value)}
              />
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
        </FormSection>

        {/* Recipients */}
        <FormSection
          title="Beneficiaries"
          description="One or more Nostr accounts that receive split-payment donations. Equal split by default; set a weight to adjust the share."
        >
          <div className="space-y-3">
            {recipients.map((r, i) => (
              <RecipientField
                key={i}
                value={r}
                onChange={(patch) => setRecipientField(i, patch)}
                onRemove={recipients.length > 1 ? () => removeRecipient(i) : undefined}
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRecipient}>
              <PlusCircle className="size-4 mr-2" />
              Add another beneficiary
            </Button>
          </div>
        </FormSection>

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
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
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
        'relative block aspect-[16/9] w-full rounded-xl border-2 border-dashed border-border cursor-pointer overflow-hidden bg-gradient-to-br from-muted/40 via-background to-muted/20 motion-safe:transition-colors hover:border-primary',
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

function RecipientField({
  value,
  onChange,
  onRemove,
}: {
  value: RecipientDraft;
  onChange: (patch: Partial<RecipientDraft>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
      <Input
        className="flex-1 font-mono text-sm"
        placeholder="npub1… or 64-char hex pubkey"
        value={value.input}
        onChange={(e) => onChange({ input: e.target.value })}
      />
      <Input
        type="text"
        inputMode="decimal"
        placeholder="weight"
        value={value.weight}
        onChange={(e) => onChange({ weight: e.target.value })}
        className="w-full sm:w-24"
      />
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Remove recipient"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

export default CreateCampaignPage;
