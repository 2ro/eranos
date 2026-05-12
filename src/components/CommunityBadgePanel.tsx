import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { ImageUploadField } from '@/components/ImageUploadField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBadgeDefinitions, type BadgeDefinition } from '@/hooks/useBadgeDefinitions';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { BADGE_DEFINITION_KIND, COMMUNITY_DEFINITION_KIND, type ParsedCommunity } from '@/lib/communityUtils';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface BadgeRef {
  pubkey: string;
  identifier: string;
}

interface CommunityBadgePanelProps {
  communityEvent: NostrEvent;
  community: ParsedCommunity;
  isFounder: boolean;
}

function parseBadgeATag(aTag: string | undefined): BadgeRef | undefined {
  if (!aTag) return undefined;
  const [kind, pubkey, ...identifierParts] = aTag.split(':');
  const identifier = identifierParts.join(':');
  if (kind !== String(BADGE_DEFINITION_KIND) || !pubkey || !identifier) return undefined;
  return { pubkey, identifier };
}

function buildBadgeTags(baseTags: string[][], dTag: string, name: string, description: string, imageUrl: string): string[][] {
  const tags = baseTags.filter(([tagName]) => !['d', 'name', 'description', 'image', 'thumb', 'alt'].includes(tagName));
  const nextTags: string[][] = [
    ['d', dTag],
    ['name', name.trim()],
  ];

  if (description.trim()) {
    nextTags.push(['description', description.trim()]);
  }

  const image = sanitizeUrl(imageUrl.trim());
  if (image) {
    nextTags.push(['image', image, '1024x1024']);
  }

  nextTags.push(...tags);
  nextTags.push(['alt', `Badge definition: ${name.trim()}`]);
  return nextTags;
}

function buildCommunityBadgeTags(baseTags: string[][], badgeATag: string): string[][] {
  return [
    ...baseTags.filter(([tagName, value, , role]) => !(tagName === 'a' && value?.startsWith(`${BADGE_DEFINITION_KIND}:`) && role === 'member')),
    ['a', badgeATag, '', 'member'],
  ];
}

export function CommunityBadgePanel({ communityEvent, community, isFounder }: CommunityBadgePanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const badgeRef = useMemo(() => parseBadgeATag(community.memberBadgeATag), [community.memberBadgeATag]);
  const badgeRefs = useMemo(() => badgeRef ? [badgeRef] : [], [badgeRef]);
  const { badgeMap, isLoading, isError } = useBadgeDefinitions(badgeRefs);
  const badge = community.memberBadgeATag ? badgeMap.get(community.memberBadgeATag) : undefined;

  const badgeButtonLabel = badge ? `Edit ${badge.name} badge` : 'Set member badge';

  const badgeVisual = isLoading ? (
    <div className="size-10 animate-pulse rounded-lg bg-muted" />
  ) : badge ? (
    <BadgeThumbnail badge={badge} size={40} className="shrink-0" />
  ) : (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Award className="size-4" />
    </div>
  );

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Member badge</p>
      <div className="flex items-center gap-3 py-1">
        {isFounder ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="shrink-0 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={badgeButtonLabel}
            title={badgeButtonLabel}
          >
            {badgeVisual}
          </button>
        ) : badgeVisual}

        <div className="min-w-0 flex-1">
          {isError ? (
            <p className="text-sm text-destructive">Failed to load badge</p>
          ) : isLoading ? (
            <div className="space-y-1.5">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          ) : badge ? (
            <>
              <p className="truncate text-sm font-medium">{badge.name}</p>
              <p className="truncate text-xs text-muted-foreground">Community member badge</p>
            </>
          ) : (
            <>
              <p className="truncate text-sm font-medium">Member badge</p>
              <p className="truncate text-xs text-muted-foreground">
                {isFounder ? 'Click the badge image to set one' : 'No badge set yet'}
              </p>
            </>
          )}
        </div>
      </div>

      {isFounder && (
        <CommunityBadgeDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          communityEvent={communityEvent}
          community={community}
          badge={badge}
        />
      )}
    </div>
  );
}

