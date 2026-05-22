import { Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { useProfileOrganizations } from '@/hooks/useProfileOrganizations';
import { cn } from '@/lib/utils';

interface ProfileOrganizationsStripProps {
  pubkey: string;
  /** When true, omit the section entirely if there are no orgs (default true). */
  collapseWhenEmpty?: boolean;
}

/**
 * Hero row of the public organizations a profile is associated with —
 * orgs they founded or moderate.
 *
 * Uses {@link useProfileOrganizations} which only surfaces public signals
 * (founder + moderator); the "follows" axis (NIP-51 kind 10004 bookmarks)
 * is private state and is intentionally not shown for other people's
 * profiles.
 *
 * Each card carries a small role badge overlay so the visitor can tell at
 * a glance whether the person *owns* the org or merely helps moderate it.
 */
export function ProfileOrganizationsStrip({
  pubkey,
  collapseWhenEmpty = true,
}: ProfileOrganizationsStripProps) {
  const { data: orgs, isLoading } = useProfileOrganizations(pubkey);

  if (isLoading && orgs.length === 0) {
    return (
      <section className="mt-6">
        <header className="flex items-center gap-2 mb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Users className="size-5 text-primary" />
            Organizations
          </h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CommunityMiniCardSkeleton key={i} className="w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (orgs.length === 0 && collapseWhenEmpty) return null;

  return (
    <section className="mt-6">
      <header className="flex items-center gap-2 mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Users className="size-5 text-primary" />
          Organizations
          <span className="text-sm font-normal text-muted-foreground">({orgs.length})</span>
        </h2>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orgs.map((entry) => (
          <div key={entry.community.aTag} className="relative">
            <CommunityMiniCard community={entry.community} className="w-full" />
            {/* Role badge overlay — pinned bottom-left of the banner area.
                Founder takes precedence over moderator since being founder
                implies being able to act on the org. */}
            <Badge
              variant="secondary"
              className={cn(
                'absolute top-2 left-2 backdrop-blur bg-background/90 border-border/40 text-[10px] font-semibold uppercase tracking-wide',
                entry.isFounder ? 'text-primary' : 'text-foreground',
              )}
            >
              {entry.isFounder ? 'Founder' : 'Moderator'}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
