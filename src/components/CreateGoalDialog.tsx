import { useState } from 'react';
import { Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useQueryClient } from '@tanstack/react-query';
import { ZAP_GOAL_KIND } from '@/lib/goalUtils';

interface CreateGoalDialogProps {
  /** The community `a` tag coordinate (e.g. `34550:<pubkey>:<d-tag>`). */
  communityATag: string;
  children?: React.ReactNode;
  /** Controlled open state. When provided, the component is controlled externally. */
  open?: boolean;
  /** Callback when the open state changes (for controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

export function CreateGoalDialog({ communityATag, children, open: controlledOpen, onOpenChange }: CreateGoalDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [amountSats, setAmountSats] = useState('');
  const [summary, setSummary] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');

  const resetForm = () => {
    setTitle('');
    setAmountSats('');
    setSummary('');
    setImageUrl('');
    setDeadlineDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const sats = parseInt(amountSats, 10);
    if (isNaN(sats) || sats <= 0) {
      toast({ title: 'Enter a valid amount in sats', variant: 'destructive' });
      return;
    }

    if (!title.trim()) {
      toast({ title: 'Enter a title for the goal', variant: 'destructive' });
      return;
    }

    const msats = sats * 1000;

    // Build relay list from the user's configured relays
    const relayUrls = config.relayMetadata.relays
      .filter((r) => r.write)
      .map((r) => r.url);
    if (relayUrls.length === 0) {
      toast({ title: 'No write relays configured', variant: 'destructive' });
      return;
    }

    const tags: string[][] = [
      ['amount', String(msats)],
      ['relays', ...relayUrls],
      ['a', communityATag],
      ['alt', `Zap goal: ${title.trim()}`],
    ];

    if (summary.trim()) {
      tags.push(['summary', summary.trim()]);
    }
    if (imageUrl.trim()) {
      const sanitizedImage = sanitizeUrl(imageUrl.trim());
      if (sanitizedImage) {
        tags.push(['image', sanitizedImage]);
      }
    }
    if (deadlineDate) {
      const deadline = Math.floor(new Date(deadlineDate).getTime() / 1000);
      if (!isNaN(deadline) && deadline > 0) {
        tags.push(['closed_at', String(deadline)]);
      }
    }

    try {
      await publishEvent({
        kind: ZAP_GOAL_KIND,
        content: title.trim(),
        tags,
      });

      // Refresh the fundraising tab and the community activity feed
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-goals', communityATag] }),
        queryClient.invalidateQueries({
          predicate: (q) => {
            const [root, aTagsKey] = q.queryKey;
            return root === 'community-activity-feed'
              && typeof aTagsKey === 'string'
              && aTagsKey.split(',').includes(communityATag);
          },
        }),
      ]);

      toast({ title: 'Fundraising goal created!' });
      resetForm();
      setOpen(false);
    } catch {
      toast({ title: 'Failed to create goal', variant: 'destructive' });
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          {children ?? (
            <Button variant="outline" size="sm" className="gap-1.5">
              <Target className="size-4" />
              New Goal
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <Target className="size-5" />
          Create Fundraising Goal
        </DialogTitle>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              placeholder="e.g. Community meetup expenses"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-amount">Target Amount (sats)</Label>
            <Input
              id="goal-amount"
              type="number"
              min="1"
              placeholder="e.g. 100000"
              value={amountSats}
              onChange={(e) => setAmountSats(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-summary">Description (optional)</Label>
            <Textarea
              id="goal-summary"
              placeholder="Tell people what this fundraiser is for..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-image">Image URL (optional)</Label>
            <Input
              id="goal-image"
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-deadline">Deadline (optional)</Label>
            <Input
              id="goal-deadline"
              type="datetime-local"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Goal'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
