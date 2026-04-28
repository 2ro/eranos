import { useSeoMeta } from '@unhead/react';
import { BadgeCheck, Users } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { useAddrEvent } from '@/hooks/useEvent';
import { VERIFIED_FOLLOW_PACK } from '@/lib/agoraDefaults';
import { PageHeader } from '@/components/PageHeader';
import { FollowPackDetailContent } from '@/components/FollowPackDetailContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function VerifiedPage() {
  const { config } = useAppContext();
  const { data: event, isLoading, isError } = useAddrEvent(
    {
      kind: VERIFIED_FOLLOW_PACK.kind,
      pubkey: VERIFIED_FOLLOW_PACK.pubkey,
      identifier: VERIFIED_FOLLOW_PACK.identifier,
    },
    VERIFIED_FOLLOW_PACK.relays,
  );

  useSeoMeta({
    title: `Verified | ${config.appName}`,
    description: 'Discover and follow verified accounts curated for Agora.',
  });

  return (
    <main>
      <PageHeader title="Verified" icon={<BadgeCheck className="size-5 text-primary" />} />
      <div className="max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="px-4 py-4 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : isError || !event ? (
          <div className="px-4 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="size-5 text-muted-foreground" />
                  Verified pack unavailable
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We could not load the verified follow pack right now. Please try again shortly.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <FollowPackDetailContent event={event} />
        )}
      </div>
    </main>
  );
}

export default VerifiedPage;
