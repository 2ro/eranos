import { cn } from '@/lib/utils';

interface CommunityGridProps {
  children: React.ReactNode;
  /** Extra classes on the grid container. */
  className?: string;
}

/**
 * Responsive grid container for community/organization cards on the
 * `/communities` page. Replaces the previous horizontal-scroll shelves so
 * organizations wrap onto multiple rows instead of disappearing off the
 * right edge.
 *
 * Column counts are tuned so each cell ends up close to the legacy
 * 256px `CommunityMiniCard` width at the `lg` breakpoint:
 *   - <640px:    1 column
 *   - sm 640+:   2 columns
 *   - md 768+:   3 columns
 *   - lg 1024+:  4 columns
 *
 * No horizontal padding by design — callers wrap the grid in their own
 * `max-w-* mx-auto px-4 sm:px-6` page container, matching the
 * Campaigns and Pledges discovery pages so all three surfaces align
 * visually. Double-padding (page container + grid) used to leave
 * group cards inset further than campaign / pledge cards at `sm`
 * breakpoints and up.
 *
 * Cards passed in should be `w-full` so they fill their grid cell — the
 * default `w-64` on `CommunityMiniCard` can be overridden with
 * `className="w-full"` thanks to `tailwind-merge`.
 */
export function CommunityGrid({ children, className }: CommunityGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
