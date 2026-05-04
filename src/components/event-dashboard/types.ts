/** Territorial aggregation level for the dashboard view. */
export type TerritorialLevel = 'municipalities' | 'states';

/** Dashboard connection/sync status indicator. */
export type DashboardStatus = 'connecting' | 'syncing' | 'live' | 'disconnected';

/** KPI metrics displayed in the top card grid. */
export interface DashboardKpis {
  totalPosts: number;
  activeRegions: number;
  trackedCount: number;
  allCodesTracked: number;
  last5min: number;
  uniquePosters: number;
}

/** A single bucket in the publishing activity time-series chart. */
export interface TimeSeriesBucket {
  /** Display label, e.g. "14:30" */
  time: string;
  /** Total posts in this interval. */
  posts: number;
  /** Unique pubkeys that posted in this interval. */
  posters: number;
}

/** An entry in the top-5 leaderboard bar chart. */
export interface LeaderboardEntry {
  rank: number;
  regionId: string;
  label: string;
  count: number;
}

/** A slice in the post-distribution donut chart. */
export interface DistributionSlice {
  name: string;
  value: number;
  fill: string;
}

/** A row in the full participants/regions ranked list. */
export interface ParticipantRow {
  rank: number;
  regionId: string;
  label: string;
  hashtag: string;
  count: number;
  isActive: boolean;
}

/** A single entry in the recent activity feed. */
export interface ActivityItem {
  id: string;
  pubkey: string;
  displayName: string;
  avatarUrl?: string;
  content: string;
  created_at: number;
  regionLabel: string;
}
