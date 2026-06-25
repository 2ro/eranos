import { openUrl } from '@/lib/downloadFile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface NoBitcoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * For donors who don't already hold Bitcoin. Rather than a wall of
 * instructions, this is a simple "get it here" surface — a single branded
 * Cash App badge (styled like the App Store / Google Play badges) that
 * deep-links to cash.app, where the donor can buy Bitcoin and send it on.
 * Agora never custodies or converts funds; this just points at a mainstream
 * on-ramp the donor controls.
 */
export function NoBitcoinDialog({ open, onOpenChange }: NoBitcoinDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>No Bitcoin yet?</DialogTitle>
          <DialogDescription>
            Buy Bitcoin in Cash App, then send it to this campaign.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => void openUrl('https://cash.app')}
          aria-label="Get Cash App"
          className="group flex w-full items-center gap-4 rounded-2xl bg-[#00D632] px-5 py-4 text-left text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D632] focus-visible:ring-offset-2"
        >
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl font-bold leading-none"
          >
            $
          </span>
          <span className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              Get it on
            </span>
            <span className="text-xl font-semibold leading-tight">Cash App</span>
          </span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
