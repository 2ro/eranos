import { useTranslation } from 'react-i18next';

import { CAMPAIGN_CATEGORIES } from '@/lib/campaignCategories';
import { cn } from '@/lib/utils';

export interface CategoryPickerProps {
  /** Set of currently-selected category slugs. */
  selected: Set<string>;
  /** Called with the slug whenever a pill is tapped. */
  onToggle: (slug: string) => void;
}

/**
 * Multi-select pill row of curated content categories — shared by
 * Agora's campaign and group creation flows. Each chip renders a
 * Lucide icon + a localized label, and toggling it adds or removes
 * that category's slug from the parent's selection set.
 *
 * The picker has no protocol-level awareness — the parent serializes
 * each selected slug as an ordinary `['t', slug]` tag, which keeps
 * the published events fully readable by any Nostr client that
 * already understands content tags.
 *
 * Layout is a free-flowing `flex flex-wrap` row: each pill sizes to
 * its own text, and the row breaks whenever the next pill wouldn't
 * fit. The category list is intentionally shared between campaigns
 * and groups so the same Lucide vocabulary feels consistent across
 * the two flows.
 */
export function CategoryPicker({ selected, onToggle }: CategoryPickerProps) {
  const { t } = useTranslation();
  return (
    // Free-flowing pill row: each chip sizes to its own text, the row
    // wraps to a new line whenever the next chip wouldn't fit. Some
    // rows naturally land at three pills, others at four — driven by
    // the labels' intrinsic widths rather than a fixed column count.
    // Each pill is fully rounded with generous horizontal padding so
    // it reads as a tag, not a grid cell.
    <div className="flex flex-wrap gap-2">
      {CAMPAIGN_CATEGORIES.map(({ slug, labelKey, Icon }) => {
        const isSelected = selected.has(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onToggle(slug)}
            aria-pressed={isSelected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition-colors motion-safe:transition-shadow',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon
              className={cn(
                'size-4 shrink-0',
                isSelected ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
            <span>{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
