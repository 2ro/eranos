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

interface BanContentProps {
  /** Ban a specific post. */
  mode: 'content';
  /** The event ID to ban. */
  eventId: string;
  /** The event author's pubkey. */
  targetPubkey: string;
  /** Display name for the dialog description. */
  displayName?: string;
}

interface BanMemberProps {
  /** Ban a member. */
  mode: 'member';
  eventId?: never;
  /** The pubkey of the member to ban. */
  targetPubkey: string;
  /** Display name for the dialog description. */
  displayName?: string;
}

type BanMode = BanContentProps | BanMemberProps;

type BanConfirmDialogProps = BanMode & {
  /** The community `A` tag coordinate. */
  communityATag: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BanConfirmDialog({
  mode,
  eventId,
  targetPubkey,
  displayName,
  communityATag,
  open,
  onOpenChange,
}: BanConfirmDialogProps) {
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [reason, setReason] = useState('');

  const title = mode === 'content' ? 'Remove from community' : `Ban ${displayName ? `@${displayName}` : 'member'} from community`;
  const description = mode === 'content'
    ? 'This will hide the post from canonical community views.'
    : `This will ban ${displayName ? `@${displayName}` : 'this member'} from the community. Their recruits remain unaffected.`;

  const handleSubmit = async () => {
    try {
      const tags: string[][] = [];

      if (mode === 'content' && eventId) {
        tags.push(['e', eventId, 'other']);
      }

      tags.push(['p', targetPubkey, 'other']);
      tags.push(['A', communityATag]);
      tags.push(['L', MODERATION_LABEL_NAMESPACE]);
      tags.push(['l', MODERATION_BAN_LABEL, MODERATION_LABEL_NAMESPACE]);

      await publishEvent({
        kind: REPORT_KIND,
        content: reason.trim(),
        tags,
      });

      // Invalidate community queries so the moderation overlay updates
      // immediately (removes banned content/members without a page refresh).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-members', communityATag] }),
        queryClient.invalidateQueries({ queryKey: ['community-activity-feed'], exact: false }),
      ]);

      toast({ title: mode === 'content' ? 'Post removed from community' : 'Member banned from community' });
      setReason('');
      onOpenChange(false);
    } catch {
      toast({ title: mode === 'content' ? 'Failed to remove post from community' : 'Failed to ban member from community', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl flex flex-col overflow-hidden">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {description}
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
            {isPending ? 'Submitting...' : (mode === 'content' ? 'Remove' : 'Ban')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
