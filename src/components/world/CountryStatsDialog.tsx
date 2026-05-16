import { Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { COUNTRIES } from '@/lib/countries';

interface CountryStatsDialogProps {
  /** ISO 3166-1 alpha-2 country code (e.g. `VE`). */
  countryCode: string;
  /** Whether the dialog is open. */
  open: boolean;
  /** Open-state callback (passed straight to the underlying Radix Dialog). */
  onOpenChange: (open: boolean) => void;
}

/**
 * Per-country community-stats modal for the `/i/iso3166:XX` page. Shows the
 * trusted kind-30385 snapshot scoped to one country (mirroring the world
 * page's `WorldDiscoveryDrawer`, just without the country browser and
 * trending strip).
 *
 * Controlled-only — the parent owns the open state, so the dialog can be
 * triggered from anywhere (action-bar dropdown menu items, keyboard
 * shortcuts, deep links). The previous "pill button + modal" version baked
 * the trigger into this component, which made it impossible to host the
 * trigger inside a dropdown menu without rendering two visible affordances.
 */
export function CountryStatsDialog({ countryCode, open, onOpenChange }: CountryStatsDialogProps) {
  const country = COUNTRIES[countryCode.toUpperCase()];
  const countryName = country?.name ?? countryCode;
  const flag = country?.flag ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Tall, scrollable modal — matches WorldDiscoveryDrawer dimensions
          so the two surfaces feel consistent across the app. */}
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            {flag ? (
              <span
                className="text-lg leading-none"
                role="img"
                aria-label={`Flag of ${countryName}`}
              >
                {flag}
              </span>
            ) : (
              <Trophy className="size-4 text-primary shrink-0" />
            )}
            {countryName} community stats
          </DialogTitle>
          <DialogDescription className="sr-only">
            Submissions, top contributors, trending hashtags, and other
            activity metrics for {countryName}.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body: per-country stats snapshot. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-4 pt-3 pb-4">
            <CommunityStatsPanel countryCode={countryCode} compact />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
