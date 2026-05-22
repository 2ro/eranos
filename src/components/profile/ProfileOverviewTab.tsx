import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';
import { ArrowRight, Megaphone, Sparkles, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NoteCard } from '@/components/NoteCard';
import { useAgoraFeed } from '@/hooks/useAgoraFeed';
import type { FeedItem } from '@/lib/feedUtils';

interface ProfileOverviewTabProps {
  pubkey: string;
  displayName: string;
  isOwnProfile: boolean;
  /** Recent posts (kind 1 / 6) by this user, already filtered upstream. */
  recentPosts: FeedItem[];
  onSeeAllPosts: () => void;
  onSeeAllActivity: () => void;
}

/**
 * Overview is the default landing tab for a profile.
 *
 * The identity rail to the left already carries this user's active
 * campaigns and organizations as standing facts. Overview therefore
 * doesn't repeat them — it focuses on what the user has *been doing*:
 *
 *   1. Recent activity — first 5–8 items from useAgoraFeed scoped to
 *      this author. Mixed kinds (campaigns, pledges, comments, zaps).
 *   2. Recent posts    — first 3 kind 1 / 6 notes for the "still Nostr"
 *      touchpoint.
 *
 * If both sections are empty we show a friendly empty state with
 * own-profile CTAs.
 */
export function ProfileOverviewTab({
  pubkey,
  displayName,
  isOwnProfile,
  recentPosts,
  onSeeAllPosts,
  onSeeAllActivity,
}: ProfileOverviewTabProps) {
  const { events: activityEvents, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAgoraFeed(true, { authors: [pubkey] });

  const previewActivity = useMemo(() => activityEvents.slice(0, 8), [activityEvents]);

  const { ref: sentinelRef, inView } = useInView({ threshold: 0 });
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && activityEvents.length < 8) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, activityEvents.length]);

  const hasActivity = previewActivity.length > 0;
  const hasPosts = recentPosts.length > 0;
  const isFullyEmpty = !hasActivity && !hasPosts;

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
          {/* Off-screen sentinel that lazily pulls another page so the
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
