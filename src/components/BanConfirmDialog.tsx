import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import {
  MODERATION_BAN_LABEL,
  MODERATION_LABEL_NAMESPACE,
  REPORT_KIND,
} from '@/lib/communityUtils';

// ── Props ─────────────────────────────────────────────────────────────────────
//
// Only content-level bans remain. Agora's organization trust model has no
// "member" tier any more, so banning a user wholesale is no longer
// modeled — hide each unwanted post individually instead.

interface BanConfirmDialogProps {
  /** The event ID to ban. */
  eventId: string;
  /** The event author's pubkey. */
  targetPubkey: string;
  /** The community `A` tag coordinate. */
  communityATag: string;
  /** Display name for the dialog description. */
  displayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BanConfirmDialog({
  eventId,
  targetPubkey,
  communityATag,
  open,
  onOpenChange,
}: BanConfirmDialogProps) {
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    try {
      const tags: string[][] = [
        ['e', eventId, 'other'],
        ['p', targetPubkey, 'other'],
        ['A', communityATag],
        ['L', MODERATION_LABEL_NAMESPACE],
        ['l', MODERATION_BAN_LABEL, MODERATION_LABEL_NAMESPACE],
      ];

      await publishEvent({
        kind: REPORT_KIND,
        content: reason.trim(),
        tags,
      });

      // Invalidate community queries so the moderation overlay updates
      // immediately (removes banned content without a page refresh). The
      // activity feed's key is `['community-activity-feed', <aTagsKey>]`
      // where aTagsKey is a comma-joined list of the viewer's subscribed A
      // tags. Predicate-match any feed whose aTagsKey contains this
      // communityATag so the banned post disappears immediately.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-members', communityATag] }),
        queryClient.invalidateQueries({
          predicate: (q) => {
            const [root, aTagsKey] = q.queryKey;
            return root === 'community-activity-feed'
              && typeof aTagsKey === 'string'
              && aTagsKey.split(',').includes(communityATag);
          },
        }),
        // Also refresh the organization-activity feed shown on the org
        // detail page (used by the pledge/campaign shelves).
        queryClient.invalidateQueries({ queryKey: ['organization-activity', communityATag] }),
      ]);

      toast({ title: 'Post removed from organization' });
      setReason('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to remove post from organization', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl flex flex-col overflow-hidden">
        <DialogTitle>Remove from organization</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          This will hide the post from canonical organization views.
        </DialogDescription>

        <div className="space-y-2">
          <Label htmlFor="ban-reason" className="text-sm font-medium">
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for this action..."
            className="resize-none"
            rows={2}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Submitting...' : 'Remove'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
