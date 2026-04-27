import { useMemo, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft,
  Crown,
  MessageCircle,
  Shield,
  ShieldBan,
  Share2,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BanConfirmDialog } from '@/components/BanConfirmDialog';
import { ComposeBox } from '@/components/ComposeBox';
import { MembersOnlyToggle } from '@/components/MembersOnlyToggle';
import { ThreadedReplyList, type ReplyNode } from '@/components/ThreadedReplyList';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useComments } from '@/hooks/useComments';
import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMembersOnlyFilter } from '@/hooks/useMembersOnlyFilter';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { CommunityModerationContext } from '@/contexts/CommunityModerationContext';
import { applyCommunityModerationToEvents, canBanTarget, getViewerAuthority, parseCommunityEvent, type CommunityMember } from '@/lib/communityUtils';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ── Sub-components ────────────────────────────────────────────────────────────

function PersonRow({ pubkey, label, size = 'md', onBan }: { pubkey: string; label?: string; size?: 'sm' | 'md'; onBan?: () => void }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-10';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <div className="flex items-center gap-3 py-1">
      <Link to={profileUrl} className="flex items-center gap-3 group flex-1 min-w-0">
        <Avatar shape={avatarShape} className={cn(avatarCls, 'ring-2 ring-background')}>
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium truncate group-hover:underline', size === 'sm' ? 'text-sm' : 'text-[15px]')}>{name}</p>
          {metadata?.nip05 && (
            <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
          )}
        </div>
        {label && (
          <Badge variant="secondary" className="ml-auto capitalize text-xs shrink-0">{label}</Badge>
        )}
      </Link>
      {onBan && (
        <button
          onClick={(e) => { e.stopPropagation(); onBan(); }}
          className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          aria-label="Ban from community"
          title="Ban from community"
        >
          <ShieldBan className="size-4" />
        </button>
      )}
    </div>
  );
}

