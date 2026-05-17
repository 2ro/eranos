import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Crown, Shield, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseCommunityEvent, COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import { cn } from '@/lib/utils';

interface CommunityCardProps {
  /** The kind 34550 community definition event. */
  event: NostrEvent;
  /** Whether the current user founded this community. */
  isFounded?: boolean;
  /** Whether the current user is a validated member. */
  isMember?: boolean;
  /** Whether the current user follows this community via NIP-51 kind 10004. */
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
        'group relative block min-h-[240px] overflow-hidden rounded-2xl bg-muted shadow-sm transition-all hover:shadow-lg sm:min-h-[260px]',
        className,
      )}
    >
      <div className="absolute right-3 top-3 z-10 flex gap-1.5 [text-shadow:none]">
        {isFounded && (
          <span className="flex size-7 items-center justify-center rounded-full bg-black/35 text-white shadow-sm backdrop-blur-sm" title="Founder" aria-label="Founder">
            <Crown className="size-3.5" />
          </span>
        )}
        {isMember && (
          <span className="flex size-7 items-center justify-center rounded-full bg-black/35 text-white shadow-sm backdrop-blur-sm" title="Member" aria-label="Member">
            <Shield className="size-3.5" />
          </span>
        )}
        {isBookmarked && (
          <span className="flex size-7 items-center justify-center rounded-full bg-black/35 text-white shadow-sm backdrop-blur-sm" title="Following" aria-label="Following">
            <Bookmark className="size-3.5 fill-current" />
          </span>
        )}
      </div>

      {/* Image backdrop */}
      {community.image ? (
        <img
          src={community.image}
          alt={community.name}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-primary/25 to-primary/5">
          <Users className="absolute left-1/2 top-1/3 size-16 -translate-x-1/2 -translate-y-1/2 text-white/20" />
        </div>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.16)_38%,rgba(0,0,0,0.78)_74%,rgba(0,0,0,0.92)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 p-4 pt-16 [text-shadow:0_1px_4px_rgba(0,0,0,0.75)]">
        <h3 className="mb-2 truncate text-lg font-bold leading-tight text-white transition-colors group-hover:text-white">
          {community.name}
        </h3>

        {community.description && (
          <p className="line-clamp-1 text-xs leading-relaxed text-white/80">
            {community.description}
          </p>
        )}
      </div>
    </Link>
  );
}
