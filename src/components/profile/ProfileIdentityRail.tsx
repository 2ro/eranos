import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
import { BioContent } from '@/components/BioContent';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { CommunityMiniCard, CommunityMiniCardSkeleton } from '@/components/discovery/CommunityMiniCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { FollowToggleButton } from '@/components/FollowButton';
import { Nip05Badge } from '@/components/Nip05Badge';
import { PledgeCard } from '@/components/PledgeCard';
import { ProfileReactionButton } from '@/components/ProfileReactionButton';
import { OrganizationsAllDialog } from '@/components/profile/OrganizationsAllDialog';
import { ProfileVerifierSection } from '@/components/profile/ProfileVerifierSection';
import { useCampaignModeration } from '@/hooks/useCampaignModeration';
import { useProfileOrganizations, type ProfileOrganization } from '@/hooks/useProfileOrganizations';
import type { ProfileCampaignStats } from '@/hooks/useProfileCampaignStats';
import type { ParsedCampaign } from '@/lib/campaign';
import { formatCampaignAmount } from '@/lib/formatCampaignAmount';
import { formatNumber } from '@/lib/formatNumber';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import type { Action } from '@/hooks/useActions';

interface ProfileIdentityRailProps {
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
  /**
   * The profile's pledges (kind 36639) — used to surface the latest one
   * in the rail when the profile has no campaigns. The rail picks the
   * newest by `createdAt` itself, so callers can pass the unsorted list.
   */
  pledges: Action[];
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
  pledges,
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

  const onchainCampaigns = campaigns.filter((c) => !!c.wallets?.onchain);

  return (
    // Two-layer structure so the rail can scroll independently on lg+
    // without clipping the avatar that pokes above the rail's top edge:
    //   - Outer flex column owns the avatar (which uses -mt-16 to overlap
    //     the banner). It must NOT clip overflow.
    //   - Inner div carries the rest of the rail and is the scroll
    //     container: `lg:flex-1 lg:min-h-0 lg:overflow-y-auto` makes it
    //     fill the remaining height of the sticky aside and scroll
    //     internally so the page's main scroll only drives the feed.
    <div className="flex flex-col h-full">
      {/* Avatar — overlaps the banner from inside the rail. Sits OUTSIDE
          the scroll container so its negative-margin overhang is never
          clipped by `overflow-y-auto`. */}
      <ProfileAvatarBlock
        metadata={metadata}
        displayName={displayName}
        status={status}
        onLightbox={onLightbox}
      />

      <div className="flex flex-col gap-5 mt-5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto pb-4">
        <ProfileIdentityHeader
          pubkey={pubkey}
          isOwnProfile={isOwnProfile}
          metadata={metadata}
          metadataEvent={metadataEvent}
          displayName={displayName}
          websiteHref={websiteHref}
          isFollowing={isFollowing}
          followPending={followPending}
          canFollow={canFollow}
          followersCount={followersCount}
          followingCount={followingCount}
          totalRaisedSats={campaignStats.totalRaisedSats}
          btcPrice={btcPrice}
          onchainCampaigns={onchainCampaigns}
          onToggleFollow={onToggleFollow}
          onMoreMenuOpen={onMoreMenuOpen}
          onFollowQROpen={onFollowQROpen}
          onDonate={onDonate}
          onFollowersOpen={onFollowersOpen}
          onFollowingOpen={onFollowingOpen}
          onTabChange={onTabChange}
          authorEvent={authorEvent}
        />
        <ProfileOverviewSections
          pubkey={pubkey}
          isOwnProfile={isOwnProfile}
          campaigns={campaigns}
          campaignStats={campaignStats}
          pledges={pledges}
          btcPrice={btcPrice}
          fields={fields}
          fieldsContent={fieldsContent}
          onTabChange={onTabChange}
        />
      </div>
    </div>
  );
}

// ─── Identity header (name / bio / actions / stats) ─────────────────────────

