import type { NostrEvent } from '@nostrify/nostrify';

import { ArticleContent } from '@/components/ArticleContent';
import { Skeleton } from '@/components/ui/skeleton';

interface DetailStoryProps {
  event: NostrEvent;
  hasContent: boolean;
  heading: string;
  headingId: string;
  emptyText: string;
}

export function DetailStory({ event, hasContent, heading, headingId, emptyText }: DetailStoryProps) {
  if (!hasContent) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-10 text-center">
        <p className="text-muted-foreground italic">{emptyText}</p>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      >
        {heading}
      </h2>
      <article className="prose prose-neutral dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:text-foreground/90 prose-headings:tracking-tight prose-img:rounded-xl">
        <ArticleContent event={event} />
      </article>
    </section>
  );
}

export function DetailReplySkeleton() {
  return (
    <div className="px-4 py-3 border-b border-primary/20 last:border-b-0">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
