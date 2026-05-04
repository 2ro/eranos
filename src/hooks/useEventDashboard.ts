import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useEventDashboardConfig } from '@/hooks/useEventDashboardConfig';
import { useMultiHashtagFeed, type RegionFeed } from '@/hooks/useMultiHashtagFeed';
import { getStateCodeForHashtag, getStateByCode, getMunicipalityLabel } from '@/lib/venezuelaTerritorial';
import type {
  TerritorialLevel,
  DashboardStatus,
  DashboardKpis,
  TimeSeriesBucket,
  LeaderboardEntry,
  DistributionSlice,
  ParticipantRow,
  ActivityItem,
} from '@/components/event-dashboard/types';

const REGION_COLORS = [
  'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)', 'hsl(270, 70%, 60%)', 'hsl(180, 70%, 45%)',
  'hsl(330, 80%, 55%)',
];

interface UseEventDashboardOptions {
  /** Must be true for relay queries to fire. Pass isAdmin(user.pubkey). */
  enabled: boolean;
  /** Current territorial view level. */
  territorialLevel: TerritorialLevel;
}

interface UseEventDashboardResult {
  kpis: DashboardKpis;
  timeSeries: TimeSeriesBucket[];
  leaderboard: LeaderboardEntry[];
  distribution: DistributionSlice[];
  participants: ParticipantRow[];
  activity: ActivityItem[];
  status: DashboardStatus;
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface AggregatedFeed {
  regionId: string;
  label: string;
  code: string;
  posts: NostrEvent[];
  count: number;
}

function buildTimeSeries(regionFeeds: RegionFeed[]): TimeSeriesBucket[] {
  const now = Math.floor(Date.now() / 1000);
  const bucketSize = 300;
  const bucketCount = 12;
  const start = now - bucketCount * bucketSize;

  const counts: number[] = Array(bucketCount).fill(0);
  const posterSets: Set<string>[] = Array.from({ length: bucketCount }, () => new Set());

  const seen = new Set<string>();
  for (const feed of regionFeeds) {
    for (const post of feed.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      if (post.created_at < start) continue;
      const idx = Math.floor((post.created_at - start) / bucketSize);
      if (idx >= 0 && idx < bucketCount) {
        counts[idx]++;
        posterSets[idx].add(post.pubkey);
      }
    }
  }

  return Array.from({ length: bucketCount }, (_, i) => {
    const t = start + i * bucketSize;
    const d = new Date(t * 1000);
    return {
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
      posts: counts[i],
      posters: posterSets[i].size,
    };
  });
}

function buildDistribution(feeds: AggregatedFeed[]): DistributionSlice[] {
  const sorted = [...feeds].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const othersCount = rest.reduce((sum, f) => sum + f.count, 0);

  const slices: DistributionSlice[] = top.map((feed, i) => ({
    name: feed.label,
    value: feed.count,
    fill: REGION_COLORS[i % REGION_COLORS.length],
  }));

  if (othersCount > 0) {
    slices.push({ name: 'Others', value: othersCount, fill: 'hsl(0, 0%, 70%)' });
  }

  return slices;
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useEventDashboard({ enabled, territorialLevel }: UseEventDashboardOptions): UseEventDashboardResult {
  const { config } = useEventDashboardConfig();

  const { regionFeeds, globalPosts, isLoading, isBackfilling, error } =
    useMultiHashtagFeed(config.regions, config.since, { enabled });

  // Aggregate regionFeeds into displayFeeds based on territorial level
  const displayFeeds = useMemo<AggregatedFeed[]>(() => {
    if (territorialLevel === 'states') {
      const stateMap = new Map<string, { label: string; postMap: Map<string, NostrEvent> }>();

      for (const feed of regionFeeds) {
        const region = config.regions.find((r) => r.id === feed.regionId);
        if (!region?.type) continue;
        const code = region.code || region.hashtags[0] || '';
        const stateCode = getStateCodeForHashtag(code);
        if (!stateCode) continue;

        if (!stateMap.has(stateCode)) {
          const stateInfo = getStateByCode(stateCode);
          stateMap.set(stateCode, { label: stateInfo?.label ?? stateCode, postMap: new Map() });
        }
        const group = stateMap.get(stateCode)!;
        for (const post of feed.posts) {
          group.postMap.set(post.id, post);
        }
      }

      return Array.from(stateMap.entries()).map(([code, { label, postMap }]) => {
        const posts = Array.from(postMap.values()).sort((a, b) => b.created_at - a.created_at);
        return { regionId: code, label, code, posts, count: posts.length };
      });
    }

    // Municipalities view: use municipality-type regions directly
    const muniMap = new Map<string, { label: string; postMap: Map<string, NostrEvent> }>();

    for (const feed of regionFeeds) {
      const region = config.regions.find((r) => r.id === feed.regionId);
      if (!region?.type) continue;
      const code = region.code || region.hashtags[0] || '';

      if (region.type === 'municipality') {
        if (!muniMap.has(code)) {
          muniMap.set(code, { label: getMunicipalityLabel(code) ?? region.label, postMap: new Map() });
        }
        const bucket = muniMap.get(code)!;
        for (const post of feed.posts) {
          bucket.postMap.set(post.id, post);
        }
      } else if (region.type === 'state') {
        // State feeds: distribute posts to municipality buckets via t-tags
        for (const post of feed.posts) {
          for (const [name, value] of post.tags) {
            if (name !== 't') continue;
            if (getMunicipalityLabel(value)) {
              if (!muniMap.has(value)) {
                muniMap.set(value, { label: getMunicipalityLabel(value)!, postMap: new Map() });
              }
              muniMap.get(value)!.postMap.set(post.id, post);
              break;
            }
          }
        }
      }
    }

    return Array.from(muniMap.entries()).map(([code, { label, postMap }]) => {
      const posts = Array.from(postMap.values()).sort((a, b) => b.created_at - a.created_at);
      return { regionId: code, label, code, posts, count: posts.length };
    }).filter((f) => f.count > 0);
  }, [regionFeeds, config.regions, territorialLevel]);

  // Derive KPIs
  const kpis = useMemo<DashboardKpis>(() => {
    const viewPostMap = new Map<string, NostrEvent>();
    for (const feed of displayFeeds) {
      for (const post of feed.posts) {
        viewPostMap.set(post.id, post);
      }
    }
    const viewPosts = Array.from(viewPostMap.values());

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    const thirtySecondsAgo = Math.floor(Date.now() / 1000) - 30;

    return {
      totalPosts: viewPosts.length,
      activeRegions: displayFeeds.filter((f) => f.posts[0]?.created_at > thirtySecondsAgo).length,
      trackedCount: territorialLevel === 'states'
        ? config.regions.filter((r) => r.type === 'state').length
        : config.regions.filter((r) => r.type === 'municipality').length,
      allCodesTracked: new Set(config.regions.flatMap((r) => r.hashtags)).size,
      last5min: viewPosts.filter((p) => p.created_at > fiveMinutesAgo).length,
      uniquePosters: new Set(viewPosts.map((p) => p.pubkey)).size,
    };
  }, [displayFeeds, config.regions, territorialLevel]);

  // Time series
  const timeSeries = useMemo(() => buildTimeSeries(regionFeeds), [regionFeeds]);

  // Leaderboard (top 5)
  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    return [...displayFeeds]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((feed, i) => ({ rank: i + 1, regionId: feed.regionId, label: feed.label, count: feed.count }));
  }, [displayFeeds]);

