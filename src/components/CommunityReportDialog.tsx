import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';
import { REPORT_KIND } from '@/lib/communityUtils';

// ── Report type options (NIP-56) ──────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'spam', label: 'Spam', description: 'Unsolicited or repetitive content' },
  { value: 'nudity', label: 'Nudity or sexual content', description: 'Depictions of nudity or pornography' },
  { value: 'profanity', label: 'Hateful speech', description: 'Profanity, hateful or abusive speech' },
  { value: 'illegal', label: 'Illegal content', description: 'Content that may be illegal in some jurisdictions' },
  { value: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else' },
  { value: 'malware', label: 'Malware', description: 'Virus, trojan horse, spyware, or ransomware' },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
] as const;

type ReportType = typeof REPORT_TYPES[number]['value'];

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommunityReportDialogProps {
  /** The event being reported. */
  event: NostrEvent;
  /** The community `A` tag coordinate (e.g. `34550:<pubkey>:<d-tag>`). */
  communityATag: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommunityReportDialog({
  event,
  communityATag,
  open,
  onOpenChange,
}: CommunityReportDialogProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [details, setDetails] = useState('');

  const canSubmit = reportType !== '' && !isPending;

  const handleSubmit = async () => {
    if (!reportType || !user) return;

    try {
      await publishEvent({
        kind: REPORT_KIND,
        content: details.trim(),
        tags: [
          ['e', event.id, reportType],
          ['p', event.pubkey, reportType],
          ['A', communityATag],
        ],
      });

      toast({ title: 'Report submitted' });
      setReportType('');
      setDetails('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to submit report', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden">
        <DialogTitle>Report post</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Select a reason for reporting this post to the community.
        </DialogDescription>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <RadioGroup
            value={reportType}
            onValueChange={(v) => setReportType(v as ReportType)}
            className="mt-2 space-y-1"
          >
            {REPORT_TYPES.map((type) => (
              <label
                key={type.value}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary/60"
              >
                <RadioGroupItem value={type.value} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{type.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>

          <div className="mt-3 space-y-2 pb-1">
            <Label htmlFor="community-report-details" className="text-sm font-medium">
              Additional details{' '}
              {reportType !== 'other' && (
                <span className="text-muted-foreground font-normal">(optional)</span>
              )}
            </Label>
            <Textarea
              id="community-report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide additional context..."
              className="resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