interface ProfileIdentityHeaderProps {
  pubkey: string;
  isOwnProfile: boolean;
  metadata: NostrMetadata | undefined;
  metadataEvent: NostrEvent | undefined;
  displayName: string;
  /** Pre-sanitized website URL (`undefined` if none / unsafe). */
  websiteHref: string | undefined;
  isFollowing: boolean;
  followPending: boolean;
  canFollow: boolean;
  followersCount: number;
  followingCount: number;
  totalRaisedSats: number;
  btcPrice: number | undefined;
  onchainCampaigns: ParsedCampaign[];
  onToggleFollow: () => void;
  onMoreMenuOpen: () => void;
  onFollowQROpen: () => void;
  onDonate: (campaign: ParsedCampaign) => void;
  onFollowersOpen: () => void;
  onFollowingOpen: () => void;
  onTabChange: (tabId: string) => void;
  authorEvent: NostrEvent | undefined;
  className?: string;
}

/**
 * The fixed identity block: name, NIP-05, website, bio, action bar, and
 * top-level stat row (Followers / Following / Raised).
 *
 * Rendered inside `ProfileIdentityRail` on desktop and directly above the
 * tab bar on mobile. Does NOT include the avatar — that lives outside any
 * scroll container so its `-mt-16` overhang into the banner isn't clipped.
 */
export function ProfileIdentityHeader({
  pubkey,
  isOwnProfile,
  metadata,
  metadataEvent,
  displayName,
  websiteHref,
  isFollowing,
  followPending,
  canFollow,
  followersCount,
  followingCount,
  totalRaisedSats,
  btcPrice,
  onchainCampaigns,
  onToggleFollow,
  onMoreMenuOpen,
  onFollowQROpen,
  onDonate,
  onFollowersOpen,
  onFollowingOpen,
  onTabChange,
  authorEvent,
  className,
}: ProfileIdentityHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
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

      {/* Stats: Followers + Following inline; Raised below if applicable. */}
      <StatList
        followersCount={followersCount}
        followingCount={followingCount}
        totalRaisedSats={totalRaisedSats}
        btcPrice={btcPrice}
        onFollowersOpen={onFollowersOpen}
        onFollowingOpen={onFollowingOpen}
        onTabChange={onTabChange}
      />
    </div>
  );
}

// ─── Overview sections (campaigns / latest pledge / orgs / fields) ──────────

interface ProfileOverviewSectionsProps {
  pubkey: string;
  isOwnProfile: boolean;
  campaigns: ParsedCampaign[];
  campaignStats: ProfileCampaignStats;
  pledges: Action[];
  btcPrice: number | undefined;
  fields: { label: string; value: string }[];
  fieldsContent: ReactNode;
  onTabChange: (tabId: string) => void;
  /** Render the Organizations grid inline (default true). Set false on
   *  mobile when "Community" is a dedicated tab and orgs should not also
   *  appear inside Overview. */
  showOrganizations?: boolean;
  className?: string;
}

/**
 * The collection of secondary rail sections: active campaigns, a fallback
 * "latest pledge" card when there are no campaigns, organizations the
 * profile founded/moderates, and freeform kind-0 profile fields.
 *
 * On desktop these stack inside the identity rail. On mobile they become
 * the content of the "Overview" tab (with `showOrganizations={false}` so
 * the organizations list moves into the dedicated "Community" tab).
 */
export function ProfileOverviewSections({
  pubkey,
  isOwnProfile,
  campaigns,
  campaignStats,
  pledges,
  btcPrice,
  fields,
  fieldsContent,
  onTabChange,
  showOrganizations = true,
  className,
}: ProfileOverviewSectionsProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Verifier statement (kind 14672) — surfaced first so donors can
          immediately see how this account verifies campaigns. Renders
          nothing when the profile has not published a statement. */}
      <ProfileVerifierSection pubkey={pubkey} />

      {/* Profile fields (rendered upstream) — placed first so the
          profile's own freeform metadata (links, addresses, etc.) is
          the first thing visitors read, ahead of campaigns/orgs. */}
      {fields.length > 0 && (
        <section className="space-y-3">
          <RailSectionHeader icon={null} title={t('profile.sections.profile')} />
          <div className="space-y-3">{fieldsContent}</div>
        </section>
      )}

      {/* Active campaigns */}
      <RailCampaignsSection
        campaigns={campaigns}
        isOwnProfile={isOwnProfile}
        isLoading={campaignStats.isVerifying && campaigns.length === 0}
        onSeeAll={() => onTabChange('campaigns')}
      />

      {/* Latest pledge — surfaced as a fallback when this profile has
          nothing in the Campaigns slot, so the rail still has a piece of
          first-class Agora content in the campaigns slot. */}
      {campaigns.length === 0 && pledges.length > 0 && (
        <RailLatestPledgeSection
          pledges={pledges}
          btcPrice={btcPrice}
          showSeeAll={pledges.length > 1}
          onSeeAll={() => onTabChange('pledges')}
        />
      )}

      {/* Organizations */}
      {showOrganizations && <RailOrganizationsSection pubkey={pubkey} />}
    </div>
  );
}

