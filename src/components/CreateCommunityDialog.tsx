import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Loader2 } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageUploadField } from '@/components/ImageUploadField';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { COMMUNITY_DEFINITION_KIND, type ParsedCommunity } from '@/lib/communityUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert text into a URL-safe slug for the d-tag identifier. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateCommunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing community event when editing. Omit to create a new community. */
  communityEvent?: NostrEvent;
  /** Parsed existing community data when editing. */
  community?: ParsedCommunity;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateCommunityDialog({ open, onOpenChange, communityEvent, community }: CreateCommunityDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!communityEvent && !!community;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);

  // Mutations
  const { mutateAsync: publishEvent } = useNostrPublish();

  // Derived
  const effectiveSlug = isEditing && community ? community.dTag : slugify(name);

  const populateFromCommunity = useCallback(() => {
    setName(community?.name ?? '');
    setDescription(community?.description ?? '');
    setImageUrl(community?.image ?? '');
    setIsPublishing(false);
    setIsImageUploading(false);
  }, [community]);

  const resetForm = useCallback(() => {
    if (isEditing) {
      populateFromCommunity();
    } else {
      setName('');
      setDescription('');
      setImageUrl('');
      setIsPublishing(false);
      setIsImageUploading(false);
    }
  }, [isEditing, populateFromCommunity]);

  useEffect(() => {
    if (open && isEditing) {
      populateFromCommunity();
    }
  }, [open, isEditing, populateFromCommunity]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  const buildUpdatedCommunityTags = useCallback((baseTags: string[][]): string[][] => {
    const tags = baseTags.filter(([name]) => !['d', 'name', 'description', 'image', 'alt'].includes(name));
    const nextTags: string[][] = [
      ['d', effectiveSlug],
      ['name', name.trim()],
    ];

    if (description.trim()) {
      nextTags.push(['description', description.trim()]);
    }

    const sanitizedImage = sanitizeUrl(imageUrl.trim());
    if (sanitizedImage) {
      nextTags.push(['image', sanitizedImage]);
    }

    nextTags.push(...tags);
    nextTags.push(['alt', `Community: ${name.trim()}`]);

    return nextTags;
  }, [description, effectiveSlug, imageUrl, name]);

  // ── Publish ───────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!user || !name.trim() || !effectiveSlug) return;
    if (isImageUploading) {
      toast({ title: 'Image is still uploading', description: 'Please wait for the upload to finish.' });
      return;
    }
    if (imageUrl.trim() && !sanitizeUrl(imageUrl.trim())) {
      toast({ title: 'Image URL must be a valid https URL', variant: 'destructive' });
      return;
    }

    setIsPublishing(true);
    try {
      if (isEditing && communityEvent && community) {
        const prev = await fetchFreshEvent(nostr, {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [communityEvent.pubkey],
          '#d': [community.dTag],
        });

        const updatedEvent = await publishEvent({
          kind: COMMUNITY_DEFINITION_KIND,
          content: prev?.content ?? communityEvent.content,
          tags: buildUpdatedCommunityTags(prev?.tags ?? communityEvent.tags),
          prev: prev ?? undefined,
        } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> & { prev?: NostrEvent });

        queryClient.setQueryData(
          ['addr-event', COMMUNITY_DEFINITION_KIND, communityEvent.pubkey, community.dTag],
          updatedEvent,
        );
        queryClient.invalidateQueries({ queryKey: ['community-activity-feed'], exact: false });
        queryClient.invalidateQueries({ queryKey: ['my-communities'], exact: false });

        toast({ title: 'Community updated!' });
        handleOpenChange(false);
        return;
      }

      // Check for d-tag collision (same author, same kind, same d-tag)
      const existing = await nostr.query([{
        kinds: [COMMUNITY_DEFINITION_KIND],
        authors: [user.pubkey],
        '#d': [effectiveSlug],
        limit: 1,
      }]);

      if (existing.length > 0) {
        toast({
          title: 'Name already in use',
          description: 'You already have a community with this name. Please choose a different name.',
          variant: 'destructive',
        });
        setIsPublishing(false);
        return;
      }

      // Founder as moderator (p tag)
      const communityTags = buildUpdatedCommunityTags([['p', user.pubkey, '', 'moderator']]);

      // Publish community definition (kind 34550)
      const createdEvent = await publishEvent({
        kind: COMMUNITY_DEFINITION_KIND,
        content: '',
        tags: communityTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // Navigate to the new community
      const naddr = nip19.naddrEncode({
        kind: COMMUNITY_DEFINITION_KIND,
        pubkey: createdEvent.pubkey,
        identifier: effectiveSlug,
      });

      toast({ title: 'Community created!' });
      handleOpenChange(false);
      navigate(`/${naddr}`);
    } catch (err) {
      toast({
        title: isEditing ? 'Failed to update community' : 'Failed to create community',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    user, name, effectiveSlug, isEditing, communityEvent, community, nostr, isImageUploading, imageUrl,
    publishEvent, buildUpdatedCommunityTags, queryClient, toast, handleOpenChange, navigate,
  ]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            {isEditing ? 'Edit Community' : 'Create a Community'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the name, image, and description. Moderators are preserved.'
              : "Start a new community on Nostr. You'll be the founder."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(100vh-9rem)] sm:max-h-none">
          <div className="px-5 pb-5 space-y-4">
            {/* Community name */}
            <div className="space-y-1.5">
              <Label htmlFor="community-name">Community Name *</Label>
              <Input
                id="community-name"
                placeholder="e.g. The Arbiter's Guard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              {name.trim() && (
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {effectiveSlug || '...'}{isEditing ? ' (unchanged)' : ''}
                </p>
              )}
            </div>

            <ImageUploadField
              id="community-image"
              label={<>Community Image <span className="text-muted-foreground font-normal">(recommended)</span></>}
              value={imageUrl}
              onChange={setImageUrl}
              onUploadingChange={setIsImageUploading}
              previewAlt="Community image preview"
              dropAreaClassName="min-h-32"
            />

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="community-description">
                Description
                <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
              </Label>
              <Textarea
                id="community-description"
                placeholder="What is this community about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Submit button */}
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !effectiveSlug || isPublishing || isImageUploading}
              className="w-full gap-2"
            >
              {isPublishing ? (
                <><Loader2 className="size-4 animate-spin" /> {isEditing ? 'Saving...' : 'Creating...'}</>
              ) : (
                <><Users className="size-4" /> {isEditing ? 'Save Changes' : 'Create Community'}</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
