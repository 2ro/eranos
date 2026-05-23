import { renderInlineMarkup } from '@/lib/helpMarkup';
import type { GuideProseBlock } from '@/lib/helpContent';

/**
 * Plain prose escape hatch. Used sparingly when nothing in the visual
 * kit fits. Renders an optional heading and short paragraphs.
 */
export function GuideProse({ block }: { block: GuideProseBlock }) {
  return (
    <section>
      {block.heading && (
        <h2 className="text-lg font-bold tracking-tight mb-3">{block.heading}</h2>
      )}
      <div className="space-y-3 text-sm leading-relaxed text-foreground/85">
        {block.paragraphs.map((p, i) => (
          <p key={i}>{renderInlineMarkup(p)}</p>
        ))}
      </div>
    </section>
  );
}
