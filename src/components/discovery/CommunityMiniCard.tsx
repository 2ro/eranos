import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { AuthorByline } from '@/components/AuthorByline';
import { CommunityModerationOverlay } from '@/components/CommunityModerationMenu';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventTranslation } from '@/hooks/useEventTranslation';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';

interface CommunityMiniCardProps {
  community: ParsedCommunity;
  className?: string;
}

/**
 * Compact, fixed-width community card for the Discover page's "Find your
 * people" shelf. Whole card is a `<Link>` to the community's naddr-based
 * route. Visual hierarchy:
 *
 *  - 16:9 banner image (or warm gradient + Users icon when missing),
 *  - bold community name,
 *  - one-line description,
 *  - founder avatar + display name in a muted row.
 *
 * Kept narrow enough to fit ~4 cards across a desktop content column.
 *
 * Moderators (Team Soapbox pack members) see a kebab menu overlaid on the
 * banner exposing the Feature / Hide actions plus a Hidden badge when the
 * org is currently hidden. Non-moderators see no overlay — the whole
 * moderation pipeline (including the heavy `useOrganizationModeration`
 * query) is bypassed for them so grids of dozens of cards don't fan out
 * a per-card cache subscription on every viewer.
 */
export function CommunityMiniCard({ community, className }: CommunityMiniCardProps) {
  const communityEvent = {
    id: community.aTag,
    pubkey: community.founderPubkey,
    kind: COMMUNITY_DEFINITION_KIND,
    tags: community.tags,
    content: '',
    created_at: 0,
    sig: '',
  };
  const { translatedEvent, translateAction } = useEventTranslation(communityEvent, {
    iconOnly: true,
    buttonClassName: 'size-8 rounded-full p-0 text-muted-foreground hover:text-primary hover:bg-primary/10',
  });
  const displayCommunity = parseCommunityEvent(translatedEvent) ?? community;
  const banner = sanitizeUrl(displayCommunity.image);

  const naddr = nip19.naddrEncode({
    kind: COMMUNITY_DEFINITION_KIND,
    pubkey: community.founderPubkey,
    identifier: community.dTag,
  });

  return (
    <Link
      to={`/${naddr}`}
      className={cn(
        'group block w-64 shrink-0 rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5',
        className,
      )}
    >
      <Card className="overflow-hidden border-border/70 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 group-hover:shadow-lg h-full flex flex-col">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/15 via-primary/5 to-secondary">
          {banner ? (
            <img
              src={banner}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Users className="size-10 text-primary/40" />
            </div>
          )}
          {/* Moderator overlay (Hidden badge + kebab). Renders `null` for
              non-moderators, which is why this component owns the
              `useOrganizationModeration` subscription rather than the
              card — keeps non-mod grids free of the heavy label query. */}
          <CommunityModerationOverlay coord={community.aTag} organizationName={community.name} />
        </div>
        <div className="flex flex-col gap-2 p-3.5 flex-1">
          <h3 className="font-semibold leading-tight text-sm tracking-tight line-clamp-1">
            {displayCommunity.name}
          </h3>
          {displayCommunity.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
              {displayCommunity.description}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
            <AuthorByline pubkey={community.founderPubkey} insideLink />
            {translateAction}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** Skeleton placeholder matching `CommunityMiniCard` dimensions. */
export function CommunityMiniCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('w-64 shrink-0 rounded-xl overflow-hidden', className)}>
      <Card className="border-border/70 shadow-sm h-full flex flex-col">
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
        <div className="flex flex-col gap-2 p-3.5 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex items-center gap-2 mt-auto pt-1.5">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </Card>
    </div>
  );
}
