import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Users,
  X,
} from 'lucide-react';

import { PersonSearch } from '@/components/AddMemberDialog';
import { CoverImageField } from '@/components/CoverImageField';
import { FormSection } from '@/components/FormSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import {
  BADGE_DEFINITION_KIND,
  COMMUNITY_DEFINITION_KIND,
} from '@/lib/communityUtils';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

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
 * Build a minimal SearchProfile shell when we only know a pubkey. PersonSearch
 * hands us full profiles, but anywhere we synthesize a pending moderator
 * row (e.g. the founder pinned at the top of the list) we need this stub.
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

export function CreateCommunityPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // Additional moderators on top of the founder, who is always the first
  // moderator and rendered separately so they can't be removed.
  const [moderators, setModerators] = useState<SearchProfile[]>([]);
  const [formError, setFormError] = useState('');

  const derivedSlug = useMemo(() => slugify(name), [name]);

  useSeoMeta({
    title: 'Create community | Agora',
    description: 'Start a new community on Agora.',
  });

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
      if (!user) throw new Error('You must be logged in to create a community.');

      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');

      const slug = derivedSlug;
      if (!slug) {
        throw new Error(
          'Name must include letters or numbers so a community URL can be created.',
        );
      }

      // The founder is always pubkey #0 in the moderator list — they
      // shouldn't end up in the extra-moderators array, but defensively
      // strip if they did.
      const extraModerators = moderators.filter(
        (m) => m.pubkey !== user.pubkey,
      );

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
        throw new Error(
          `You already have a community with the identifier "${slug}". Choose another name.`,
        );
      }

      // Same collision check for the implicitly-minted member badge.
      const badgeDTag = `${slug}-member`;
      const existingBadge = await nostr.query([
        {
          kinds: [BADGE_DEFINITION_KIND],
          authors: [user.pubkey],
          '#d': [badgeDTag],
          limit: 1,
        },
      ]);
      if (existingBadge.length > 0) {
        throw new Error(
          'You already have a member badge with this identifier. Choose a different community name so the badge can be created safely.',
        );
      }

      const sanitizedImage = imageUrl.trim()
        ? sanitizeUrl(imageUrl.trim())
        : undefined;

      // Mint the implicit "Member of <community>" badge (kind 30009).
      // Mirrors CreateCommunityDialog so existing badge-award flows on
      // CommunityDetailPage keep working.
      const badgeEvent: NostrEvent = await publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: '',
        tags: [
          ['d', badgeDTag],
          ['name', 'Member'],
          ['description', `Member of ${trimmedName}`],
          ['alt', `Badge definition: Member of ${trimmedName}`],
        ],
      });

      const badgeATag = `${BADGE_DEFINITION_KIND}:${badgeEvent.pubkey}:${badgeDTag}`;

      // Build the kind 34550 community-definition tag set.
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
      // Member badge reference (NIP-72 style: `a` tag with role "member").
      tags.push(['a', badgeATag, '', 'member']);
      // Founder is the first moderator.
      tags.push(['p', user.pubkey, '', 'moderator']);
      for (const mod of extraModerators) {
        tags.push(['p', mod.pubkey, '', 'moderator']);
      }
      tags.push(['alt', `Community: ${trimmedName}`]);

      const created = await publishEvent({
        kind: COMMUNITY_DEFINITION_KIND,
        content: '',
        tags,
      });

      return { event: created, slug };
    },
    onSuccess: async ({ event, slug }) => {
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
        queryKey: ['my-communities'],
        exact: false,
      });
      void queryClient.invalidateQueries({
        queryKey: ['community-activity-feed'],
        exact: false,
      });
      toast({ title: 'Community created!' });
      navigate(`/${naddr}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: 'Could not create community',
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
              <h2 className="text-xl font-semibold">Log in to start a community</h2>
              <p className="text-muted-foreground">
                Communities are signed Nostr events. You need a Nostr login to publish one.
              </p>
              <Button asChild>
                <Link to="/communities">Back to communities</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Founder is always rendered first and isn't removable; that mirrors
  // CreateCommunityDialog (founder is auto-added as the only moderator)
  // while making the role visible to the user.
  const founderProfile = makeProfileFromPubkey(user.pubkey);

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
              Create community
            </h1>
          </div>
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Name */}
          <FormSection title="Name" requirement="Required">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Arbiter's Guard"
              maxLength={100}
              required
            />
            <p className="text-xs text-muted-foreground">
              URL preview:{' '}
              <span className="font-mono text-foreground">
                /{derivedSlug || 'your-community-name'}
              </span>
            </p>
          </FormSection>

          {/* Description */}
          <FormSection title="Description" requirement="Recommended">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              rows={3}
            />
          </FormSection>

          {/* Cover image */}
          <FormSection title="Cover image" requirement="Recommended">
            <CoverImageField value={imageUrl} onChange={setImageUrl} />
          </FormSection>

          {/* Moderators */}
          <FormSection title="Moderators" requirement="Optional">
            <div className="space-y-3">
              <PersonSearch
                onAdd={addModerator}
                onAddMany={addModerators}
                // The founder is always a moderator and not eligible to be
                // added a second time. Past that, exclude anyone already
                // queued.
                excludePubkeys={[user.pubkey, ...moderators.map((m) => m.pubkey)]}
              />

              <Label className="text-xs text-muted-foreground">
                Moderators ({moderators.length + 1})
              </Label>
              <div className="space-y-1.5">
                <ModeratorRow profile={founderProfile} role="Founder" />
                {moderators.map((moderator) => (
                  <ModeratorRow
                    key={moderator.pubkey}
                    profile={moderator}
                    role="Moderator"
                    onRemove={() => removeModerator(moderator.pubkey)}
                  />
                ))}
              </div>
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
            disabled={submitMutation.isPending || !name.trim() || !derivedSlug}
            className="w-full"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Users className="size-4 mr-2" />
                Create community
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function ModeratorRow({
  profile,
  role,
  onRemove,
}: {
  profile: SearchProfile;
  role: 'Founder' | 'Moderator';
  /** Omit to render a non-removable row (e.g. the founder). */
  onRemove?: () => void;
}) {
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
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
        {onRemove && (
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
        )}
      </div>
    </div>
  );
}

export default CreateCommunityPage;
