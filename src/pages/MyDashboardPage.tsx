import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  AtSign,
  Bell,
  ChevronRight,
  Globe2,
  HandHeart,
  Heart,
  Megaphone,
  MessageCircle,
  Repeat2,
  Users,
} from 'lucide-react';

import { LoginArea } from '@/components/auth/LoginArea';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { StartCampaignLink } from '@/components/StartCampaignLink';
import {
  CommunityMiniCard,
  CommunityMiniCardSkeleton,
} from '@/components/discovery/CommunityMiniCard';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { CountryFlag } from '@/components/CountryFlag';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCountryFollows } from '@/hooks/useCountryFollows';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotificationPreview } from '@/hooks/useNotificationPreview';
import { useUserOrganizations, type UserOrganization } from '@/hooks/useUserOrganizations';

import { getCountryInfo } from '@/lib/countries';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import type { ParsedCampaign } from '@/lib/campaign';

/**
 * `/my-dashboard` — **My Dashboard**: the logged-in user's personal home base.
 *
 * Three visual zones:
 *
 *  1. **Personal hero** — avatar, greeting, three stat tiles derived from
 *     already-loaded section data (zero extra queries).
 *  2. **Utility strip** — notification preview (`useNotificationPreview`,
 *     limit 3 one-shot query, no persistent subscription).
 *  3. **Content sections** — user's campaigns, countries, communities.
 *     Each section loads independently with skeleton / empty / error states
 *     and an `ErrorBoundary` so one relay timeout does not break the page.
 *
 * All data hooks are called once in `LoggedInContent` and passed down so
 * TanStack Query subscriptions are shared rather than duplicated.
 *
 * Total cost: campaign, country, and community relay queries; and one
 * lightweight notification preview query (all cached by their
 * respective hooks).
 */
export function MyDashboardPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `My Dashboard | ${config.appName}`,
    description:
      'Your campaigns, communities, and causes in one place.',
  });

  if (!user) {
    return <LoggedOutState />;
  }

  return <LoggedInContent pubkey={user.pubkey} />;
}

/**
 * Inner component rendered only when a user is logged in. This boundary
 * ensures that `useCampaigns` (which has no internal `enabled` guard)
 * never fires unnecessary `limit: 0` relay requests for logged-out visitors.
 * `useCountryFollows` and `useUserOrganizations` already guard internally, but
 * co-locating all data hooks here keeps the pattern consistent.
 */
function LoggedInContent({ pubkey }: { pubkey: string }) {
  // ── Data hooks (called once, shared with hero + content sections) ──────
  const campaignsQuery = useCampaigns(
    { authors: [pubkey], limit: 24 },
  );
  const countryFollows = useCountryFollows();
  const communitiesQuery = useUserOrganizations();

  return (
    <main className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-5 sm:space-y-6 pt-6">
        {/* Zone 1: Personal hero */}
        <ErrorBoundary fallback={null}>
          <HeroCard
            pubkey={pubkey}
            campaignsCount={campaignsQuery.data?.length}
            campaignsLoading={campaignsQuery.isLoading}
            countriesCount={countryFollows.followedCountries.length}
            countriesLoading={countryFollows.isLoading}
            communitiesCount={communitiesQuery.data?.length}
            communitiesLoading={communitiesQuery.isLoading}
          />
        </ErrorBoundary>

        {/* Zone 2: Notifications */}
        <ErrorBoundary fallback={null}>
          <NotificationCard />
        </ErrorBoundary>

        {/* Zone 3: Content sections */}
        <ErrorBoundary
          fallback={<SectionError label="Your campaigns" />}
        >
          <CampaignsSection campaignsQuery={campaignsQuery} />
        </ErrorBoundary>

        <ErrorBoundary
          fallback={<SectionError label="Countries you follow" />}
        >
          <CountriesSection
            followedCountries={countryFollows.followedCountries}
            isLoading={countryFollows.isLoading}
          />
        </ErrorBoundary>

        <ErrorBoundary
          fallback={<SectionError label="Your communities" />}
        >
          <CommunitiesSection communitiesQuery={communitiesQuery} />
        </ErrorBoundary>
      </div>
    </main>
  );
}

// ─── Logged-out state ────────────────────────────────────────────────────────

function LoggedOutState() {
  return (
    <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
      <div className="p-4 rounded-full bg-primary/10">
        <Megaphone className="size-8 text-primary" />
      </div>
      <div className="space-y-2 max-w-xs">
        <h2 className="text-xl font-bold">My Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          Log in to see your campaigns, communities, and countries in one place.
        </p>
      </div>
      <LoginArea className="max-w-60" />
    </div>
  );
}

// ─── Zone 1: Personal hero card ──────────────────────────────────────────────

