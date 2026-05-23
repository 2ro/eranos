import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { CalendarClock, HandHeart, MapPin } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatCompactPledgeDeadline, formatPledgeAmount } from '@/lib/pledges';
import { getGeoDisplayName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import type { Action } from '@/hooks/useActions';

interface ProfilePledgesTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  /** Pledges authored by this pubkey. Already filtered upstream. */
  pledges: Action[];
  /** BTC price for sats↔USD conversion in pledge amount labels. */
  btcPrice: number | undefined;
  /** True while the underlying useActions() query is still in flight. */
  isLoading: boolean;
}

/**
 * Pledges authored by this profile, rendered as a responsive grid that
 * mirrors the `/pledges` (`ActionsPage`) directory styling.
 *
 * v1 scope per the design plan: pledges *created* by the user.
 * "Pledges backed" (zapped submissions on others' pledges) is deferred to v2.
 */
export function ProfilePledgesTab({
  pubkey,
  displayName,
  isOwnProfile,
  pledges,
  btcPrice,
  isLoading,
}: ProfilePledgesTabProps) {
  const { t } = useTranslation();
  const now = Math.floor(Date.now() / 1000);

  // Loading skeleton until the first list resolves.
  if (isLoading && pledges.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <PledgesGridSkeleton />
      </div>
    );
  }

  if (pledges.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-12">
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            <HandHeart className="size-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isOwnProfile
                ? t('profile.pledgesTab.emptySelf')
                : t('profile.pledgesTab.emptyOther', { name: displayName })}
            </p>
            {isOwnProfile && (
              <RouterLink
                to="/pledges/new"
                className="inline-block mt-4 text-sm font-medium text-primary hover:underline"
              >
                {t('profile.pledgesTab.createLink')}
              </RouterLink>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Split into active vs ended so the active pledges lead the grid.
  const active: Action[] = [];
  const ended: Action[] = [];
  for (const p of pledges) {
    if (p.deadline && p.deadline <= now) ended.push(p);
    else active.push(p);
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8" data-pubkey={pubkey}>
      {active.length > 0 && (
        <section>
          {ended.length > 0 && (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {t('profile.pledgesTab.active')}
            </h3>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {active.map((pledge) => (
              <ProfilePledgeCard key={pledge.event.id} action={pledge} btcPrice={btcPrice} />
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {t('profile.pledgesTab.ended')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {ended.map((pledge) => (
              <ProfilePledgeCard key={pledge.event.id} action={pledge} btcPrice={btcPrice} isExpired />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProfilePledgeCard({
  action,
  isExpired,
  btcPrice,
}: {
  action: Action;
  isExpired?: boolean;
  btcPrice: number | undefined;
}) {
  const { t } = useTranslation();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const coverImage = (action.image && !imageLoadFailed) ? action.image : DEFAULT_COVER_IMAGE;
  const deadline = action.deadline ? formatCompactPledgeDeadline(action.deadline) : null;
  const countryLabel = action.countryCode ? getGeoDisplayName(action.countryCode) : undefined;

  return (
    <RouterLink
      to={`/${naddr}`}
      className="group block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
    >
      <Card className="overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col">
        <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
          <img
            src={coverImage}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setImageLoadFailed(true)}
            loading="lazy"
          />
          {isExpired && (
            <Badge
              variant="secondary"
              className="absolute top-3 right-3 backdrop-blur bg-background/85 border-border/40 text-muted-foreground"
            >
              {t('profile.badges.ended')}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-3 p-5 flex-1">
          <h3 className="font-bold leading-tight tracking-tight text-lg line-clamp-2">
            {action.title}
          </h3>
          {action.description.trim() && (
            <p className="text-sm text-muted-foreground line-clamp-2">{action.description}</p>
          )}

          <div className="flex-1" />

          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('profile.badges.pledged')}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {formatPledgeAmount(action.bounty, btcPrice)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1">
            {countryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {countryLabel}
              </span>
            )}
            {deadline && (
              <span className={cn(
                'inline-flex items-center gap-1.5',
                deadline.isPast && 'text-destructive',
              )}>
                <CalendarClock className="size-3.5" />
                {deadline.label}
              </span>
            )}
          </div>
        </div>
      </Card>
    </RouterLink>
  );
}

function PledgesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="overflow-hidden border-border/70">
          <Skeleton className="aspect-[16/9] w-full rounded-none" />
          <div className="p-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </Card>
      ))}
    </div>
  );
}
