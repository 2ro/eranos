import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { HandHeart } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PledgeCard } from '@/components/PledgeCard';
import type { Action } from '@/hooks/useActions';

interface ProfilePledgesTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  /** Pledges authored by this pubkey. Already filtered upstream. */
  pledges: Action[];
  /** True while the underlying useActions() query is still in flight. */
  isLoading: boolean;
}

/**
 * Pledges authored by this profile, rendered as a responsive grid that
 * mirrors the `/pledges` (`ActionsPage`) directory styling.
 *
 * v1 scope per the design plan: pledges *created* by the user.
 * "Pledges backed" (backed submissions on others' pledges) is deferred to v2.
 */
export function ProfilePledgesTab({
  pubkey,
  displayName,
  isOwnProfile,
  pledges,
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
            <HandHeart className="size-10 mx-auto mb-3 text-muted-foreground" />
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
              <PledgeCard key={pledge.event.id} action={pledge} />
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
              <PledgeCard key={pledge.event.id} action={pledge} isExpired />
            ))}
          </div>
        </section>
      )}
    </div>
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
