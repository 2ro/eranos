import { useState } from 'react';
import { Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { useProfileOrganizations, type ProfileOrganization } from '@/hooks/useProfileOrganizations';
import { cn } from '@/lib/utils';

interface ProfileOrganizationsStripProps {
  pubkey: string;
  /** When true, omit the section entirely if there are no orgs (default true). */
  collapseWhenEmpty?: boolean;
  /** Maximum number of org cards rendered in the strip. Overflow lands in the "See all" dialog. Default 4. */
  limit?: number;
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
 * Capped at `limit` (default 4) so a heavily-affiliated user doesn't
 * push the rest of the profile down a screen. When the user has more
 * orgs, a "See all N" trigger opens a scrollable dialog with the full
 * list.
 */
export function ProfileOrganizationsStrip({
  pubkey,
  collapseWhenEmpty = true,
  limit = 4,
}: ProfileOrganizationsStripProps) {
  const { data: orgs, isLoading } = useProfileOrganizations(pubkey);
  const [allOpen, setAllOpen] = useState(false);

  if (isLoading && orgs.length === 0) {
    return (
      <section className="mt-6">
        <header className="flex items-center gap-2 mb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Users className="size-5 text-primary" />
            Organizations
          </h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CommunityMiniCardSkeleton key={i} className="w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (orgs.length === 0 && collapseWhenEmpty) return null;

  const visible = orgs.slice(0, limit);
  const overflow = Math.max(0, orgs.length - visible.length);

  return (
    <section className="mt-6">
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Users className="size-5 text-primary" />
          Organizations
          <span className="text-sm font-normal text-muted-foreground">({orgs.length})</span>
        </h2>
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="text-sm text-primary hover:underline font-medium"
          >
            See all {orgs.length} →
          </button>
        )}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visible.map((entry) => (
          <OrgCardWithBadge key={entry.community.aTag} entry={entry} />
        ))}
      </div>

      {/* Overflow dialog — surfaces the rest of the user's orgs in a
          scrollable list. Re-uses the same CommunityMiniCard so visuals
          stay consistent with the strip. */}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              All organizations
              <span className="text-sm font-normal text-muted-foreground">({orgs.length})</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="px-6 py-4 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {orgs.map((entry) => (
                <OrgCardWithBadge key={entry.community.aTag} entry={entry} />
              ))}
            </div>
          </ScrollArea>
          <div className="px-6 pb-6 pt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setAllOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * CommunityMiniCard with a Founder / Moderator badge overlaid on the banner.
 * Founder takes precedence over Moderator since being founder implies the
 * higher level of authority.
 */
function OrgCardWithBadge({ entry }: { entry: ProfileOrganization }) {
  return (
    <div className="relative">
      <CommunityMiniCard community={entry.community} className="w-full" />
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
  );
}