function CommunityBadgeDialog({
  open,
  onOpenChange,
  communityEvent,
  community,
  badge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityEvent: NostrEvent;
  community: ParsedCommunity;
  badge?: BadgeDefinition;
}) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [name, setName] = useState('Member');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);

  const canEditExistingBadge = !!badge && !!user && badge.event.pubkey === user.pubkey;
  const canSave = !badge || canEditExistingBadge;

  const resetForm = useCallback(() => {
    setName(badge?.name || 'Member');
    setDescription(badge?.description || `Member of ${community.name}`);
    setImageUrl(badge?.image || badge?.thumbs[0]?.url || '');
    setIsPublishing(false);
    setIsImageUploading(false);
  }, [badge, community.name]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  const handleSave = useCallback(async () => {
    if (!user || user.pubkey !== communityEvent.pubkey) return;
    if (!name.trim()) {
      toast({ title: 'Enter a badge name', variant: 'destructive' });
      return;
    }
    if (isImageUploading) {
      toast({ title: 'Image is still uploading', description: 'Please wait for the upload to finish.' });
      return;
    }
    if (imageUrl.trim() && !sanitizeUrl(imageUrl.trim())) {
      toast({ title: 'Badge image must be a valid https URL', variant: 'destructive' });
      return;
    }
    if (badge && !canEditExistingBadge) {
      toast({ title: 'Badge cannot be edited', description: 'Only the badge issuer can edit this member badge.', variant: 'destructive' });
      return;
    }

    setIsPublishing(true);
    try {
      const targetDTag = badge?.identifier || `${community.dTag}-member`;
      const prevBadge = await fetchFreshEvent(nostr, {
        kinds: [BADGE_DEFINITION_KIND],
        authors: [user.pubkey],
        '#d': [targetDTag],
      });
      const baseBadge = prevBadge ?? badge?.event;

      const badgeEvent = await publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: baseBadge?.content ?? '',
        tags: buildBadgeTags(baseBadge?.tags ?? [['d', targetDTag]], targetDTag, name, description, imageUrl),
        prev: prevBadge ?? undefined,
      });

      const badgeATag = `${BADGE_DEFINITION_KIND}:${badgeEvent.pubkey}:${targetDTag}`;

      if (!community.memberBadgeATag) {
        const prevCommunity = await fetchFreshEvent(nostr, {
          kinds: [COMMUNITY_DEFINITION_KIND],
          authors: [communityEvent.pubkey],
          '#d': [community.dTag],
        });
        const baseCommunity = prevCommunity ?? communityEvent;
        const updatedCommunity = await publishEvent({
          kind: COMMUNITY_DEFINITION_KIND,
          content: baseCommunity.content,
          tags: buildCommunityBadgeTags(baseCommunity.tags, badgeATag),
          prev: prevCommunity ?? undefined,
        });
        queryClient.setQueryData(['addr-event', COMMUNITY_DEFINITION_KIND, updatedCommunity.pubkey, community.dTag], updatedCommunity);
      }

      queryClient.setQueryData(['addr-event', BADGE_DEFINITION_KIND, badgeEvent.pubkey, targetDTag], badgeEvent);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['badge-definitions-batch'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['community-members', community.aTag], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['community-activity-feed'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['my-communities'], exact: false }),
      ]);

      toast({ title: badge ? 'Member badge updated' : 'Member badge added' });
      handleOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to update member badge',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [
    user, communityEvent, name, isImageUploading, imageUrl, badge, canEditExistingBadge, community, nostr,
    publishEvent, description, queryClient, toast, handleOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Award className="size-5 text-primary" />
            Member Badge
          </DialogTitle>
          <DialogDescription>
            This badge is awarded to members of {community.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          {badge && !canEditExistingBadge && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              This badge was issued by another account, so it cannot be edited here.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="community-member-badge-name">Badge name *</Label>
            <Input
              id="community-member-badge-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canSave || isPublishing}
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="community-member-badge-description">Description</Label>
            <Textarea
              id="community-member-badge-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canSave || isPublishing}
              rows={2}
            />
          </div>

          <ImageUploadField
            id="community-member-badge-image"
            label={<>Badge image <span className="text-muted-foreground font-normal">(recommended)</span></>}
            value={imageUrl}
            onChange={setImageUrl}
            onUploadingChange={setIsImageUploading}
            uploadToastTitle="Badge image uploaded"
            previewAlt="Member badge preview"
            objectFit="contain"
            dropAreaClassName="min-h-28"
            disabled={!canSave || isPublishing}
          />

          <Button
            onClick={handleSave}
            disabled={!canSave || !name.trim() || isPublishing || isImageUploading}
            className="w-full gap-2"
          >
            {isPublishing ? <><Loader2 className="size-4 animate-spin" /> Saving...</> : <><Award className="size-4" /> Save Badge</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