function HeroCard({
  pubkey,
  campaignsCount,
  campaignsLoading,
  countriesCount,
  countriesLoading,
  communitiesCount,
  communitiesLoading,
}: {
  pubkey: string;
  campaignsCount: number | undefined;
  campaignsLoading: boolean;
  countriesCount: number;
  countriesLoading: boolean;
  communitiesCount: number | undefined;
  communitiesLoading: boolean;
}) {
  const { metadata } = useCurrentUser();
  const avatar = sanitizeUrl(metadata?.picture);
  const displayName = getDisplayName(metadata, pubkey);

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm bg-gradient-to-br from-primary/[0.06] via-background to-background">
      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* Greeting row */}
        <div className="flex items-center gap-3.5">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="size-12 rounded-full object-cover ring-2 ring-primary/20 shrink-0"
            />
          ) : (
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/20">
              <span className="text-lg font-semibold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              Welcome back, {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Your campaigns, communities, and causes in one place.
            </p>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            icon={<HandHeart className="size-3.5" />}
            count={campaignsCount}
            label="Campaigns"
            isLoading={campaignsLoading}
          />
          <StatTile
            icon={<Globe2 className="size-3.5" />}
            count={countriesCount}
            label="Countries"
            isLoading={countriesLoading}
          />
          <StatTile
            icon={<Users className="size-3.5" />}
            count={communitiesCount}
            label="Communities"
            isLoading={communitiesLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({
  icon,
  count,
  label,
  isLoading,
}: {
  icon: React.ReactNode;
  count: number | undefined;
  label: string;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-background/80 border border-border/50 py-2.5 px-1">
      <span className="text-muted-foreground">{icon}</span>
      {isLoading ? (
        <Skeleton className="h-5 w-6 rounded" />
      ) : (
        <span className="text-base font-semibold tabular-nums">{count ?? 0}</span>
      )}
      <span className="text-[10px] text-muted-foreground font-medium leading-none">
        {label}
      </span>
    </div>
  );
}

// ─── Zone 2: Notification summary ────────────────────────────────────────────

/**
 * Notification card with a compact preview of up to 3 recent items.
 *
 * Uses `useNotificationPreview` — one-shot `useQuery` with `limit: 3`,
 * `since: cursor + 1`, 60 s poll. No persistent subscription, no
 * referenced-event batch-fetch, no infinite scroll.
 *
 * Each preview row shows: kind icon + actor name + action label + relative
 * time. Actor metadata comes from `useAuthor` (bounded to 3 calls).
 */
function NotificationCard() {
  const { events, isLoading } = useNotificationPreview();
  const hasUnread = events.length > 0;

  return (
    <Link
      to="/notifications"
      className={cn(
        'group block rounded-xl border border-border/60 bg-card p-4 shadow-sm',
        'hover:shadow-md hover:border-border motion-safe:transition-all motion-safe:duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Bell className="size-4" />
          Notifications
        </div>
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-muted-foreground motion-safe:transition-colors" />
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      ) : hasUnread ? (
        <div className="space-y-2.5">
          {events.map((event) => (
            <NotificationPreviewRow key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">All caught up</p>
      )}
    </Link>
  );
}

/** Maps a notification event kind to an icon and action verb (without actor). */
function getNotificationAction(kind: number): { icon: React.ReactNode; verb: string } {
  switch (kind) {
    case 7:
      return { icon: <Heart className="size-3.5 text-pink-500 shrink-0" />, verb: 'reacted to your post' };
    case 6:
    case 16:
      return { icon: <Repeat2 className="size-3.5 text-green-500 shrink-0" />, verb: 'reposted your post' };
    case 1:
      return { icon: <AtSign className="size-3.5 text-blue-500 shrink-0" />, verb: 'mentioned you' };
    case 1111:
    case 1222:
    case 1244:
      return { icon: <MessageCircle className="size-3.5 text-sky-500 shrink-0" />, verb: 'commented' };
    default:
      return { icon: <Bell className="size-3.5 text-muted-foreground shrink-0" />, verb: 'sent a notification' };
  }
}

/** Formats a unix timestamp as a short relative string (e.g. "2m", "3h"). */
function shortRelativeTime(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86_400)}d`;
}

/** Compact one-line preview: "[avatar] Alice reacted to your post  2m" */
function NotificationPreviewRow({ event }: { event: NostrEvent }) {
  const actorPubkey = event.pubkey;
  const author = useAuthor(actorPubkey);
  const metadata = author.data?.metadata;
  const actorName = getDisplayName(metadata, actorPubkey);
  const avatar = sanitizeUrl(metadata?.picture);
  const { icon, verb } = getNotificationAction(event.kind);

  return (
    <div className="flex items-center gap-2 text-sm min-w-0">
      {avatar ? (
        <img src={avatar} alt="" className="size-4 rounded-full object-cover shrink-0" />
      ) : (
        icon
      )}
      <span className="flex-1 truncate text-muted-foreground">
        <span className="font-medium text-foreground">{actorName}</span>{' '}{verb}
      </span>
      <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
        {shortRelativeTime(event.created_at)}
      </span>
    </div>
  );
}

// ─── Zone 3: Grouped campaigns ───────────────────────────────────────────────

function CampaignsSection({
  campaignsQuery,
}: {
  campaignsQuery: { data: ParsedCampaign[] | undefined; isLoading: boolean };
}) {
  const campaigns = campaignsQuery.data;
  const isLoading = campaignsQuery.isLoading;
  const hasCampaigns = !isLoading && campaigns && campaigns.length > 0;

  return (
    <section>
      <SectionHeader title="Your campaigns" className="px-0 pb-1 sm:px-0" />

      {!isLoading && !hasCampaigns ? (
        <div className="pt-2">
          <EmptyShelf
            icon={<HandHeart className="size-7 text-primary" />}
            title="No campaigns yet"
            body="Start a fundraiser, tell your story, and share it with the world."
            ctaLabel="Start a campaign"
            ctaTo="/campaigns/new"
          />
        </div>
      ) : (
        <div className="-mx-4 sm:mx-0 pt-1">
          {isLoading ? (
            <CampaignShelfSkeleton />
          ) : (
            <HorizontalScroll className="sm:px-0">
              {(campaigns ?? []).map((campaign) => (
                <div key={campaign.aTag} className="w-72 shrink-0 flex">
                  <CampaignCard campaign={campaign} className="flex-1" />
                </div>
              ))}
            </HorizontalScroll>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Countries I follow ──────────────────────────────────────────────────────

function CountriesSection({
  followedCountries,
  isLoading,
}: {
  followedCountries: string[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <section>
      <SectionHeader
        title="Countries you follow"
        seeAllLabel="Explore the world"
        onSeeAll={() => navigate('/world')}
        className="px-0 pb-3 sm:px-0"
      />
      {isLoading ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-28 rounded-xl shrink-0" />
          ))}
        </div>
      ) : followedCountries.length > 0 ? (
        <div className="flex gap-2 flex-wrap pb-1">
          {followedCountries.map((code) => {
            const info = getCountryInfo(code);
            const name = info?.subdivisionName ?? info?.name ?? code;
            const flag = info?.flag ?? '';

            return (
              <Link
                key={code}
                to={`/i/iso3166:${code}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium',
                  'bg-gradient-to-br from-amber-100/30 via-rose-100/20 to-amber-50/20',
                  'dark:from-amber-900/20 dark:via-rose-900/15 dark:to-amber-950/15',
                  'border border-amber-200/40 dark:border-amber-800/40',
                  'shadow-sm hover:shadow-md hover:-translate-y-0.5',
                  'motion-safe:transition-all motion-safe:duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                <CountryFlag code={code} emoji={flag} label={name} className="text-2xl" />
                <span>{name}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyShelf
          icon={<Globe2 className="size-7 text-primary" />}
          title="No countries followed"
          body="Follow countries to stay updated on campaigns and conversations happening there."
          ctaLabel="Explore the world"
          ctaTo="/world"
        />
      )}
    </section>
  );
}

