import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useEventDashboardConfig } from '@/hooks/useEventDashboardConfig';
import type { TrackedRegion } from '@/hooks/useEventDashboardConfig';
import { useMultiHashtagFeed, type RegionFeed } from '@/hooks/useMultiHashtagFeed';
import { useDashboardCounts } from '@/hooks/useDashboardCounts';
import { getStateCodeForHashtag, getStateByCode, getMunicipalityLabel, extractMunicipalityFromContent } from '@/lib/venezuelaTerritorial';
import { getActiveTrackedCodes, getCoveredStates } from '@/lib/territorialCoverage';
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

  const { globalCount, stateCounts } = useDashboardCounts(config.regions, config.since, { enabled });

  // Clock tick (10s) so time-relative KPIs recompute even when data is unchanged.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(id);
  }, [enabled]);

  // Pre-build region lookup for O(1) access inside displayFeeds aggregation.
  const regionById = useMemo(() => {
    const map = new Map<string, TrackedRegion>();
    for (const r of config.regions) map.set(r.id, r);
    return map;
  }, [config.regions]);

  // Aggregate regionFeeds into displayFeeds based on territorial level
  const displayFeeds = useMemo<AggregatedFeed[]>(() => {
    // Custom/free-form entries (no type) pass through as their own row in all views
    const customFeeds: AggregatedFeed[] = [];

    if (territorialLevel === 'states') {
      const stateMap = new Map<string, { label: string; postMap: Map<string, NostrEvent> }>();

      for (const feed of regionFeeds) {
        const region = regionById.get(feed.regionId);
        if (!region?.type) {
          if (region && feed.count > 0) {
            customFeeds.push({
              regionId: feed.regionId,
              label: region.label,
              code: region.code || region.hashtags[0] || '',
              posts: feed.posts,
              count: feed.count,
            });
          }
          continue;
        }
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

      const stateFeeds = Array.from(stateMap.entries()).map(([code, { label, postMap }]) => {
        const posts = Array.from(postMap.values()).sort((a, b) => b.created_at - a.created_at);
        return { regionId: code, label, code, posts, count: posts.length };
      });

      return [...stateFeeds, ...customFeeds];
    }

    // Municipalities view: use municipality-type regions directly
    const muniMap = new Map<string, { label: string; postMap: Map<string, NostrEvent> }>();

    for (const feed of regionFeeds) {
      const region = regionById.get(feed.regionId);
      if (!region?.type) {
        if (region && feed.count > 0) {
          customFeeds.push({
            regionId: feed.regionId,
            label: region.label,
            code: region.code || region.hashtags[0] || '',
            posts: feed.posts,
            count: feed.count,
          });
        }
        continue;
      }
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
        const stateCode = region.code || region.hashtags[0] || '';
        // State feeds: distribute posts to municipality buckets via t-tags,
        // with content-scan fallback for legacy posts that lack municipality tags.
        for (const post of feed.posts) {
          let resolved: string | undefined;
          for (const [name, value] of post.tags) {
            if (name !== 't') continue;
            if (getMunicipalityLabel(value)) { resolved = value; break; }
          }
          // Content fallback: only if post has no municipality tag.
          // Same-state guard: only accept if candidate belongs to this state.
          if (!resolved) {
            const candidate = extractMunicipalityFromContent(post.content);
            if (candidate && candidate.slice(0, 2) === stateCode) {
              resolved = candidate;
            }
          }
          if (resolved) {
            const resolvedLabel = getMunicipalityLabel(resolved);
            if (!resolvedLabel) continue;
            if (!muniMap.has(resolved)) {
              muniMap.set(resolved, { label: resolvedLabel, postMap: new Map() });
            }
            muniMap.get(resolved)!.postMap.set(post.id, post);
          }
        }
      }
    }

    const muniFeeds = Array.from(muniMap.entries()).map(([code, { label, postMap }]) => {
      const posts = Array.from(postMap.values()).sort((a, b) => b.created_at - a.created_at);
      return { regionId: code, label, code, posts, count: posts.length };
    }).filter((f) => f.count > 0);

    return [...muniFeeds, ...customFeeds];
  }, [regionFeeds, regionById, territorialLevel]);

  // Helper: apply relay COUNT as a stable floor for state-level counts.
  // Used only in leaderboard/distribution, NOT in participants.
  const getStableCount = useCallback((feed: AggregatedFeed): number =>
    territorialLevel === 'states'
      ? Math.max(feed.count, stateCounts?.get(feed.code) ?? 0)
      : feed.count,
  [territorialLevel, stateCounts]);

  // Count posts attributed to municipalities via content-scan fallback only.
  // These posts have the state-level t-tag but lack a municipality t-tag.
  // Deduplicated by event ID since the same post can appear in multiple feeds.
  const legacyDetected = useMemo(() => {
    const legacyIds = new Set<string>();
    for (const feed of regionFeeds) {
      const region = regionById.get(feed.regionId);
      if (region?.type !== 'state') continue;
      const stateCode = region.code || region.hashtags[0] || '';
      for (const post of feed.posts) {
        if (legacyIds.has(post.id)) continue;
        // Check if post already has a municipality t-tag
        const hasMuniTag = post.tags.some(
          ([name, value]) => name === 't' && getMunicipalityLabel(value) !== undefined,
        );
        if (hasMuniTag) continue;
        // Check if content-scan would resolve a municipality
        const candidate = extractMunicipalityFromContent(post.content);
        if (candidate && candidate.slice(0, 2) === stateCode) {
          legacyIds.add(post.id);
        }
      }
    }
    return legacyIds.size;
  }, [regionFeeds, regionById]);

  // Derive KPIs
  const kpis = useMemo<DashboardKpis>(() => {
    const viewPostMap = new Map<string, NostrEvent>();
    for (const feed of displayFeeds) {
      for (const post of feed.posts) {
        viewPostMap.set(post.id, post);
      }
    }
    const viewPosts = Array.from(viewPostMap.values());

    const fiveMinutesAgo = now - 300;
    const thirtySecondsAgo = now - 30;

    const activeCodes = getActiveTrackedCodes(config);

    return {
      totalPosts: territorialLevel === 'states'
        ? Math.max(globalCount ?? 0, viewPosts.length)
        : viewPosts.length,
      activeRegions: displayFeeds.filter((f) => f.posts[0]?.created_at > thirtySecondsAgo).length,
      trackedCount: territorialLevel === 'states'
        ? getCoveredStates(activeCodes).length
        : config.regions.filter((r) => r.type === 'municipality').length,
      allCodesTracked: activeCodes.size,
      last5min: viewPosts.filter((p) => p.created_at > fiveMinutesAgo).length,
      uniquePosters: new Set(viewPosts.map((p) => p.pubkey)).size,
      legacyDetected,
    };
  }, [displayFeeds, config, territorialLevel, now, globalCount, legacyDetected]);

  // Time series
  const timeSeries = useMemo(() => buildTimeSeries(regionFeeds), [regionFeeds]);

  // Leaderboard (top 5) — uses stable COUNT floor for state-level
  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    return [...displayFeeds]
      .map((feed) => ({ ...feed, stableCount: getStableCount(feed) }))
      .sort((a, b) => b.stableCount - a.stableCount)
      .slice(0, 5)
      .map((feed, i) => ({ rank: i + 1, regionId: feed.regionId, label: feed.label, count: feed.stableCount }));
  }, [displayFeeds, getStableCount]);

  // Distribution donut — uses stable COUNT floor for state-level
  const distribution = useMemo(() => {
    const stableFeeds = displayFeeds.map((feed) => ({ ...feed, count: getStableCount(feed) }));
    return buildDistribution(stableFeeds);
  }, [displayFeeds, getStableCount]);

  // Participants (full sorted list).
  // Intentionally uses raw event-based counts (no COUNT floor) because each
  // row derives live/activity state from the loaded events themselves.
  const participants = useMemo<ParticipantRow[]>(() => {
    const thirtySecondsAgo = now - 30;
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
  }, [displayFeeds, now]);

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

      // Content fallback: resolve municipality from content for legacy posts
      if (regionLabel === 'Unknown') {
        const contentMuni = extractMunicipalityFromContent(post.content);
        if (contentMuni && labelMap.has(contentMuni)) {
          regionLabel = labelMap.get(contentMuni)!;
        }
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

  // Status — useMultiHashtagFeed swallows relay errors so `error` is always
  // null in practice. We keep the DashboardStatus type unchanged (consumers
  // may still reference 'disconnected') but never produce it here.
  const hasData = globalPosts.length > 0;
  const status: DashboardStatus = isLoading && !hasData
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
    isLoading: isLoading && !hasData,
    error: error as Error | null,
  };
}