  // Distribution donut
  const distribution = useMemo(() => buildDistribution(displayFeeds), [displayFeeds]);

  // Participants (full sorted list)
  const participants = useMemo<ParticipantRow[]>(() => {
    const thirtySecondsAgo = Math.floor(Date.now() / 1000) - 30;
    return [...displayFeeds]
      .sort((a, b) => b.count - a.count)
      .map((feed, i) => ({
        rank: i + 1,
        regionId: feed.regionId,
        label: feed.label,
        hashtag: feed.code,
        count: feed.count,
        isActive: feed.posts.length > 0 && feed.posts[0].created_at > thirtySecondsAgo,
      }));
  }, [displayFeeds]);

  // Activity items (from globalPosts with label resolution)
  const activity = useMemo<ActivityItem[]>(() => {
    // Build code → label map from displayFeeds
    const labelMap = new Map<string, string>();
    for (const f of displayFeeds) labelMap.set(f.code, f.label);

    return globalPosts.slice(0, 50).map((post) => {
      // Resolve region label from post's t-tags
      let regionLabel = 'Unknown';
      for (const [name, value] of post.tags) {
        if (name !== 't') continue;
        if (labelMap.has(value)) { regionLabel = labelMap.get(value)!; break; }
        // Try state resolution
        const stateCode = getStateCodeForHashtag(value);
        if (stateCode && labelMap.has(stateCode)) { regionLabel = labelMap.get(stateCode)!; break; }
      }

      return {
        id: post.id,
        pubkey: post.pubkey,
        content: post.content,
        created_at: post.created_at,
        regionLabel,
      };
    });
  }, [globalPosts, displayFeeds]);

  // Status
  const status: DashboardStatus = isLoading && globalPosts.length === 0
    ? 'connecting'
    : isBackfilling
    ? 'syncing'
    : 'live';

  return {
    kpis,
    timeSeries,
    leaderboard,
    distribution,
    participants,
    activity,
    status,
    isLoading: isLoading && globalPosts.length === 0,
    error: error as Error | null,
  };
}
