import { useState } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import { useCommunityModerationContext } from '@/contexts/CommunityModerationContext';
import { cn } from '@/lib/utils';
import { getApplicableReports, type Nip56ReportType } from '@/lib/communityUtils';

/** Lowercase prose labels for content warning summaries. */
const REPORT_TYPE_LABELS: Record<Nip56ReportType, string> = {
  nudity: 'nudity',
  spam: 'spam',
  profanity: 'hateful speech',
  illegal: 'illegal content',
  malware: 'malware',
  impersonation: 'impersonation',
  other: 'community guidelines',
};

interface CommunityContentWarningProps {
  /** The event being rendered. */
  event: NostrEvent;
  /** The content to guard behind the warning when the event has reports. */
  children: React.ReactNode;
  /** Optional class name for the wrapper. */
  className?: string;
}

/**
 * Guards content behind a community report warning overlay when the event has
 * been reported by community members. Subscribes to `CommunityModerationContext`
 * internally so that parents outside community surfaces don't need to know or
 * care about the community system — rendering this wrapper is a no-op when
 * there's no community context in the tree.
 *
 * Only reports whose `p` tag matches the event's actual author are considered
 * — this mirrors the id+pubkey match requirement in the NIP and prevents a
 * report from hijacking the warning overlay onto an unrelated event.
 *
 * Children are **not mounted** until the user explicitly reveals, so media and
 * nested queries are deferred for reported content.
 */
export function CommunityContentWarning({ event, children, className }: CommunityContentWarningProps) {
  const modCtx = useCommunityModerationContext();
  const reports = modCtx ? getApplicableReports(event, modCtx.moderation) : [];
  const [revealed, setRevealed] = useState(false);

  // No community context or no applicable reports → render children transparently.
  if (reports.length === 0 || revealed) {
    return <>{children}</>;
  }

  // Summarize unique report types
  const uniqueTypes = [...new Set(reports.map((r) => r.reportType))];
  const typeLabels = uniqueTypes
    .map((t) => REPORT_TYPE_LABELS[t] ?? t)
    .join(', ');
  const reporterCount = new Set(reports.map((r) => r.reporterPubkey)).size;

  return (
    <div className={cn('border-b border-border', className)}>
      <div className="px-4 py-6">
        <div className="max-w-sm mx-auto flex flex-col items-center text-center gap-2.5">
          <div className="flex items-center justify-center size-9 rounded-full bg-amber-500/10">
            <AlertTriangle className="size-4.5 text-amber-500" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Reported Content</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {reporterCount === 1
                ? `Reported by a community member for ${typeLabels}.`
                : `Reported by ${reporterCount} community members for ${typeLabels}.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-0.5 rounded-full px-5"
            onClick={() => setRevealed(true)}
          >
            <Eye className="size-3.5" />
            Show Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
