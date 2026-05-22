import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  Bitcoin,
  Globe,
  HandHeart,
  Megaphone,
  MoreHorizontal,
  QrCode,
  Users,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { BioContent } from '@/components/BioContent';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { FollowToggleButton } from '@/components/FollowButton';
import { LinkFooter } from '@/components/LinkFooter';
import { Nip05Badge } from '@/components/Nip05Badge';
import { ProfileReactionButton } from '@/components/ProfileReactionButton';
import { OrganizationsAllDialog } from '@/components/profile/OrganizationsAllDialog';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useProfileOrganizations, type ProfileOrganization } from '@/hooks/useProfileOrganizations';
import type { ProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import type { ParsedCampaign } from '@/lib/campaign';
import { formatCampaignAmount } from '@/lib/formatCampaignAmount';
import { formatNumber } from '@/lib/formatNumber';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

export interface ProfileIdentityRailProps {
  pubkey: string;
  /** Whether the logged-in user is viewing their own profile. */
  isOwnProfile: boolean;
  /** Resolved kind 0 metadata, if any. */
  metadata: NostrMetadata | undefined;
  /** Raw kind 0 event — needed for emoji tag rendering on display name. */
  metadataEvent: NostrEvent | undefined;
  /** Pre-resolved display name (with `genUserName` fallback applied upstream). */
  displayName: string;
  /** True while the kind-0 author query is still in flight; renders skeletons. */
  isAuthorLoading: boolean;

  /** Banner image URL — used to wire the avatar lightbox to the same url. */
  bannerUrl: string | undefined;
  /** Optional NIP-38 status (renders as a thought bubble next to the avatar). */
  status?: { text: string | undefined; url: string | undefined };

  /** Custom kind-0 profile fields, already parsed. */
  fields: { label: string; value: string }[];
  /** Pre-rendered list of <ProfileFieldInline /> nodes — keeps that helper inside ProfilePage. */
  fieldsContent: ReactNode;

  /** Campaigns authored by this profile (newest-first). */
  campaigns: ParsedCampaign[];
  /** Aggregated campaign + raised stats for the stat block. */
  campaignStats: ProfileCampaignStats;
  /** Pledges (kind 36639) created by this profile. */
  pledgesCount: number;
  /** Spot BTC price for the Raised stat row. */
  btcPrice: number | undefined;

  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  followPending: boolean;

  onLightbox: (url: string) => void;
  onFollowersOpen: () => void;
  onFollowingOpen: () => void;
  onMoreMenuOpen: () => void;
  onFollowQROpen: () => void;
  onToggleFollow: () => void;
  onTabChange: (tabId: string) => void;
  onDonate: (campaign: ParsedCampaign) => void;
  /** Whether the viewer can take any action (logged in). Disables follow when null. */
  canFollow: boolean;
  /** Latest kind-0 event used by ProfileReactionButton; falls back to metadataEvent. */
  authorEvent: NostrEvent | undefined;
}

const RAIL_CAMPAIGN_LIMIT = 2;
const RAIL_ORG_LIMIT = 4;

/**
 * ProfileIdentityRail — the left rail of the two-column profile.
 *
 * Holds everything that's a *standing fact* about the profile: who they
 * are (avatar, name, bio), what they're raising for (active campaigns),
 * who they organize with (orgs), key counts (followers / following /
 * campaigns / pledges / raised), and the freeform profile fields.
 *
 * Sticky on `lg+` so it stays visible while the right tab column scrolls.
 * Below `lg` the rail just stacks above the content — its avatar still
 * overlaps the banner via `-mt-16` because the rail is the first child
 * below the banner element.
 *
 * The rail does NOT own the tab bar or the tab content — those live in
 * the right column. Click handlers like `onTabChange` exist so rail rows
 * can switch tabs (e.g. "See all campaigns →" jumps to the Campaigns tab).
 */
export function ProfileIdentityRail({
  pubkey,
  isOwnProfile,
  metadata,
  metadataEvent,
  displayName,
  isAuthorLoading,
  bannerUrl: _bannerUrl,
  status,
  fields,
  fieldsContent,
  campaigns,
  campaignStats,
  pledgesCount,
  btcPrice,
  followersCount,
  followingCount,
  isFollowing,
  followPending,
  onLightbox,
  onFollowersOpen,
  onFollowingOpen,
  onMoreMenuOpen,
  onFollowQROpen,
  onToggleFollow,
  onTabChange,
  onDonate,
  canFollow,
  authorEvent,
}: ProfileIdentityRailProps) {
  if (isAuthorLoading) {
    return (
      <RailSkeleton />
    );
  }

  const websiteHref = (() => {
    if (!metadata?.website) return undefined;
    const candidate = metadata.website.startsWith('http')
      ? metadata.website
      : `https://${metadata.website}`;
    return sanitizeUrl(candidate);
  })();

  const onchainCampaigns = campaigns.filter((c) => c.wallet?.mode === 'onchain');

  return (
    <div className="flex flex-col gap-5">
      {/* Avatar — overlaps the banner from inside the rail. */}
      <AvatarBlock
        metadata={metadata}
        displayName={displayName}
        status={status}
        onLightbox={onLightbox}
      />

      {/* Identity: name + NIP-05 + website + bio */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold leading-tight break-words">
          {metadataEvent ? (
            <EmojifiedText tags={metadataEvent.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </h1>
        {metadata?.nip05 && (
          <Nip05Badge nip05={metadata.nip05} pubkey={pubkey} className="text-sm text-muted-foreground" />
        )}
        {websiteHref && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <Globe className="size-3.5 shrink-0" />
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-primary hover:underline"
            >
              {metadata!.website!.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          </div>
        )}
        {metadata?.about && (
          <p className="pt-1 text-sm whitespace-pre-wrap break-words text-foreground/90">
            <BioContent tags={metadataEvent?.tags}>{metadata.about}</BioContent>
          </p>
        )}
      </div>

      {/* Badge preview */}
      <BadgePreviewRow pubkey={pubkey} />

      {/* Action bar — wraps onto multiple rows in a 340px-wide rail. */}
      <ActionBar
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
        followPending={followPending}
        canFollow={canFollow}
        onToggleFollow={onToggleFollow}
        onMoreMenuOpen={onMoreMenuOpen}
        onFollowQROpen={onFollowQROpen}
        authorEvent={authorEvent}
        onchainCampaigns={onchainCampaigns}
        onDonate={onDonate}
      />

      {/* Vertical stat list */}
      <StatList
        followersCount={followersCount}
        followingCount={followingCount}
        campaignCount={campaignStats.campaignCount}
        pledgesCount={pledgesCount}
        totalRaisedSats={campaignStats.totalRaisedSats}
        btcPrice={btcPrice}
        onFollowersOpen={onFollowersOpen}
        onFollowingOpen={onFollowingOpen}
        onTabChange={onTabChange}
      />

      {/* Active campaigns */}
      <RailCampaignsSection
        campaigns={campaigns}
        isOwnProfile={isOwnProfile}
        isLoading={campaignStats.isVerifying && campaigns.length === 0}
        onSeeAll={() => onTabChange('campaigns')}
      />

      {/* Organizations */}
      <RailOrganizationsSection pubkey={pubkey} />

      {/* Profile fields (rendered upstream) */}
      {fields.length > 0 && (
        <section className="space-y-3">
          <RailSectionHeader icon={null} title="Profile" />
          <div className="space-y-3">{fieldsContent}</div>
        </section>
      )}

      <LinkFooter />
    </div>
  );
}

// ─── Avatar block ────────────────────────────────────────────────────────────

function AvatarBlock({
  metadata,
  displayName,
  status,
  onLightbox,
}: {
  metadata: NostrMetadata | undefined;
  displayName: string;
  status: { text: string | undefined; url: string | undefined } | undefined;
  onLightbox: (url: string) => void;
}) {
  const picture = metadata?.picture;
  return (
    <div className="relative">
      <button
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full -mt-28 md:-mt-32 block"
        onClick={() => picture && onLightbox(picture)}
        disabled={!picture}
      >
        <Avatar className={cn(
          'size-28 md:size-32 border-4 border-background shadow-lg',
          picture && 'cursor-pointer',
        )}>
          <AvatarImage src={picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-3xl">
            {displayName[0]?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
      </button>

      {/* NIP-38 thought bubble — floats to the right of the avatar over the banner area. */}
      {status?.text && (
        <div className="absolute top-2 left-[calc(7rem+8px)] md:left-[calc(8rem+8px)] z-10 max-w-[200px] animate-in fade-in slide-in-from-left-1 duration-300">
          <div className="relative bg-background/90 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-lg">
            <p className="text-xs text-foreground italic truncate">
              {status.url ? (
                <a href={status.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {status.text}
                </a>
              ) : (
                status.text
              )}
            </p>
            {/* Speech bubble triangle tail */}
            <div className="absolute -bottom-[7px] left-1 size-0 border-t-[8px] border-t-border border-r-[8px] border-r-transparent" />
            <div className="absolute -bottom-[5.5px] left-1 size-0 border-t-[7px] border-t-background border-r-[7px] border-r-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Action bar ──────────────────────────────────────────────────────────────

function ActionBar({
  isOwnProfile,
  isFollowing,
  followPending,
  canFollow,
  onToggleFollow,
  onMoreMenuOpen,
  onFollowQROpen,
  authorEvent,
  onchainCampaigns,
  onDonate,
}: {
  isOwnProfile: boolean;
  isFollowing: boolean;
  followPending: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onMoreMenuOpen: () => void;
  onFollowQROpen: () => void;
  authorEvent: NostrEvent | undefined;
  onchainCampaigns: ParsedCampaign[];
  onDonate: (campaign: ParsedCampaign) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOwnProfile ? (
        <>
          <Link to="/settings/profile" className="flex-1 min-w-[140px]">
            <Button variant="outline" className="rounded-full font-bold w-full">
              Edit profile
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-10"
            title="Share follow link"
            onClick={onFollowQROpen}
          >
            <QrCode className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-10"
            onClick={onMoreMenuOpen}
            title="More options"
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </>
      ) : (
        <>
          <FollowToggleButton
            isFollowing={isFollowing}
            isPending={followPending}
            onClick={onToggleFollow}
            disabled={!canFollow}
          />
          {onchainCampaigns.length === 1 ? (
            <Button
              onClick={() => onDonate(onchainCampaigns[0])}
              className="rounded-full font-bold gap-1.5"
            >
              <HandHeart className="size-4" />
              Donate
            </Button>
          ) : onchainCampaigns.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-full font-bold gap-1.5">
                  <HandHeart className="size-4" />
                  Donate
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {onchainCampaigns.map((c) => (
                  <DropdownMenuItem
                    key={c.aTag}
                    onClick={() => onDonate(c)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="font-medium truncate w-full">{c.title}</span>
                    {c.goalUsd ? (
                      <span className="text-xs text-muted-foreground">
                        Goal ${c.goalUsd.toLocaleString()}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {authorEvent && <ProfileReactionButton profileEvent={authorEvent} />}
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-10"
            onClick={onMoreMenuOpen}
            title="More options"
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Stat list ──────────────────────────────────────────────────────────────

function StatList({
  followersCount,
  followingCount,
  campaignCount,
  pledgesCount,
  totalRaisedSats,
  btcPrice,
  onFollowersOpen,
  onFollowingOpen,
  onTabChange,
}: {
  followersCount: number;
  followingCount: number;
  campaignCount: number;
  pledgesCount: number;
  totalRaisedSats: number;
  btcPrice: number | undefined;
  onFollowersOpen: () => void;
  onFollowingOpen: () => void;
  onTabChange: (id: string) => void;
}) {
  const rows: Array<{
    icon?: ReactNode;
    label: string;
    value: string;
    onClick?: () => void;
    show: boolean;
  }> = [
    {
      label: 'Followers',
      value: formatNumber(followersCount),
      onClick: onFollowersOpen,
      show: followersCount > 0,
    },
    {
      label: 'Following',
      value: formatNumber(followingCount),
      onClick: onFollowingOpen,
      show: followingCount > 0,
    },
    {
      icon: <Megaphone className="size-3.5 text-primary" />,
      label: campaignCount === 1 ? 'Campaign' : 'Campaigns',
      value: formatNumber(campaignCount),
      onClick: () => onTabChange('campaigns'),
      show: campaignCount > 0,
    },
    {
      icon: <HandHeart className="size-3.5 text-primary" />,
      label: pledgesCount === 1 ? 'Pledge' : 'Pledges',
      value: formatNumber(pledgesCount),
      onClick: () => onTabChange('pledges'),
      show: pledgesCount > 0,
    },
    {
      icon: <Bitcoin className="size-3.5 text-primary" />,
      label: 'Raised',
      value: formatCampaignAmount(totalRaisedSats, btcPrice),
      onClick: () => onTabChange('campaigns'),
      show: totalRaisedSats > 0,
    },
  ].filter((r) => r.show);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 divide-y divide-border/60">
      {rows.map((row) => (
        <button
          key={row.label}
          onClick={row.onClick}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-secondary/40 transition-colors first:rounded-t-xl last:rounded-b-xl"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            {row.icon}
            {row.label}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Badge preview row ──────────────────────────────────────────────────────

function BadgePreviewRow({ pubkey }: { pubkey: string }) {
  const { refs: badgeRefs } = useProfileBadges(pubkey);
  const firstBadgeRefs = badgeRefs.slice(0, 5);
  const { badgeMap } = useBadgeDefinitions(firstBadgeRefs);

  if (badgeRefs.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {firstBadgeRefs.map((ref) => {
        const badge = badgeMap.get(ref.aTag);
        if (!badge) return null;
        return (
          <Link
            key={ref.aTag}
            to={`/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`}
          >
            <BadgeThumbnail badge={badge} size={32} />
          </Link>
        );
      })}
      {badgeRefs.length > 5 && (
        <span className="text-[10px] text-muted-foreground font-medium">+{badgeRefs.length - 5}</span>
      )}
    </div>
  );
}

// ─── Rail Campaigns Section ─────────────────────────────────────────────────

function RailCampaignsSection({
  campaigns,
  isOwnProfile,
  isLoading,
  onSeeAll,
}: {
  campaigns: ParsedCampaign[];
  isOwnProfile: boolean;
  isLoading: boolean;
  onSeeAll: () => void;
}) {
  const { data: moderation } = useCampaignModeration();
  const visible = isOwnProfile
    ? campaigns
    : campaigns.filter((c) => !moderation.hiddenCoords.has(c.aTag));

  if (isLoading && visible.length === 0) {
    return (
      <section className="space-y-3">
        <RailSectionHeader icon={<Megaphone className="size-4 text-primary" />} title="Campaigns" />
        <CampaignCardSkeleton />
      </section>
    );
  }

  if (visible.length === 0) return null;

  const shown = visible.slice(0, RAIL_CAMPAIGN_LIMIT);
  const more = visible.length - shown.length;

  return (
    <section className="space-y-3">
      <RailSectionHeader
        icon={<Megaphone className="size-4 text-primary" />}
        title="Campaigns"
        count={visible.length}
      />
      <div className="space-y-3">
        {shown.map((c) => (
          <CampaignCard key={c.aTag} campaign={c} />
        ))}
      </div>
      {(more > 0 || visible.length > 1) && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm text-primary hover:underline font-medium"
        >
          {more > 0 ? `See all ${visible.length} campaigns →` : 'View campaigns tab →'}
        </button>
      )}
    </section>
  );
}

// ─── Rail Organizations Section ─────────────────────────────────────────────

function RailOrganizationsSection({ pubkey }: { pubkey: string }) {
  const { data: orgs, isLoading } = useProfileOrganizations(pubkey);

  if (isLoading && orgs.length === 0) {
    return (
      <section className="space-y-3">
        <RailSectionHeader icon={<Users className="size-4 text-primary" />} title="Organizations" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <CommunityMiniCardSkeleton key={i} className="w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (orgs.length === 0) return null;

  const shown = orgs.slice(0, RAIL_ORG_LIMIT);
  const overflow = Math.max(0, orgs.length - shown.length);

  return (
    <section className="space-y-3">
      <RailSectionHeader
        icon={<Users className="size-4 text-primary" />}
        title="Organizations"
        count={orgs.length}
      />
      <div className="grid grid-cols-2 gap-3">
        {shown.map((entry) => (
          <RailOrgCell key={entry.community.aTag} entry={entry} />
        ))}
      </div>
      {overflow > 0 && (
        <OrganizationsAllDialog orgs={orgs}>
          <button
            type="button"
            className="text-sm text-primary hover:underline font-medium"
          >
            See all {orgs.length} →
          </button>
        </OrganizationsAllDialog>
      )}
    </section>
  );
}

function RailOrgCell({ entry }: { entry: ProfileOrganization }) {
  return (
    <div className="relative">
      <CommunityMiniCard community={entry.community} className="w-full" />
      <Badge
        variant="secondary"
        className={cn(
          'absolute top-2 left-2 backdrop-blur bg-background/90 border-border/40 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5',
          entry.isFounder ? 'text-primary' : 'text-foreground',
        )}
      >
        {entry.isFounder ? 'Founder' : 'Mod'}
      </Badge>
    </div>
  );
}

// ─── Section header & skeleton ──────────────────────────────────────────────

function RailSectionHeader({
  icon,
  title,
  count,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      <span>{title}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-normal normal-case text-muted-foreground/70">({count})</span>
      )}
    </h2>
  );
}

function RailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="size-28 md:size-32 rounded-full -mt-28 md:-mt-32 border-4 border-background" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full mt-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
