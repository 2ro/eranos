import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Crown, Shield, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { parseCommunityEvent, COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface CommunityCardProps {
  /** The kind 34550 community definition event. */
  event: NostrEvent;
  /** Whether the current user founded this community. */
  isFounded?: boolean;
  /** Whether the current user is a validated member. */
  isMember?: boolean;
  /** Whether the current user has bookmarked this community (NIP-51 kind 10004). */
  isBookmarked?: boolean;
  className?: string;
}

/**
 * Compact card for displaying a community in a list.
 * Shows image, name, description snippet, founder info, and community status.
 */
export function CommunityCard({
  event,
  isFounded,
  isMember,
  isBookmarked,
  className,
}: CommunityCardProps) {
  const community = useMemo(() => parseCommunityEvent(event), [event]);
  const founderAuthor = useAuthor(event.pubkey);
  const founderMeta = founderAuthor.data?.metadata;
  const founderName = founderMeta?.display_name || founderMeta?.name || genUserName(event.pubkey);
  const founderProfileUrl = useProfileUrl(event.pubkey, founderMeta);

  if (!community) return null;

  const naddr = nip19.naddrEncode({
    kind: COMMUNITY_DEFINITION_KIND,
    pubkey: event.pubkey,
    identifier: community.dTag,
  });

  return (
    <Link
      to={`/${naddr}`}
      className={cn(
        'group block rounded-xl border border-border hover:border-primary/30 transition-all hover:shadow-md overflow-hidden',
        className,
      )}
    >
      {/* Image banner */}
      {community.image ? (
        <div className="relative h-28 overflow-hidden bg-muted">
          <img
            src={community.image}
            alt={community.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      ) : (
        <div className="relative h-28 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <Users className="size-10 text-primary/20" />
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Name + founder badge */}
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-semibold truncate flex-1 group-hover:text-primary transition-colors">
            {community.name}
          </h3>
          {isFounded ? (
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              <Crown className="size-2.5" />
              Founder
            </Badge>
          ) : isMember ? (
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <Shield className="size-2.5" />
              Member
            </Badge>
          ) : isBookmarked ? (
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0 bg-primary/10 text-primary border-primary/20">
              <Bookmark className="size-2.5 fill-current" />
              Bookmarked
            </Badge>
          ) : null}
        </div>

        {/* Description */}
        {community.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {community.description}
          </p>
        )}

        {/* Footer: founder + stats */}
        <div className="flex items-center justify-between pt-1">
          <Link
            to={founderProfileUrl}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 min-w-0"
          >
            <Avatar className="size-5">
              <AvatarImage src={founderMeta?.picture} />
              <AvatarFallback className="text-[8px] bg-muted">
                {founderName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-muted-foreground truncate hover:underline">
              {founderName}
            </span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {community.moderatorPubkeys.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Shield className="size-3" />
                {community.moderatorPubkeys.length}
              </span>
            )}
            {community.memberBadgeATag && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" />
                Member badge
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
