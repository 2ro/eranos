import { useMemo, useState, Fragment } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAppContext } from '@/hooks/useAppContext';
import { getFAQCategories, type FAQCategory, type FAQItem } from '@/lib/helpContent';
import { renderInlineMarkup } from '@/lib/helpMarkup';
import { cn } from '@/lib/utils';

// ── Component ─────────────────────────────────────────────────────────────────

interface HelpFAQSectionProps {
  /** Show only these category IDs. Omit to show all. */
  categories?: string[];
  /** Show only these item IDs (across all categories). Omit to show all. */
  items?: string[];
  /** Hide category headings (useful when showing a single category or filtered items). */
  hideHeadings?: boolean;
  /** Additional class names for the wrapper. */
  className?: string;
  /**
   * Rendering variant.
   *
   * - `'list'` (default): flat accordion list grouped by category. Used
   *   inside contextual settings pages where the FAQ is a small inline
   *   reference.
   * - `'cards'`: each FAQ item renders as its own rounded card with a
   *   single-item accordion inside. Used by the About page so the FAQ
   *   reads as a designed section rather than an undifferentiated dump.
   */
  variant?: 'list' | 'cards';
  /**
   * When `variant='cards'`, render a row of category-tab pills above the
   * cards. Only one category is shown at a time. No effect on `'list'`.
   */
  tabs?: boolean;
  /**
   * When `variant='list'`, choose between the default pill-tinted category
   * heading (used by inline contextual FAQs in settings pages) and a
   * quieter 'reference' tone used by the About page's `Need help?`
   * section where the FAQ is the main content rather than a sidebar.
   */
  listTone?: 'default' | 'reference';
}

/**
 * Reusable FAQ accordion section.
 *
 * Renders FAQ items from `helpContent.ts` in collapsible accordions grouped by
 * category. Accepts filter props so it can be dropped into any page to show a
 * relevant subset of questions.
 *
 * @example
 * // Full FAQ (legacy list layout)
 * <HelpFAQSection />
 *
 * // About-page integrated FAQ (cards + category tabs)
 * <HelpFAQSection variant="cards" tabs />
 *
 * // Only payments questions (wallet settings page)
 * <HelpFAQSection categories={['payments']} hideHeadings />
 *
 * // Specific questions (onboarding)
 * <HelpFAQSection items={['what-are-relays', 'what-are-blossom']} hideHeadings />
 */
