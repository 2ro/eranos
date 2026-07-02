import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarClock, MapPin } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { AuthorByline } from '@/components/AuthorByline';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import { parseAction, type Action } from '@/hooks/useActions';
import { getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatCompactPledgeDeadline, formatPledgeAmount } from '@/lib/pledges';
import { cn } from '@/lib/utils';

interface PledgeCardProps {
  action: Action;
  /** Presentation variant for standalone surfaces. Inline note cards use PledgeInlinePreview instead. */
  variant?: 'grid' | 'shelf' | 'rail';
  /** Force an ended badge from a parent that already split active/ended sections. */
  isExpired?: boolean;
  /** Render author footer. Standalone discovery cards usually do; profile-owned cards usually don't. */
  showAuthor?: boolean;
  /** Render the translation control in the footer. Use only when no parent shell owns translation. */
  showTranslate?: boolean;
  /** Menu/badges overlaid on the cover image, e.g. share/delete menu. */
  topRight?: ReactNode;
  /** Extra footer affordance, e.g. group official-activity type pill. */
  footerAddon?: ReactNode;
  className?: string;
}

export function PledgeCard({
  action,
  variant = 'grid',
  isExpired,
  showAuthor = false,
  showTranslate = false,
  topRight,
  footerAddon,
  className,
}: PledgeCardProps) {
  const { t } = useTranslation();
  const { translatedEvent, translateAction } = useEventTranslation(action.event, {
    iconOnly: true,
    buttonClassName: 'size-8 rounded-full p-0 text-muted-foreground hover:text-primary hover:bg-primary/10',
  });
  const displayAction = showTranslate ? (parseAction(translatedEvent) ?? action) : action;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const coverImage = displayAction.image && !imageLoadFailed ? displayAction.image : DEFAULT_COVER_IMAGE;
  const deadline = displayAction.deadline ? formatCompactPledgeDeadline(displayAction.deadline) : null;
  const ended = isExpired || !!deadline?.isPast;
  const countryLabel = displayAction.countryCode ? getGeoDisplayName(displayAction.countryCode) : undefined;
  const isRail = variant === 'rail';

  const footer = showAuthor || showTranslate || footerAddon;

  return (
    <Link
      to={`/${naddr}`}
      className={cn(
        'group block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5',
        variant === 'shelf' && 'h-[430px] w-[280px] shrink-0',
        className,
      )}
    >
      <Card className={cn(
        'overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg flex flex-col',
        !isRail && 'h-full',
      )}>
        <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
          <img
            src={coverImage}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setImageLoadFailed(true)}
            loading="lazy"
          />
          {(ended || topRight) && (
            <div className={cn('absolute flex items-center gap-2', isRail ? 'right-2 top-2' : 'right-3 top-3')} onClick={(e) => e.preventDefault()}>
              {ended && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'backdrop-blur bg-background/85 border-border/40 text-muted-foreground',
                    isRail && 'text-[10px] uppercase tracking-wide px-1.5 py-0.5',
                  )}
                >
                  {t('pledges.card.ended')}
                </Badge>
              )}
              {topRight}
            </div>
          )}
        </div>

        <div className={cn(isRail ? 'p-3 space-y-1.5' : 'flex flex-col gap-3 p-5 flex-1')}>
          <div className={cn(!isRail && 'space-y-2')}>
            <h3 className={cn(
              'font-bold leading-tight tracking-tight line-clamp-2',
              isRail ? 'text-sm font-semibold leading-snug' : 'text-lg',
            )}>
              {displayAction.title}
            </h3>
            {!isRail && displayAction.description.trim() && (
              <p className="text-sm text-muted-foreground line-clamp-2">{displayAction.description}</p>
            )}
          </div>

          {!isRail && <div className="flex-1" />}

          {isRail ? (
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground uppercase tracking-wide font-semibold">{t('pledges.card.pledged')}</span>
              <span className="text-foreground font-bold tabular-nums">{formatPledgeAmount(action.bounty)}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('pledges.card.pledged')}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {formatPledgeAmount(action.bounty)}
              </p>
            </div>
          )}

          {(countryLabel || deadline) && (
            <div className={cn(
              'flex flex-wrap text-muted-foreground',
              isRail ? 'gap-x-3 gap-y-1 text-[11px] pt-0.5' : 'gap-x-4 gap-y-1.5 text-xs pt-1',
            )}>
              {countryLabel && (
                <span className={cn('inline-flex items-center gap-1.5', isRail && 'truncate')}>
                  {!isRail && <MapPin className="size-3.5" />}
                  {countryLabel}
                </span>
              )}
              {deadline && (
                <span className={cn('inline-flex items-center gap-1', deadline.isPast && 'text-destructive')}>
                  <CalendarClock className={isRail ? 'size-3' : 'size-3.5'} />
                  {deadline.label}
                </span>
              )}
            </div>
          )}

          {footer && !isRail && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <div className="min-w-0 flex-1 truncate">
                {showAuthor ? <AuthorByline pubkey={action.pubkey} insideLink /> : null}
              </div>
              {(footerAddon || (showTranslate && translateAction)) && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {footerAddon}
                  {showTranslate && translateAction}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

/**
 * Loading placeholder that matches `PledgeCard`'s grid-variant shape:
 * 16:9 cover, then title, two lines of body, a progress bar row, and
 * a footer line. Sized to slot into the same `<DiscoveryGrid>` / 4-col
 * grids as the real card so the skeleton row doesn't reflow when data
 * arrives.
 *
 * Lives next to `PledgeCard` for parity with `CampaignCardSkeleton`
 * and `CommunityMiniCardSkeleton`, which sit next to their cards too.
 * Was duplicated as `ActionSkeleton` in `PledgesDiscoverySection` and
 * `ActionsPage` before this consolidation.
 */
export function PledgeCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm h-full flex flex-col">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex-1 p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}
