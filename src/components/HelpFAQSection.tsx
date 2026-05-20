import { useMemo, Fragment } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAppContext } from '@/hooks/useAppContext';
import { getFAQCategories, type FAQCategory, type FAQItem } from '@/lib/helpContent';
import { renderInlineMarkup } from '@/lib/helpMarkup';

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
}

/**
 * Reusable FAQ accordion section.
 *
 * Renders FAQ items from `helpContent.ts` in collapsible accordions grouped by
 * category. Accepts filter props so it can be dropped into any page to show a
 * relevant subset of questions.
 *
 * @example
 * // Full FAQ (Help page)
 * <HelpFAQSection />
 *
 * // Only payments questions (wallet settings page)
 * <HelpFAQSection categories={['payments']} hideHeadings />
 *
 * // Specific questions (onboarding)
 * <HelpFAQSection items={['what-are-relays', 'what-are-blossom']} hideHeadings />
 */
export function HelpFAQSection({ categories, items, hideHeadings, className }: HelpFAQSectionProps) {
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

  if (filteredCategories.length === 0) return null;

  return (
    <div className={className}>
      {filteredCategories.map((category, catIndex) => (
        <Fragment key={category.id}>
          {/* Category heading */}
          {!hideHeadings && (
            <div className={catIndex === 0 ? 'pt-2 pb-2' : 'pt-6 pb-2'}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-3.5 py-1.5 inline-block">
                {category.label}
              </h3>
            </div>
          )}

          <Accordion type="single" collapsible className="w-full pl-3">
            {category.items.map((item) => (
              <FAQAccordionItem key={item.id} item={item} />
            ))}
          </Accordion>
        </Fragment>
      ))}
    </div>
  );
}

function FAQAccordionItem({ item }: { item: FAQItem }) {
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
