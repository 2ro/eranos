import { useTranslation } from 'react-i18next';
import { Clock, EyeOff, LayoutGrid, SlidersHorizontal, TrendingUp } from 'lucide-react';

import { DebouncedSearchInput } from '@/components/DebouncedSearchInput';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Nip50Sort } from '@/hooks/useNip50Search';

const SORT_OPTIONS: { value: Nip50Sort; labelKey: string; icon: typeof TrendingUp }[] = [
  { value: 'default', labelKey: 'common.sortDefault', icon: LayoutGrid },
  { value: 'top', labelKey: 'common.sortTop', icon: TrendingUp },
  { value: 'new', labelKey: 'common.sortNew', icon: Clock },
];

interface DiscoverySearchToolbarProps {
  /** Search input value (parent state, undebounced). */
  query: string;
  /** Called on every keystroke. Parent is expected to debounce before querying. */
  onQueryChange: (next: string) => void;
  /** Active sort. */
  sort: Nip50Sort;
  /** Called when the user picks a different sort. */
  onSortChange: (next: Nip50Sort) => void;
  /** i18n placeholder key for the input, e.g. `pledges.list.searchPlaceholder`. */
  searchPlaceholderKey: string;
  /** i18n aria-label key for the input, e.g. `pledges.list.searchAriaLabel`. */
  searchAriaLabelKey: string;
  /**
   * Show-hidden switch state + handler. When `undefined`, the switch is
   * not rendered (use this on surfaces that have no hidden-moderation
   * concept, like Pledges today).
   */
  showHidden?: {
    /** Switch value. */
    value: boolean;
    /** Called when the user toggles the switch. */
    onChange: (next: boolean) => void;
    /** Optional count to render next to the label, e.g. (3). */
    count?: number;
    /**
     * Stable HTML id for the switch ⇄ label pairing. Default is
     * `discovery-show-hidden`; supply your own when multiple toolbars
     * could mount in the same tree.
     */
    id?: string;
  };
  /** Extra classes on the outer container. */
  className?: string;
}

/**
 * Toolbar shared by every discovery page (Campaigns home, All-Campaigns,
 * Communities, Pledges). Renders inline against the page background — no
 * card framing — so the discovery hero still anchors visual hierarchy.
 *
 * Layout: a single row with the search input flexing to fill, and a
 * compact Filter button on the right that opens a popover containing
 * the Top / New sort pills and (optionally) the Show-hidden switch.
 * Matches the affordance used on the global SearchPage so the
 * filter idiom feels the same across the app.
 *
 * Fully controlled — parent owns search / sort / show-hidden state.
 * Keeps URL sync, debounce, and storage decisions where they belong
 * (in the page).
 */
export function DiscoverySearchToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  searchPlaceholderKey,
  searchAriaLabelKey,
  showHidden,
  className,
}: DiscoverySearchToolbarProps) {
  const { t } = useTranslation();
  const switchId = showHidden?.id ?? 'discovery-show-hidden';

  // Any modifier that differs from the defaults (Default sort, hidden
  // off) tints the Filter button so the active state is visible without
  // opening the popover.
  const hasActiveFilters = sort !== 'default' || showHidden?.value === true;

  return (
    <div className={cn('max-w-3xl mx-auto flex items-center gap-2', className)}>
      <DebouncedSearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={t(searchPlaceholderKey)}
        ariaLabel={t(searchAriaLabelKey)}
        clearLabel={t('common.clearSearch')}
        className="flex-1"
      />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('common.filtersAriaLabel')}
            className={cn(
              'shrink-0 h-11 w-11 rounded-lg border bg-secondary/50 hover:bg-secondary flex items-center justify-center motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              hasActiveFilters
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-4">
          {/* Sort pills */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('common.sortAriaLabel')}
            </span>
            <div
              className="flex gap-1 p-1 rounded-lg bg-secondary/40"
              role="radiogroup"
              aria-label={t('common.sortAriaLabel')}
            >
              {SORT_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={sort === value}
                  onClick={() => onSortChange(value)}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1.5 text-xs font-medium rounded-md motion-safe:transition-colors',
                    sort === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Show-hidden switch (optional) */}
          {showHidden && (
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor={switchId}
                className="text-sm font-medium cursor-pointer inline-flex items-center gap-1.5"
              >
                <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                {t('common.showHidden')}
                {showHidden.count !== undefined && showHidden.count > 0 && (
                  <span className="text-muted-foreground font-normal">
                    ({showHidden.count})
                  </span>
                )}
              </Label>
              <Switch
                id={switchId}
                checked={showHidden.value}
                onCheckedChange={showHidden.onChange}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
