import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ParticipantRow, TerritorialLevel } from './types';

interface ParticipantsListProps {
  data: ParticipantRow[];
  territorialLevel: TerritorialLevel;
}

const ITEMS_PER_PAGE = 10;

export function ParticipantsList({ data, territorialLevel }: ParticipantsListProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE));
  const paged = data.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const title = territorialLevel === 'states' ? 'All States' : 'All Municipalities';
  const columnLabel = territorialLevel === 'states' ? 'State' : 'Municipality';

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[2rem_1fr_4rem_2.5rem] sm:grid-cols-[2.5rem_1fr_6rem_4rem_2.5rem] items-center px-4 py-2 border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>#</span>
        <span>{columnLabel}</span>
        <span className="hidden sm:inline">Code</span>
        <span className="text-right">Posts</span>
        <span className="text-center">Live</span>
      </div>

      {/* Rows */}
      {paged.map((row) => (
        <div
          key={row.regionId}
          className="grid grid-cols-[2rem_1fr_4rem_2.5rem] sm:grid-cols-[2.5rem_1fr_6rem_4rem_2.5rem] items-center px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/20 transition-colors"
        >
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{row.rank}</span>
          <span className="text-sm font-medium truncate pr-2">{row.label}</span>
          <span className="hidden sm:inline text-xs text-muted-foreground font-mono truncate">
            #{row.hashtag}
          </span>
          <span className="text-right text-sm font-bold text-primary tabular-nums">{row.count}</span>
          <span className="flex justify-center">
            {row.isActive ? (
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-500" />
              </span>
            ) : (
              <span className="size-2 rounded-full bg-muted-foreground/30" />
            )}
          </span>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
