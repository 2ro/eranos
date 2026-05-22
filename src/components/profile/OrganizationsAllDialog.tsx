import { useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommunityMiniCard } from '@/components/discovery/CommunityMiniCard';
import type { ProfileOrganization } from '@/hooks/useProfileOrganizations';
import { cn } from '@/lib/utils';

interface OrganizationsAllDialogProps {
  /** Full list of organizations to surface in the overflow dialog. */
  orgs: ProfileOrganization[];
  /** Trigger element — typically a "See all N →" button. */
  children: ReactNode;
}

/**
 * "See all organizations" dialog used by the profile identity rail.
 *
 * Renders every org the profile is associated with in a scrollable
 * 2-column grid of CommunityMiniCards with role badges. Lifted out of
 * the (now-deleted) ProfileOrganizationsStrip so the rail can use it
 * directly without pulling in the strip's full file.
 */
export function OrganizationsAllDialog({ orgs, children }: OrganizationsAllDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
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
              <div key={entry.community.aTag} className="relative">
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
            ))}
          </div>
        </ScrollArea>
        <div className="px-6 pb-6 pt-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
