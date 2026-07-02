import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Users, Hash, MessageSquare, HandHeart, Flame,
} from 'lucide-react';
import type { NostrMetadata } from '@nostrify/nostrify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useTrustedCountryStats } from '@/hooks/useTrustedCountryStats';
import { useTrustedGlobalStats } from '@/hooks/useTrustedGlobalStats';
import type {
  StatsTimeframe, TopAction, TopDonor, TopPoster, TrendingHashtag,
  TrustedCountryStats,
} from '@/lib/statsParser';
import { genUserName } from '@/lib/genUserName';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

const TIMEFRAMES: { value: StatsTimeframe; label: string }[] = [
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

interface CommunityStatsPanelProps {
  /** ISO 3166 country code. Omit to render the global (`iso3166:ZZ`) snapshot. */
  countryCode?: string;
  className?: string;
  /**
   * Render at narrow widths (e.g. inside a 360px sidebar): 2-column tile grid
   * with full labels, single-column leaderboards. Defaults to `false` (the
   * roomy multi-column layout used on country pages).
   */
  compact?: boolean;
}

/**
 * Compact community-stats panel for a country (or the global aggregate when
 * `countryCode` is omitted). Reads pre-computed kind 30385 snapshots — see
 * NIP.md → Kind 30385 for the trust model and tag schema.
 *
 * Renders nothing when no trusted snapshot is available, so it can be safely
 * dropped into any page without producing empty placeholders.
 */
export function CommunityStatsPanel({ countryCode, className, compact = false }: CommunityStatsPanelProps) {
  const isGlobal = !countryCode;
  const country = useTrustedCountryStats(isGlobal ? undefined : countryCode);
  const global = useTrustedGlobalStats();
  const { data: stats, isLoading } = isGlobal ? global : country;

  const [tf, setTf] = useState<StatsTimeframe>('7d');

  if (isLoading && !stats) return <PanelSkeleton className={className} compact={compact} />;
  if (!stats) return null;

  return (
    <section
      className={cn(
        // Standalone usage gets a card-style border. Compact usage is
        // embedded inside another bordered surface (the world discovery
        // modal / docked panel) where an extra border produces a
        // box-in-a-box look — drop it and rely on spacing alone.
        compact
          ? 'space-y-4'
          : 'rounded-2xl border border-border bg-background/40 p-4 space-y-4',
        className,
      )}
    >
      <PanelHeader stats={stats} timeframe={tf} onTimeframeChange={setTf} />
      <AggregateCounts stats={stats} timeframe={tf} compact={compact} />
      <Leaderboards stats={stats} timeframe={tf} compact={compact} />
    </section>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function PanelHeader({
  stats, timeframe, onTimeframeChange,
}: {
  stats: TrustedCountryStats;
  timeframe: StatsTimeframe;
  onTimeframeChange: (tf: StatsTimeframe) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        <Trophy className="size-4 text-primary" />
        <span>Community stats</span>
        <span className="text-xs font-normal text-muted-foreground/60">
          updated {formatRelative(stats.updatedAt)}
        </span>
      </h2>
      <Tabs value={timeframe} onValueChange={(v) => onTimeframeChange(v as StatsTimeframe)}>
        <TabsList className="h-7">
          {TIMEFRAMES.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="h-6 px-2 text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

// ── Aggregate counts ─────────────────────────────────────────────────────────

function AggregateCounts({
  stats, timeframe, compact,
}: {
  stats: TrustedCountryStats;
  timeframe: StatsTimeframe;
  compact: boolean;
}) {
  const c = stats.counts;
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
      <CountTile icon={MessageSquare} label="Comments"    value={c.commentCnt[timeframe]} />
      <CountTile icon={Users}         label="Authors"     value={c.authorCnt[timeframe]} />
      <CountTile icon={Flame}         label="Submissions" value={c.submissionCnt[timeframe]} />
    </div>
  );
}

function CountTile({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base font-semibold tabular-nums">{formatCompact(value)}</div>
    </div>
  );
}

// ── Leaderboards ─────────────────────────────────────────────────────────────

function Leaderboards({
  stats, timeframe, compact,
}: {
  stats: TrustedCountryStats;
  timeframe: StatsTimeframe;
  compact: boolean;
}) {
  const tfData = stats.byTimeframe[timeframe];
  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'md:grid-cols-2')}>
      <TopActionsList actions={tfData.topActions} />
      <TopPostersList posters={tfData.topPosters} />
      <TopDonorsList donors={tfData.topDonors} />
      <TrendingHashtagsList tags={tfData.trendingHashtags} className={compact ? undefined : 'md:col-span-2'} />
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      <Icon className="size-3.5 text-primary" />
      <span>{title}</span>
    </h3>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground/60 italic">No {label} yet.</p>;
}

function TopActionsList({ actions }: { actions: TopAction[] }) {
  if (!actions.length) {
    return (
      <div>
        <SectionHeader icon={Trophy} title="Top actions" />
        <EmptyRow label="actions" />
      </div>
    );
  }
  return (
    <div>
      <SectionHeader icon={Trophy} title="Top actions" />
      <ul className="space-y-1.5">
        {actions.slice(0, 5).map((a, i) => {
          const parts = a.aTag.split(':');
          const naddrPath = parts.length === 3 ? `/actions` : `/actions`;
          return (
            <li key={a.aTag}>
              <Link
                to={naddrPath}
                className="flex items-start gap-2 rounded-md p-1.5 hover:bg-muted/40 transition-colors"
              >
                <RankBadge rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {a.submissions} submissions
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TopPostersList({ posters }: { posters: TopPoster[] }) {
  if (!posters.length) {
    return (
      <div>
        <SectionHeader icon={MessageSquare} title="Top posters" />
        <EmptyRow label="posters" />
      </div>
    );
  }
  return (
    <div>
      <SectionHeader icon={MessageSquare} title="Top posters" />
      <ul className="space-y-1.5">
        {posters.slice(0, 5).map((p, i) => (
          <PubkeyRow
            key={p.pubkey}
            rank={i + 1}
            pubkey={p.pubkey}
            primary={`${p.count} posts`}
          />
        ))}
      </ul>
    </div>
  );
}

function TopDonorsList({ donors }: { donors: TopDonor[] }) {
  if (!donors.length) {
    return (
      <div>
        <SectionHeader icon={HandHeart} title="Top donors" />
        <EmptyRow label="donors" />
      </div>
    );
  }
  return (
    <div>
      <SectionHeader icon={HandHeart} title="Top donors" />
      <ul className="space-y-1.5">
        {donors.slice(0, 5).map((d, i) => (
          <PubkeyRow
            key={d.pubkey}
            rank={i + 1}
            pubkey={d.pubkey}
            primary={`${formatCompact(d.totalSats)} sats`}
          />
        ))}
      </ul>
    </div>
  );
}

function TrendingHashtagsList({ tags, className }: { tags: TrendingHashtag[]; className?: string }) {
  if (!tags.length) {
    return (
      <div className={className}>
        <SectionHeader icon={Hash} title="Trending hashtags" />
        <EmptyRow label="trending hashtags" />
      </div>
    );
  }
  return (
    <div className={className}>
      <SectionHeader icon={Hash} title="Trending hashtags" />
      <div className="flex flex-wrap gap-1.5">
        {tags.slice(0, 16).map((t) => (
          <Link key={t.tag} to={`/i/${encodeURIComponent(`https://#${t.tag}`)}`}>
            <Badge variant="secondary" className="gap-1 cursor-pointer text-[11px] hover:bg-secondary/80">
              <Hash className="size-3" />
              <span>{t.tag}</span>
              <span className="text-muted-foreground tabular-nums">{t.count}</span>
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Generic pubkey row ───────────────────────────────────────────────────────

function PubkeyRow({
  rank, pubkey, primary, secondary,
}: {
  rank: number;
  pubkey: string;
  primary: string;
  secondary?: string;
}) {
  const author = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey) || genUserName(pubkey);
  const url = useProfileUrl(pubkey, metadata);

  return (
    <li>
      <Link
        to={url}
        className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/40 transition-colors"
      >
        <RankBadge rank={rank} />
        <Avatar className="size-7 shrink-0">
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback className="text-[10px]">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums truncate">
            {primary}
            {secondary && <span className="text-muted-foreground/60"> · {secondary}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'shrink-0 size-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center',
        rank === 1 && 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
        rank === 2 && 'bg-zinc-400/20 text-zinc-700 dark:text-zinc-300',
        rank === 3 && 'bg-amber-700/20 text-amber-800 dark:text-amber-400',
      )}
    >
      {rank}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function PanelSkeleton({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <section
      className={cn(
        compact
          ? 'space-y-4'
          : 'rounded-2xl border border-border bg-background/40 p-4 space-y-4',
        className,
      )}
    >
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
      </div>
    </section>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
function formatCompact(value: number): string {
  if (!value) return '0';
  return compactFormatter.format(value);
}

function formatRelative(unixSeconds: number): string {
  if (!unixSeconds) return 'never';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

