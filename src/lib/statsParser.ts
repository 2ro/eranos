import type { NostrEvent } from '@nostrify/nostrify';

// ── Leaderboard row types ────────────────────────────────────────────────────

export interface TopAction {
  /** a-tag coordinate: "36639:<pubkey>:<d-tag>" */
  aTag: string;
  title: string;
  submissions: number;
  bounty: number;
}

export interface TopPoster {
  pubkey: string;
  count: number;
}

export interface TrendingHashtag {
  tag: string;
  count: number;
}

export interface TopDonor {
  pubkey: string;
  totalSats: number;
}

// ── Timeframe + aggregate types ──────────────────────────────────────────────

export type StatsTimeframe = '7d' | '30d' | '90d' | 'all';

/** Aggregate count metric names. */
export type StatName = 'commentCnt' | 'authorCnt' | 'submissionCnt';

export interface TimeframedStats {
  topPosters: TopPoster[];
  trendingHashtags: TrendingHashtag[];
  topDonors: TopDonor[];
  topActions: TopAction[];
}

export interface TrustedCountryStats {
  /** Aggregate counts keyed by metric, then by timeframe. */
  counts: Record<StatName, Record<StatsTimeframe, number>>;
  /** Leaderboards per timeframe. */
  byTimeframe: Record<StatsTimeframe, TimeframedStats>;
  /** `created_at` of the parsed event. */
  updatedAt: number;
  /** Pubkey that published the event. */
  provider: string;
}

// ── Tag helpers ──────────────────────────────────────────────────────────────

function getTagValue(tags: string[][], name: string): number {
  const tag = tags.find(([n]) => n === name);
  return tag && tag[1] ? parseInt(tag[1], 10) || 0 : 0;
}

function getRepeatedTags(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
}

/** Mapping from StatName to its tag-name base in the published event. */
const STAT_TAG_NAMES: Record<StatName, string> = {
  commentCnt: 'comment_cnt',
  authorCnt: 'author_cnt',
  submissionCnt: 'submission_cnt',
};

const TIMEFRAMES: StatsTimeframe[] = ['7d', '30d', '90d', 'all'];
const STAT_NAMES: StatName[] = ['commentCnt', 'authorCnt', 'submissionCnt'];

function parseTimeframedStats(tags: string[][], tf: StatsTimeframe): TimeframedStats {
  // All-time leaderboards use the bare tag name; windowed ones use the suffix.
  const suffix = tf === 'all' ? '' : `_${tf}`;

  const topPosters: TopPoster[] = getRepeatedTags(tags, `top_poster${suffix}`)
    .filter((tag) => tag.length >= 3)
    .map((tag) => ({ pubkey: tag[1], count: parseInt(tag[2], 10) || 0 }));

  const trendingHashtags: TrendingHashtag[] = getRepeatedTags(tags, `trending_hashtag${suffix}`)
    .filter((tag) => tag.length >= 3)
    .map((tag) => ({ tag: tag[1], count: parseInt(tag[2], 10) || 0 }));

  const topDonors: TopDonor[] = getRepeatedTags(tags, `top_donor${suffix}`)
    .filter((tag) => tag.length >= 3)
    .map((tag) => ({
      pubkey: tag[1],
      totalSats: parseInt(tag[2], 10) || 0,
    }));

  const topActions: TopAction[] = getRepeatedTags(tags, `top_action${suffix}`)
    .filter((tag) => tag.length >= 5)
    .map((tag) => ({
      aTag: tag[1],
      title: tag[2],
      submissions: parseInt(tag[3], 10) || 0,
      bounty: parseInt(tag[4], 10) || 0,
    }));

  return { topPosters, trendingHashtags, topDonors, topActions };
}

/** Parse a kind 30385 community-stats event into a structured object. */
export function parseStatsEvent(event: NostrEvent): TrustedCountryStats {
  const { tags } = event;

  const counts = {} as Record<StatName, Record<StatsTimeframe, number>>;
  for (const name of STAT_NAMES) {
    const tagBase = STAT_TAG_NAMES[name];
    counts[name] = {
      'all': getTagValue(tags, tagBase),
      '7d': getTagValue(tags, `${tagBase}_7d`),
      '30d': getTagValue(tags, `${tagBase}_30d`),
      '90d': getTagValue(tags, `${tagBase}_90d`),
    };
  }

  return {
    counts,
    byTimeframe: Object.fromEntries(
      TIMEFRAMES.map((tf) => [tf, parseTimeframedStats(tags, tf)]),
    ) as Record<StatsTimeframe, TimeframedStats>,
    updatedAt: event.created_at,
    provider: event.pubkey,
  };
}
