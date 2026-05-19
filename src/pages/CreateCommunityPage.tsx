import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
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
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { SearchProfile } from '@/hooks/useSearchProfiles';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import {
  BADGE_DEFINITION_KIND,
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
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
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

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
  // Additional moderators on top of the founder. The founder is implicit —
  // they're always pubkey #0 in the published moderator list and are not
  // rendered as a chip here.
  const [moderators, setModerators] = useState<SearchProfile[]>([]);
  const [formError, setFormError] = useState('');
  const [prepopulatedEventId, setPrepopulatedEventId] = useState<string | null>(null);

  // Fetch the existing community when editing.
  const editCommunityQuery = useQuery({
    queryKey: ['community', editTarget?.pubkey ?? '', editTarget?.identifier ?? ''],
    queryFn: async ({ signal }): Promise<{ event: NostrEvent; community: ParsedCommunity } | null> => {
      if (!editTarget) return null;
      const events = await nostr.query(
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
        const cachedAuthor = queryClient.getQueryData<{ event?: NostrEvent; metadata?: NostrMetadata }>([
          'author',
          pubkey,
        ]);
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
    title: isEditMode ? 'Edit community | Agora' : 'Create community | Agora',
    description: isEditMode
      ? 'Update your community on Agora.'
      : 'Start a new community on Agora.',
  });

  // Prefill the form when the community loads.
  useEffect(() => {
    if (!editCommunity || prepopulatedEventId === editCommunity.event.id) return;
    setName(editCommunity.community.name);
    setDescription(editCommunity.community.description);
    setImageUrl(editCommunity.community.image ?? '');
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

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create a community.');
      if (isEditMode && !editCommunity) {
        throw new Error('Community could not be loaded for editing.');
      }
      if (editCommunity && editCommunity.event.pubkey !== user.pubkey) {
        throw new Error('Only the community founder can edit this community.');
      }

      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');

      const slug = activeSlug;
      if (!slug) {
        throw new Error(
          'Name must include letters or numbers so a community URL can be created.',
        );
      }

      // Founder is always implicit and shouldn't be in the extra-moderators
      // array, but defensively strip if a stale stub snuck in.
      const extraModerators = moderators.filter((m) => m.pubkey !== user.pubkey);

      const sanitizedImage = imageUrl.trim()
        ? sanitizeUrl(imageUrl.trim())
        : undefined;

      // ── Edit branch ────────────────────────────────────────────────────
      if (isEditMode && editCommunity) {
        const prev = await fetchFreshEvent(nostr, {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [user.pubkey],
          '#d': [slug],
        });
        if (!prev || !parseCommunityEvent(prev)) {
          throw new Error('Could not find the latest version of this community to update.');
        }

        // Strip the tag names we're going to rewrite; preserve everything
        // else (the `a` member-badge tag, any `relay` hints, …).
        const preserved = prev.tags.filter(
          ([n, , , role]) =>
            !['d', 'name', 'description', 'image', 'alt'].includes(n) &&
            !(n === 'p' && role === 'moderator'),
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
        nextTags.push(['p', user.pubkey, '', 'moderator']);
        for (const mod of extraModerators) {
          nextTags.push(['p', mod.pubkey, '', 'moderator']);
        }
        nextTags.push(...preserved);
        nextTags.push(['alt', `Community: ${trimmedName}`]);

        const updated = await publishEvent({
          kind: COMMUNITY_DEFINITION_KIND,
          content: prev.content,
          tags: nextTags,
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

      // Mint the implicit "Member of <community>" badge (kind 30009).
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
      tags.push(['a', badgeATag, '', 'member']);
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
      toast({ title: edited ? 'Community updated!' : 'Community created!' });
      navigate(`/${naddr}`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: isEditMode ? 'Could not update community' : 'Could not create community',
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

  if (isEditMode && !editTarget) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <AlertTriangle className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Invalid edit link</h2>
              <p className="text-muted-foreground">
                This community edit link is missing a valid community address.
              </p>
              <Button type="button" onClick={() => navigate('/communities/new')}>
                Start a new community
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
              <p className="text-sm text-muted-foreground">Loading community…</p>
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
              <AlertTriangle className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Community cannot be edited</h2>
              <p className="text-muted-foreground">
                Only the founder of this community can update it.
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
              {isEditMode ? 'Edit community' : 'Create community'}
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
                /{activeSlug || 'your-community-name'}
              </span>
              {isEditMode && ' (kept from original)'}
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
                // Hide the founder and anyone already queued from search
                // results so they can't be added twice. The founder isn't
                // shown as a chip — they're always implicit.
                excludePubkeys={[user.pubkey, ...moderators.map((m) => m.pubkey)]}
              />

              {moderators.length > 0 && (
                <>
                  <Label className="text-xs text-muted-foreground">
                    Moderators ({moderators.length})
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
            disabled={submitMutation.isPending || !name.trim() || !activeSlug}
            className="w-full"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {isEditMode ? 'Updating…' : 'Creating…'}
              </>
            ) : (
              <>
                <Users className="size-4 mr-2" />
                {isEditMode ? 'Update community' : 'Create community'}
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
  onRemove,
}: {
  profile: SearchProfile;
  onRemove: () => void;
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
    </div>
  );
}

export default CreateCommunityPage;
