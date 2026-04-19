import { Link } from 'react-router-dom';
import { ArrowRight, Hash, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COUNTRIES, isSubdivisionFormat } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountryActivityPopoverProps {
  /** ISO 3166-1 alpha-2 country code (or `XX-YY` subdivision). */
  countryCode: string;
  /** Comment count for the time window represented by the snapshot. */
  activityCount: number;
  /** Optional top trending hashtag (no leading `#`). */
  topHashtag?: string;
  /** Render in mobile-friendly mode (full width, larger touch targets). */
  isMobile?: boolean;
}

/**
 * Slim popover used by `WorldMap` markers. Shows the country name, the
 * activity count, an optional trending hashtag, and a CTA that links into the
 * existing `/i/iso3166:XX` country feed page.
 *
 * Intentionally lighter than Pathos's variant — it does not pull in challenges
 * or feed previews, so opening a popover doesn't fan out additional Nostr
 * queries per marker.
 */
export function CountryActivityPopover({
  countryCode,
  activityCount,
  topHashtag,
  isMobile,
}: CountryActivityPopoverProps) {
  const upper = countryCode.toUpperCase();
  const isSubdivision = isSubdivisionFormat(upper);
  const parentCode = isSubdivision ? upper.split('-')[0] : upper;
  const countryName = COUNTRIES[parentCode]?.name ?? parentCode;
  const flag = COUNTRIES[parentCode]?.flag ?? '';
  // We always link to the country-level feed; subdivisions roll up to it.
  const href = `/i/iso3166:${parentCode}`;
  const countLabel = `${activityCount.toLocaleString()} ${activityCount === 1 ? 'post' : 'posts'}`;

  return (
    <Card
      className={cn(
        'border-primary/20 bg-popover/95 backdrop-blur-sm shadow-lg',
        isMobile ? 'w-[88vw] max-w-sm' : 'w-72',
      )}
    >
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-2xl leading-none" role="img" aria-hidden="true">
            {flag}
          </span>
          <span className="truncate">{countryName}</span>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1 font-normal">
            <MessageSquare className="size-3" />
            {countLabel}
          </Badge>
          {topHashtag && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Hash className="size-3" />
              {topHashtag}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Link
          to={href}
          className="group flex items-center justify-between gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <span>Open feed</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
