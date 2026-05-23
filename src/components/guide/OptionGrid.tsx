import { ExternalLink } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { renderInlineMarkup } from '@/lib/helpMarkup';
import type { GuideOptionGridBlock, GuideOptionItem } from '@/lib/helpContent';

/**
 * Two-column grid of compact OptionCards (single column on mobile). Used
 * for the "donate privately" and "cash out" sections. Condenses what
 * used to be 4 to 6 long-form section cards into a scannable tile grid.
 */
export function OptionGrid({ block }: { block: GuideOptionGridBlock }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{block.heading}</h2>
      {block.intro && (
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {renderInlineMarkup(block.intro)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        {block.options.map((option) => (
          <OptionCard key={option.name} option={option} />
        ))}
      </div>
    </section>
  );
}

function OptionCard({ option }: { option: GuideOptionItem }) {
  const isLink = Boolean(option.href);

  const inner = (
    <Card
      className={cn(
        'h-full p-4 flex flex-col gap-3 border-border/70 motion-safe:transition-shadow motion-safe:duration-200',
        isLink && 'group-hover:shadow-md group-hover:border-primary/40 motion-safe:transition-colors',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground leading-snug">{option.name}</p>
        {isLink && (
          <ExternalLink
            className="size-3.5 mt-1 shrink-0 text-muted-foreground motion-safe:transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed flex-1">
        {renderInlineMarkup(option.purpose)}
      </p>
      {option.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {option.chips.map((chip) => (
            <li
              key={chip}
              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground/80"
            >
              {chip}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  if (isLink) {
    return (
      <a
        href={option.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
      >
        {inner}
      </a>
    );
  }

  return inner;
}