export function HelpFAQSection({
  categories,
  items,
  hideHeadings,
  className,
  variant = 'list',
  tabs = false,
  listTone = 'default',
}: HelpFAQSectionProps) {
  const { config } = useAppContext();

  const filteredCategories = useMemo(() => {
    let cats: FAQCategory[] = getFAQCategories(config.appName);

    // Drop hidden categories from the default render. They still exist in
    // the underlying template so `HelpTip` can look up individual items by
    // ID, but they don't show up in the FAQ accordion.
    if (!categories && !items) {
      cats = cats.filter((c) => !c.hidden);
    }

    // Filter to specific categories
    if (categories) {
      cats = cats.filter((c) => categories.includes(c.id));
    }

    // Filter to specific items
    if (items) {
      cats = cats
        .map((c) => ({
          ...c,
          items: c.items.filter((i) => items.includes(i.id)),
        }))
        .filter((c) => c.items.length > 0);
    }

    return cats;
  }, [categories, items, config.appName]);

  // Tab state: first category is selected by default.
  const [activeTab, setActiveTab] = useState<string | null>(
    filteredCategories[0]?.id ?? null,
  );

  if (filteredCategories.length === 0) return null;

  // ── Card variant ─────────────────────────────────────────────────────────
  if (variant === 'cards') {
    const showTabs = tabs && filteredCategories.length > 1;
    const visibleCategories = showTabs
      ? filteredCategories.filter((c) => c.id === activeTab)
      : filteredCategories;

    return (
      <div className={className}>
        {/* Category tab pills */}
        {showTabs && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {filteredCategories.map((category) => {
              const active = category.id === activeTab;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveTab(category.id)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white dark:bg-[#1c2230] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-[#252b3a]',
                  )}
                  aria-pressed={active}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        )}

        {visibleCategories.map((category) => (
          <Fragment key={category.id}>
            {!hideHeadings && !showTabs && (
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary mt-10 first:mt-0 mb-5">
                {category.label}
              </h3>
            )}

            {/* Masonry-style two-column grid on md+ */}
            <div className="md:columns-2 md:gap-6 [column-fill:_balance]">
              {category.items.map((item) => (
                <FAQCard key={item.id} item={item} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    );
  }

  // ── List variant (default, unchanged behavior) ───────────────────────────
  const reference = listTone === 'reference';
  return (
    <div className={className}>
      {filteredCategories.map((category, catIndex) => (
        <Fragment key={category.id}>
          {/* Category heading */}
          {!hideHeadings && (
            reference ? (
              <div className={catIndex === 0 ? 'pt-2 pb-3' : 'pt-10 pb-3'}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
                  {category.label}
                </h3>
              </div>
            ) : (
              <div className={catIndex === 0 ? 'pt-2 pb-2' : 'pt-6 pb-2'}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-3.5 py-1.5 inline-block">
                  {category.label}
                </h3>
              </div>
            )
          )}

          <Accordion
            type="single"
            collapsible
            className={cn('w-full', reference ? '' : 'pl-3')}
          >
            {category.items.map((item) => (
              <FAQAccordionItem key={item.id} item={item} reference={reference} />
            ))}
          </Accordion>
        </Fragment>
      ))}
    </div>
  );
}

function FAQAccordionItem({
  item,
  reference,
}: {
  item: FAQItem;
  reference?: boolean;
}) {
  if (reference) {
    // 'reference' mode: each Q&A reads as a substantial card-row with
    // a left orange-accent rule that lights up on hover and open. Used
    // by the About page where the FAQ is a first-class chapter rather
    // than a sidebar.
    return (
      <AccordionItem
        value={item.id}
        className="group relative border-b-0 rounded-lg bg-white dark:bg-[#1c2230] border border-gray-200 dark:border-white/10 shadow-sm mb-3 overflow-hidden transition-colors hover:border-primary/40 data-[state=open]:border-primary/50 data-[state=open]:shadow-md"
      >
        {/* Left accent rule: orange when open, transparent otherwise */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-primary/30 group-data-[state=open]:bg-primary transition-colors"
        />
        <AccordionTrigger className="text-left text-base sm:text-lg font-bold tracking-tight leading-snug hover:no-underline gap-3 px-5 sm:px-6 py-5 text-gray-900 dark:text-white">
          {item.question}
        </AccordionTrigger>
        <AccordionContent className="text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 space-y-3 px-5 sm:px-6 pb-5 -mt-1">
          {item.answer.map((paragraph, i) => (
            <p key={i}>{renderInlineMarkup(paragraph)}</p>
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <AccordionItem value={item.id}>
      <AccordionTrigger className="text-left text-base font-semibold leading-snug hover:no-underline gap-3">
        {item.question}
      </AccordionTrigger>
      <AccordionContent className="text-[14px] leading-relaxed text-foreground/80 space-y-3">
        {item.answer.map((paragraph, i) => (
          <p key={i}>{renderInlineMarkup(paragraph)}</p>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * A single FAQ entry rendered as its own rounded card. Wraps a one-item
 * Radix Accordion so the click-to-expand UX is preserved. Used by the
 * About page's card-variant FAQ section.
 */
function FAQCard({ item }: { item: FAQItem }) {
  return (
    <div className="mb-6 break-inside-avoid rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c2230] shadow-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value={item.id} className="border-b-0">
          <AccordionTrigger className="text-left font-display font-semibold text-gray-900 dark:text-white text-lg leading-snug hover:no-underline px-5 py-4 gap-3">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 space-y-3 px-5 pb-5">
            {item.answer.map((paragraph, i) => (
              <p key={i}>{renderInlineMarkup(paragraph)}</p>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
