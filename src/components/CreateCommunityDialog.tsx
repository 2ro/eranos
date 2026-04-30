import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Upload, Loader2 } from 'lucide-react';
import { useNostr } from '@nostrify/react';
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
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';

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
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateCommunityDialog({ open, onOpenChange }: CreateCommunityDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  // Derived
  const effectiveSlug = slugify(name);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setImageUrl('');
    setImagePreview('');
    setIsPublishing(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  // ── Image upload ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const [[, url]] = await uploadFile(file);
      setImageUrl(url);
      toast({ title: 'Image uploaded' });
    } catch {
      setImagePreview('');
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  }, [uploadFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Publish ───────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!user || !name.trim() || !effectiveSlug) return;

    setIsPublishing(true);
    try {
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

      // Build community definition tags
      const communityTags: string[][] = [
        ['d', effectiveSlug],
        ['name', name.trim()],
      ];

      if (description.trim()) {
        communityTags.push(['description', description.trim()]);
      }

      if (imageUrl) {
        communityTags.push(['image', imageUrl]);
      }

      // Founder as moderator (p tag)
      communityTags.push(['p', user.pubkey, '', 'moderator']);
      communityTags.push(['alt', `Community: ${name.trim()}`]);

      // Publish community definition (kind 34550)
      const communityEvent = await publishEvent({
        kind: COMMUNITY_DEFINITION_KIND,
        content: '',
        tags: communityTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // Navigate to the new community
      const naddr = nip19.naddrEncode({
        kind: COMMUNITY_DEFINITION_KIND,
        pubkey: communityEvent.pubkey,
        identifier: effectiveSlug,
      });

      toast({ title: 'Community created!' });
      handleOpenChange(false);
      navigate(`/${naddr}`);
    } catch (err) {
      toast({
        title: 'Failed to create community',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [user, name, effectiveSlug, description, imageUrl, nostr, publishEvent, toast, handleOpenChange, navigate]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Create a Community
          </DialogTitle>
          <DialogDescription>
            Start a new community on Nostr. You'll be the founder.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
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
                  ID: {effectiveSlug || '...'}
                </p>
              )}
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <Label>
                Community Image
                <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
              </Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer overflow-hidden"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Community image preview" className="w-full h-full object-cover" />
                ) : isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                    <span className="text-xs">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="size-6 opacity-40" />
                    <span className="text-xs">Drop an image or click to upload</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            </div>

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

            {/* Create button */}
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !effectiveSlug || isPublishing || isUploading}
              className="w-full gap-2"
            >
              {isPublishing ? (
                <><Loader2 className="size-4 animate-spin" /> Creating...</>
              ) : (
                <><Users className="size-4" /> Create Community</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
