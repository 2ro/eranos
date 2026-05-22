import { Link } from 'react-router-dom';
import { EyeOff, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { CommunityModerationMenu } from '@/components/CommunityModerationMenu';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useOrganizationModeration } from '@/hooks/useOrganizationModeration';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import {
  COMMUNITY_DEFINITION_KIND,
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
 * banner exposing the Approve / Hide / Feature actions. Non-moderators see
 * no overlay at all because `CommunityModerationMenu` returns `null`.
 */
export function CommunityMiniCard({ community, className }: CommunityMiniCardProps) {
  const founder = useAuthor(community.founderPubkey);
  const banner = sanitizeUrl(community.image);
  const founderName =
    founder.data?.metadata?.display_name ||
    founder.data?.metadata?.name ||
    genUserName(community.founderPubkey);
  const founderAvatar = sanitizeUrl(founder.data?.metadata?.picture);

  const naddr = nip19.naddrEncode({
    kind: COMMUNITY_DEFINITION_KIND,
    pubkey: community.founderPubkey,
    identifier: community.dTag,
  });

  // Per-card moderation state. Reads from the shared TanStack cache; the
  // underlying query is fetched once per page render no matter how many
  // cards mount this hook.
  const { data: moderation } = useOrganizationModeration();
  const coord = community.aTag;
  const isApproved = moderation.approvedCoords.has(coord);
  const isHidden = moderation.hiddenCoords.has(coord);
  const isFeatured = moderation.featuredCoords.has(coord);

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
          {/* Moderator overlay. Mirrors `CampaignCard`: Hidden badge sits to
              the left of the kebab so moderators can see the state at a
              glance. Both render `null` for non-moderators or unlabelled
              orgs. */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            {isHidden && (
              <Badge
                variant="secondary"
                className="backdrop-blur bg-destructive/15 text-destructive border-destructive/30 h-6 px-1.5 text-[10px]"
              >
                <EyeOff className="size-3 mr-1" />
                Hidden
              </Badge>
            )}
            <CommunityModerationMenu
              coord={coord}
              organizationName={community.name}
              isApproved={isApproved}
              isHidden={isHidden}
              isFeatured={isFeatured}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 p-3.5 flex-1">
          <h3 className="font-semibold leading-tight text-sm tracking-tight line-clamp-1">
            {community.name}
          </h3>
          {community.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
              {community.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-auto pt-1.5">
            {founderAvatar ? (
              <img
                src={founderAvatar}
                alt=""
                loading="lazy"
                className="size-5 rounded-full object-cover"
              />
            ) : (
              <div className="size-5 rounded-full bg-secondary" />
            )}
            <span className="text-[11px] text-muted-foreground truncate">
              by {founderName}
            </span>
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