function MembersSkeleton() {
  return (
    <div className="space-y-4 px-5 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ReplyCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommunityDetailPage({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();

  // ── Member ban dialog state ────────────────────────────────────────────────
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banTargetPubkey, setBanTargetPubkey] = useState<string | null>(null);

  // Parse community definition
  const community = useMemo(() => parseCommunityEvent(event), [event]);
  const name = community?.name ?? 'Unnamed Community';
  const description = community?.description ?? '';
  const image = community?.image;
  const communityATag = community?.aTag ?? '';

  // Extract website URL from description
  const descriptionUrl = useMemo(() => {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    return sanitizeUrl(urlMatch?.[0]);
  }, [description]);

  const descriptionText = useMemo(() => {
    if (!descriptionUrl) return description;
    return description.replace(new RegExp(`\\s*${descriptionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  }, [description, descriptionUrl]);

  // ── Members ─────────────────────────────────────────────────────────────────
  const { data: membership, moderation, rankMap, isLoading: membersLoading } = useCommunityMembers(community);
  const viewerMember = user ? getViewerAuthority(user.pubkey, rankMap, moderation) : undefined;

  // Batch-fetch profiles for all members
  const allMemberPubkeys = useMemo(
    () => membership?.members.map((m) => m.pubkey) ?? [],
    [membership],
  );
  useAuthors(allMemberPubkeys);

  // Group members by rank
  const membersByRank = useMemo(() => {
    if (!membership || !community) return [];
    const groups = new Map<number, CommunityMember[]>();
    for (const m of membership.members) {
      const list = groups.get(m.rank) ?? [];
      list.push(m);
      groups.set(m.rank, list);
    }
    // Build ordered groups with labels
    const result: { rank: number; label: string; members: CommunityMember[] }[] = [];
    const sortedRanks = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const rank of sortedRanks) {
      const members = groups.get(rank)!;
      let label: string;
      if (rank === 0) {
        label = 'Leadership';
      } else {
        // Find the badge a-tag for this rank from community definition
        const tier = community.ranks.find((r) => r.rank === rank);
        // Use the badge d-tag suffix as a label hint, or fall back to "Rank N"
        if (tier?.badgeATag) {
          const parts = tier.badgeATag.split(':');
          const dTag = parts.slice(2).join(':');
          // Try to extract a human-readable name from the d-tag (after the UUID prefix)
          const namePart = dTag.split('-').pop();
          label = namePart ? namePart.charAt(0).toUpperCase() + namePart.slice(1) : `Rank ${rank}`;
        } else {
          label = `Rank ${rank}`;
        }
      }
      result.push({ rank, label, members });
    }
    return result;
  }, [membership, community]);

  // ── Comments (NIP-22 on the community event) ───────────────────────────────
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);
  const { membersOnly } = useMembersOnlyFilter();

  const replyTree = useMemo((): ReplyNode[] => {
    if (!commentsData) return [];
    const topLevel = commentsData.topLevelComments ?? [];

    // Filter: omit banned events and posts by banned members, then optionally
    // restrict to chain-validated members when the "members only" toggle is
    // active. The member filter is a presentation-layer choice — the NIP
    // recommends it as the canonical-feed default, but users may opt out.
    const applyModeration = (events: NostrEvent[]): NostrEvent[] => {
      const moderated = applyCommunityModerationToEvents(events, moderation);
      if (!membersOnly) return moderated;
      return moderated.filter((ev) => rankMap.has(ev.pubkey));
    };

    const buildNode = (ev: NostrEvent): ReplyNode => {
      const allChildren = applyModeration(commentsData.getDirectReplies(ev.id) ?? []);
      if (allChildren.length <= 1) {
        return {
          event: ev,
          children: allChildren.map((c) => buildNode(c)),
        };
      }
      const [first, ...rest] = allChildren;
      return {
        event: ev,
        children: [buildNode(first)],
        hiddenChildren: rest.map((c) => buildNode(c)),
      };
    };

    return applyModeration([...topLevel])
      .sort((a, b) => a.created_at - b.created_at)
      .map((r) => buildNode(r));
  }, [commentsData, moderation, membersOnly, rankMap]);

  // ── Share handler ───────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const naddr = nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: d,
    });
    const url = `${window.location.origin}/${naddr}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  }, [event, toast]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold flex-1 truncate">Community</h1>
        <button
          className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
          onClick={handleShare}
          aria-label="Share"
        >
          <Share2 className="size-5" />
        </button>
      </div>

      {/* ── Hero image ── */}
      {image ? (
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <img src={image} alt={name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h2 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">{name}</h2>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[21/9] w-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <Users className="size-16 text-primary/20" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h2 className="text-2xl font-bold leading-tight">{name}</h2>
          </div>
        </div>
      )}

      {/* ── Community info ── */}
      <div className="px-5 mt-4 space-y-4">
        {/* Description */}
        {descriptionText && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{descriptionText}</p>
        )}

        {/* Founder */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Founded by</p>
          <PersonRow pubkey={event.pubkey} />
        </div>

        {/* ── Tabs ── */}
        <CommunityModerationContext.Provider value={communityATag ? { communityATag, moderation, rankMap } : null}>
          <Tabs defaultValue="members" className="-mx-5">
            {/* The TabsList stays flex so tabs share width, and the toggle
                sits to the right of the tabs. The toggle filters all
                content feeds within this community (currently only
                Comments, but scoped that way so future feeds inherit). */}
            <div className="flex items-stretch border-b border-border">
              <TabsList className="flex-1 rounded-none bg-transparent p-0 h-auto">
                <TabsTrigger
                  value="members"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
                >
                  <Users className="size-4 mr-1.5" />
                  Members
                </TabsTrigger>
                <TabsTrigger
                  value="comments"
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 pt-2"
                >
                  <MessageCircle className="size-4 mr-1.5" />
                  Comments
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center pr-2 shrink-0">
                <MembersOnlyToggle />
              </div>
            </div>

            {/* ── Members tab ── */}
            <TabsContent value="members" className="mt-0">
              {membersLoading ? (
                <MembersSkeleton />
              ) : membersByRank.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  No members found.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {membersByRank.map(({ rank, label, members }) => (
                    <section key={rank} className="px-5 py-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                        {rank === 0 ? <Crown className="size-3.5 text-amber-500" /> : <Shield className="size-3.5" />}
                        {label}
                        <span className="text-muted-foreground/60 font-normal">({members.length})</span>
                      </h3>
                      <div className="space-y-0.5">
                        {members.map((m) => {
                          let roleLabel: string | undefined;
                          if (rank === 0) {
                            roleLabel = m.pubkey === event.pubkey ? 'Founder' : 'Moderator';
                          }
                          // Determine if the current user can ban this member
                          const canBanMember = viewerMember
                            && m.pubkey !== user?.pubkey
                            && canBanTarget(viewerMember, m);
                          return (
                            <PersonRow
                              key={m.pubkey}
                              pubkey={m.pubkey}
                              label={roleLabel}
                              size="sm"
                              onBan={canBanMember ? () => {
                                setBanTargetPubkey(m.pubkey);
                                setBanDialogOpen(true);
                              } : undefined}
                            />
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Comments tab ── */}
            <TabsContent value="comments" className="mt-0">
              <ComposeBox compact replyTo={event} />

              {commentsLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ReplyCardSkeleton key={i} />
                  ))}
                </div>
              ) : replyTree.length > 0 ? (
                <ThreadedReplyList roots={replyTree} />
              ) : membersOnly && commentsData && (commentsData.topLevelComments?.length ?? 0) > 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm px-5">
                  No comments from community members yet. Toggle the shield icon to see all comments.
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No comments yet. Be the first to comment!
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CommunityModerationContext.Provider>
      </div>

      {/* Member ban confirmation dialog */}
      {banTargetPubkey && communityATag && (
        <BanConfirmDialog
          mode="member"
          targetPubkey={banTargetPubkey}
          communityATag={communityATag}
          open={banDialogOpen}
          onOpenChange={(open) => {
            setBanDialogOpen(open);
            if (!open) setBanTargetPubkey(null);
          }}
        />
      )}
    </div>
  );
}
