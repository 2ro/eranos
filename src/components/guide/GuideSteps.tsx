import { renderInlineMarkup } from '@/lib/helpMarkup';
import type { GuideStepsBlock } from '@/lib/helpContent';

/**
 * Numbered vertical flow of short steps. Each step gets a primary-tinted
 * circle on the left with its index, then title + body to the right.
 *
 * Visual goal: replace 3 or 4 paragraphs of "first X, then Y" prose with
 * a scannable list that can be read in seconds.
 */
export function GuideSteps({ block }: { block: GuideStepsBlock }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight mb-4">{block.heading}</h2>
      <ol className="space-y-4">
        {block.steps.map((step, i) => (
          <li key={i} className="flex gap-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-sm"
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="font-semibold text-foreground leading-snug">
                {renderInlineMarkup(step.title)}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {renderInlineMarkup(step.body)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
