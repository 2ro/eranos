import { useState } from 'react';
import { BarChart3, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CommunityStatsPanel } from '@/components/CommunityStatsPanel';
import { COUNTRIES } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountryStatsDrawerProps {
  /** ISO 3166-1 alpha-2 country code (e.g. `VE`). */
  countryCode: string;
  className?: string;
}

/**
 * Stats launcher button + modal for a single country page (`/i/iso3166:XX`).
 * Mirrors the world page's `WorldDiscoveryDrawer` UX: a compact pill button
 * that opens a centered Dialog containing `<CommunityStatsPanel>` for the
 * country. Renders the same trusted kind-30385 snapshot the world page uses,
 * scoped to one country instead of the global aggregate.
 *
 * Unlike the world drawer's absolutely-positioned floating button (which
 * overlays a fullbleed Leaflet map), this trigger is rendered inline inside
 * the country page's flex header — the caller positions it.
 */
export function CountryStatsDrawer({ countryCode, className }: CountryStatsDrawerProps) {
  const [open, setOpen] = useState(false);

  const country = COUNTRIES[countryCode.toUpperCase()];
  const countryName = country?.name ?? countryCode;
  const flag = country?.flag ?? '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open community stats for ${countryName}`}
        className={cn(
          'flex items-center gap-2 rounded-full',
          'border border-border/60 bg-background/95 backdrop-blur',
          'px-3 py-1.5 shadow-sm hover:bg-secondary',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <BarChart3 className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Stats</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
    </>
  );
}