// ─── My communities ──────────────────────────────────────────────────────────

function CommunitiesSection({
  communitiesQuery,
}: {
  communitiesQuery: { data: UserOrganization[]; isLoading: boolean };
}) {
  const navigate = useNavigate();
  const communities = communitiesQuery.data;
  const isLoading = communitiesQuery.isLoading;

  return (
    <section>
      <SectionHeader
        title="Your communities"
        seeAllLabel="All communities"
        onSeeAll={
          communities && communities.length > 0
            ? () => navigate('/communities')
            : undefined
        }
        className="px-0 pb-3 sm:px-0"
      />
      {/* Break out of page px-4 on mobile so shelves bleed to screen edges */}
      <div className="-mx-4 sm:mx-0">
        {isLoading ? (
          <HorizontalScroll className="sm:px-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <CommunityMiniCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
        ) : communities && communities.length > 0 ? (
          <HorizontalScroll className="sm:px-0">
            {communities.slice(0, 12).map((entry) => (
              <CommunityMiniCard
                key={entry.community.aTag}
                community={entry.community}
              />
            ))}
          </HorizontalScroll>
        ) : (
          <div className="px-4 sm:px-0">
            <EmptyShelf
              icon={<Users className="size-7 text-primary" />}
              title="No communities yet"
              body="Join a community or start your own to organize around a shared cause."
              ctaLabel="Browse communities"
              ctaTo="/communities"
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** File-local horizontal scroll container for shelf sections. */
function HorizontalScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1', className)}>
      {children}
    </div>
  );
}

function CampaignShelfSkeleton() {
  return (
    <HorizontalScroll className="sm:px-0">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0">
          <CampaignCardSkeleton />
        </div>
      ))}
    </HorizontalScroll>
  );
}

function EmptyShelf({
  icon,
  title,
  body,
  ctaLabel,
  ctaTo,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 px-6 text-center space-y-3 flex flex-col items-center">
        <div className="p-3 rounded-full bg-primary/10">{icon}</div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {body}
          </p>
        </div>
        {ctaLabel && ctaTo && (
          <Button asChild className="rounded-full mt-1">
            {ctaTo === '/campaigns/new' ? (
              <StartCampaignLink>{ctaLabel}</StartCampaignLink>
            ) : (
              <Link to={ctaTo}>{ctaLabel}</Link>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SectionError({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-6 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {label} failed to load.{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-primary hover:underline"
          >
            Reload page
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

export default MyDashboardPage;