/**
 * Standalone organizations section — same `RailOrganizationsSection`
 * content used inside the rail's overview, but exposed as a top-level
 * export so the mobile "Community" tab can render it directly.
 *
 * The rendering is identical to the rail's version (same grid, same
 * "See all" overflow dialog). Wrapping it in its own export keeps the
 * tab content honest about where the data is coming from and lets us
 * swap in a richer layout later without touching ProfilePage.
 */
export function ProfileOrganizationsSection({ pubkey, className }: { pubkey: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <RailOrganizationsSection pubkey={pubkey} />
    </div>
  );
}

// ─── Avatar block ────────────────────────────────────────────────────────────

interface ProfileAvatarBlockProps {
  metadata: NostrMetadata | undefined;
  displayName: string;
  status: { text: string | undefined; url: string | undefined } | undefined;
  onLightbox: (url: string) => void;
}

/**
 * Avatar + NIP-38 status bubble. Always rendered as the first thing below
 * the banner; the avatar uses `-mt-16 md:-mt-20` to overlap into the banner
 * area. Must NOT be wrapped in any element with `overflow: hidden` /
 * `overflow-y: auto` or the overhang will be clipped.
 */
export function ProfileAvatarBlock({
  metadata,
  displayName,
  status,
  onLightbox,
}: ProfileAvatarBlockProps) {
  const picture = metadata?.picture;
  return (
    <div className="relative">
      <button
        className="relative z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full -mt-16 md:-mt-20 block"
        onClick={() => picture && onLightbox(picture)}
        disabled={!picture}
      >
        <Avatar className={cn(
          'size-28 md:size-32 border-4 border-background shadow-lg',
          picture && 'cursor-pointer',
        )}>
          <AvatarImage src={picture} alt={displayName} proxyWidth={256} />
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOwnProfile ? (
        <>
          <Link to="/settings/profile" className="flex-1 min-w-[140px]">
            <Button variant="outline" className="rounded-full font-bold w-full">
              {t('profile.header.editProfile')}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-10"
            title={t('profile.header.shareFollowLink')}
            onClick={onFollowQROpen}
          >
            <QrCode className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-10"
            onClick={onMoreMenuOpen}
            title={t('profile.header.moreOptions')}
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
              {t('profile.header.donate')}
            </Button>
          ) : onchainCampaigns.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-full font-bold gap-1.5">
                  <HandHeart className="size-4" />
                  {t('profile.header.donate')}
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
                        {t('profile.header.campaignGoal', { amount: c.goalUsd.toLocaleString() })}
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
            title={t('profile.header.moreOptions')}
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
  totalRaisedSats,
  btcPrice,
  onFollowersOpen,
  onFollowingOpen,
  onTabChange,
}: {
  followersCount: number;
  followingCount: number;
  totalRaisedSats: number;
  btcPrice: number | undefined;
  onFollowersOpen: () => void;
  onFollowingOpen: () => void;
  onTabChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  // Secondary stat rows (one per row). Followers / Following live inline
  // at the top. Campaigns and Pledges are intentionally not surfaced as
  // counts here — the rail's Campaigns and (when relevant) Pledges
  // sections below already show the underlying content directly.
  const rows: Array<{
    icon?: ReactNode;
    label: string;
    value: string;
    onClick?: () => void;
    show: boolean;
  }> = [
    {
      icon: <Bitcoin className="size-3.5 text-primary" />,
      label: t('profile.stats.raised'),
      value: formatCampaignAmount(totalRaisedSats, btcPrice),
      onClick: () => onTabChange('campaigns'),
      show: totalRaisedSats > 0,
    },
  ].filter((r) => r.show);

  const hasFollowRow = followersCount > 0 || followingCount > 0;
  if (!hasFollowRow && rows.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Followers + Following on a single horizontal row. */}
      {hasFollowRow && (
        <div className="flex items-center gap-5 text-sm">
          {followersCount > 0 && (
            <button
              onClick={onFollowersOpen}
              className="flex items-baseline gap-1.5 hover:opacity-80 transition-opacity"
              title={t('profile.stats.followersTitle', { count: followersCount })}
            >
              <span className="font-bold tabular-nums text-foreground">{formatNumber(followersCount)}</span>
              <span className="text-muted-foreground">{t('profile.stats.followers')}</span>
            </button>
          )}
          {followingCount > 0 && (
            <button
              onClick={onFollowingOpen}
              className="flex items-baseline gap-1.5 hover:opacity-80 transition-opacity"
              title={t('profile.stats.followingTitle', { count: followingCount })}
            >
              <span className="font-bold tabular-nums text-foreground">{formatNumber(followingCount)}</span>
              <span className="text-muted-foreground">{t('profile.stats.following')}</span>
            </button>
          )}
        </div>
      )}

      {/* Secondary stat rows. */}
      {rows.length > 0 && (
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
  const { t } = useTranslation();
  const { data: moderation } = useCampaignModeration();
  const visible = isOwnProfile
    ? campaigns
    : campaigns.filter((c) => !moderation.hiddenCoords.has(c.aTag));

  if (isLoading && visible.length === 0) {
    return (
      <section className="space-y-3">
        <RailSectionHeader icon={<Megaphone className="size-4 text-primary" />} title={t('profile.sections.campaigns')} />
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
        title={t('profile.sections.campaigns')}
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
          {more > 0 ? t('profile.sections.seeAllCampaigns', { count: visible.length }) : t('profile.sections.viewCampaignsTab')}
        </button>
      )}
    </section>
  );
}

// ─── Rail Latest Pledge Section ─────────────────────────────────────────────

/**
 * Compact "latest pledge" card shown in the rail when the profile has
 * no campaigns. Picks the newest pledge from the supplied list (sorted
 * by `createdAt` descending) and renders it as a single small card with
 * cover, title, pledged amount, country, and deadline.
 */
function RailLatestPledgeSection({
  pledges,
  btcPrice,
  showSeeAll,
  onSeeAll,
}: {
  pledges: Action[];
  btcPrice: number | undefined;
  showSeeAll: boolean;
  onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  // Pick the newest pledge by created_at. The page query is roughly
  // newest-first already, but sorting here keeps the rail correct
  // regardless of upstream order.
  const latest = [...pledges].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) return null;

  return (
    <section className="space-y-3">
      <RailSectionHeader
        icon={<HandHeart className="size-4 text-primary" />}
        title={t('profile.sections.latestPledge')}
      />
      <PledgeCard action={latest} btcPrice={btcPrice} variant="rail" />
      {showSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm text-primary hover:underline font-medium"
        >
          {t('profile.sections.seeAllPledges', { count: pledges.length })}
        </button>
      )}
    </section>
  );
}

// ─── Rail Organizations Section ─────────────────────────────────────────────

function RailOrganizationsSection({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation();
  const { data: orgs, isLoading } = useProfileOrganizations(pubkey);

  if (isLoading && orgs.length === 0) {
    return (
      <section className="space-y-3">
        <RailSectionHeader icon={<Users className="size-4 text-primary" />} title={t('profile.sections.groups')} />
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
        title={t('profile.sections.groups')}
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
            {t('profile.sections.seeAllGroups', { count: orgs.length })}
          </button>
        </OrganizationsAllDialog>
      )}
    </section>
  );
}

function RailOrgCell({ entry }: { entry: ProfileOrganization }) {
  const { t } = useTranslation();
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
        {entry.isFounder ? t('profile.badges.founder') : t('profile.badges.mod')}
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
      <Skeleton className="size-28 md:size-32 rounded-full -mt-16 md:-mt-20 border-4 border-background" />
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
