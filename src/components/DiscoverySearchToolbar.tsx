import { useTranslation } from 'react-i18next';
import { Check, Clock, EyeOff, LayoutGrid, ListFilter, TrendingUp } from 'lucide-react';

import { CountryPickerButton } from '@/components/CountryPickerButton';
import { DebouncedSearchInput } from '@/components/DebouncedSearchInput';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  /** Subset of sort options to expose. Defaults to all three. */
  sortOptions?: Nip50Sort[];
  /** i18n placeholder key for the input, e.g. `pledges.list.searchPlaceholder`. */
  searchPlaceholderKey: string;
  /** i18n aria-label key for the input, e.g. `pledges.list.searchAriaLabel`. */
  searchAriaLabelKey: string;
  /**
   * Show-hidden switch state + handler. When `undefined`, the show-hidden
   * row is omitted from the menu.
   */
  showHidden?: {
    /** Switch value. */
    value: boolean;
    /** Called when the user toggles the switch. */
    onChange: (next: boolean) => void;
    /** Optional count to render next to the label, e.g. (3). */
    count?: number;
  };
  /**
   * Selected ISO 3166-1 alpha-2 country code (e.g. `"US"`), or
   * `undefined` for the global / no-filter state. Drives the country
   * picker button rendered to the right of the filter dropdown.
   */
  country?: string;
  /** Called when the user picks a country, or `undefined` for Global. */
  onCountryChange?: (next: string | undefined) => void;
  /** Extra classes on the outer container. */
  className?: string;
}

/**
 * Filter cluster shared by every discovery page (Campaigns home, All-Campaigns,
 * Communities, Pledges). Designed to sit on the **right** of a section
 * heading row, paired with an `h2 + tagline` block on the left:
 *
 *     <div className="flex items-end justify-between gap-4">
 *       <div>
 *         <h2>…</h2>
 *         <p>…</p>
 *       </div>
 *       <DiscoverySearchToolbar … />
 *     </div>
 *
 * Layout: a horizontal cluster with a compact debounced search input
 * (left) and a single Filter button (right) whose `DropdownMenu`
 * contains the sort options and the optional Show-hidden switch — same
 * `ListFilter` icon-button pattern the pledges page already uses for
 * its sort dropdown, so the affordance is consistent.
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
  sortOptions,
  searchPlaceholderKey,
  searchAriaLabelKey,
  showHidden,
  country,
  onCountryChange,
  className,
}: DiscoverySearchToolbarProps) {
  const { t } = useTranslation();

  const sorts = sortOptions
    ? SORT_OPTIONS.filter((o) => sortOptions.includes(o.value))
    : SORT_OPTIONS;

  return (
    <div className={cn('flex items-center gap-1 sm:shrink-0', className)}>
      <DebouncedSearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={t(searchPlaceholderKey)}
        ariaLabel={t(searchAriaLabelKey)}
        clearLabel={t('common.clearSearch')}
        className="flex-1 sm:flex-none sm:w-64 mr-1"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('common.filtersAriaLabel')}
            className="h-auto p-2 rounded-lg hover:bg-muted/50"
          >
            <ListFilter className="h-5 w-5 text-primary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            {t('common.sortAriaLabel')}
          </DropdownMenuLabel>
          {sorts.map(({ value, labelKey, icon: Icon }) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={sort === value}
              onCheckedChange={(checked) => {
                // `checked === false` means the user clicked the
                // currently-active item — return to the curated
                // `default` view (featured-first) rather than leaving
                // them stuck on Top/New with no exit affordance now
                // that `default` is no longer an exposed option in the
                // dropdown.
                if (checked) onSortChange(value);
                else onSortChange('default');
              }}
              // The checkbox slot on the left is hidden in favour of an
              // explicit `Check` on the right (matches the
              // pledges-page sort dropdown). We keep the variant
              // because it gives us the radio-like "one checked at a
              // time" semantics for free.
              className={cn(
                '[&>span:first-child]:hidden pl-2',
                sort === value && 'bg-primary/10',
              )}
            >
              <Icon className="mr-2 h-4 w-4" />
              <span className="flex-1">{t(labelKey)}</span>
              {sort === value && <Check className="ml-2 h-4 w-4" />}
            </DropdownMenuCheckboxItem>
          ))}

          {showHidden && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showHidden.value}
                onCheckedChange={showHidden.onChange}
                className="pl-2"
              >
                <EyeOff className="mr-2 h-4 w-4" />
                <span className="flex-1">{t('common.showHidden')}</span>
                {showHidden.count !== undefined && showHidden.count > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({showHidden.count})
                  </span>
                )}
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onCountryChange && (
        <CountryPickerButton value={country} onChange={onCountryChange} />
      )}
    </div>
  );
}
