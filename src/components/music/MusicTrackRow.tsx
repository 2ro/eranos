import { Skeleton } from '@/components/ui/skeleton';

/** Loading skeleton matching MusicTrackRow dimensions. */
export function MusicTrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="size-8 rounded" />
      <Skeleton className="size-12 rounded-lg" />
      <div className="flex-1 min-w-0 space-y-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-3 w-8" />
    </div>
  );
}
