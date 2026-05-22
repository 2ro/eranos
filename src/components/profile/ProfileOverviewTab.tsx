import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';
import { ArrowRight, Megaphone, Sparkles, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CampaignCard } from '@/components/CampaignCard';
import { NoteCard } from '@/components/NoteCard';
import { useAgoraFeed } from '@/hooks/useAgoraFeed';
import type { FeedItem } from '@/lib/feedUtils';
import type { ParsedCampaign } from '@/lib/campaign';

interface ProfileOverviewTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  campaigns: ParsedCampaign[];
  /** Recent posts (kind 1 / 6) by this user, already filtered upstream. */
  recentPosts: FeedItem[];
  onSeeAllPosts: () => void;
  onSeeAllActivity: () => void;
  onSeeAllCampaigns: () => void;
}

/**
 * Overview is the default landing tab for a profile — a composite of
 * the highest-signal sections so a visitor sees what someone is *doing*
 * on Agora before they decide which detail tab to drill into.
 *
 * Sections (each renders only when there's content):
 *
 *  1. Featured campaign  — the user's campaign with the most raised so far.
 *  2. Recent activity   — first 5–8 items from useAgoraFeed scoped to this
 *     author. Mixed kinds (campaigns, pledges, comments, zaps, etc.).
 *  3. Recent posts       — first 3 kind 1 / 6 notes for the "still Nostr"
 *     touchpoint.
 *
 * If all sections are empty we show a friendly empty state with own-profile
 * CTAs to start a campaign or write a post.
 */
export function ProfileOverviewTab({
  pubkey,
  displayName,
  isOwnProfile,
  campaigns,
  recentPosts,
  onSeeAllPosts,
  onSeeAllActivity,
  onSeeAllCampaigns,
}: ProfileOverviewTabProps) {
  const { events: activityEvents, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAgoraFeed(true, { authors: [pubkey] });

  // Choose a single highlight campaign — first non-hidden one (campaigns are
  // sorted newest-first by useCampaigns). The Strip above already lists all
  // visible ones, so Overview just spotlights one.
  const featured = campaigns[0];

  // Trim activity to a preview. `useAgoraFeed` already returns enriched
  // donation events alongside Agora entities; the first ~8 are typically
  // the freshest activity beats.
  const previewActivity = useMemo(() => activityEvents.slice(0, 8), [activityEvents]);

  // Light infinite-load: if the Overview is the only tab the user looks at
  // and they scroll near the bottom, pull a second page so the visible
  // preview stays fresh. The full timeline still lives in the Activity tab.
  const { ref: sentinelRef, inView } = useInView({ threshold: 0 });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && activityEvents.length < 8) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, activityEvents.length]);

  const hasFeatured = !!featured;
  const hasActivity = previewActivity.length > 0;
  const hasPosts = recentPosts.length > 0;
  const isFullyEmpty = !hasFeatured && !hasActivity && !hasPosts;

  if (isFullyEmpty) {
    return (
      <div className="px-4 sm:px-6 py-12">
        <Card className="border-dashed">
          <div className="py-12 px-8 text-center">
            <Sparkles className="size-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground max-w-sm mx-auto">
              {isOwnProfile
                ? "Nothing here yet. Launch a campaign, create a pledge, or post a note to fill out your profile."
                : `${displayName} hasn't posted anything yet.`}
            </p>
            {isOwnProfile && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/campaigns/new" className="gap-1.5">
                    <Megaphone className="size-4" />
                    Start a campaign
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/pledges/new">Create a pledge</Link>
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8" data-pubkey={pubkey}>
      {/* Featured campaign — single wide card, click-through to the campaign. */}
      {hasFeatured && (
        <section>
          <SectionHeader
            icon={<Megaphone className="size-5 text-primary" />}
            title="Featured campaign"
            onSeeAll={campaigns.length > 1 ? onSeeAllCampaigns : undefined}
            seeAllLabel="All campaigns"
          />
          <CampaignCard campaign={featured} />
        </section>
      )}

      {/* Recent activity — mixed-kind list from the Agora feed. */}
      {hasActivity && (
        <section>
          <SectionHeader
            icon={<Sparkles className="size-5 text-primary" />}
            title="Recent activity"
            onSeeAll={onSeeAllActivity}
            seeAllLabel="See all"
          />
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {previewActivity.map((event) => (
                <NoteCard key={event.id} event={event} />
              ))}
            </div>
          </Card>
          {/* Off-screen sentinel that pulls another page lazily so the
              Overview preview isn't visibly empty for active users. */}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </section>
      )}

      {/* Recent posts — the "still Nostr" section. */}
      {hasPosts && (
        <section>
          <SectionHeader
            icon={<MessageCircle className="size-5 text-primary" />}
            title="Recent posts"
            onSeeAll={onSeeAllPosts}
            seeAllLabel="All posts"
          />
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {recentPosts.map((item) => (
                <NoteCard
                  key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                  event={item.event}
                  repostedBy={item.repostedBy}
                />
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  onSeeAll,
  seeAllLabel,
}: {
  icon: React.ReactNode;
  title: string;
  onSeeAll?: () => void;
  seeAllLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {icon}
        {title}
      </h2>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
        >
          {seeAllLabel}
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
