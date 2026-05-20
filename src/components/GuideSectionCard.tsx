import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type GuideSection } from '@/lib/helpContent';
import { renderInlineMarkup } from '@/lib/helpMarkup';

/**
 * Renders a single {@link GuideSection} as a Card. Used by the Donor Guide
 * and Activist Guide pages.
 *
 * Paragraphs accept the same inline markup as FAQ answers (**bold** and
 * [link](url)). Optional `pros` / `cons` arrays render as colored bullet
 * lists beneath the paragraphs.
 */
export function GuideSectionCard({ section }: { section: GuideSection }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{section.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-foreground/80">
        {section.paragraphs.map((p, i) => (
          <p key={i}>{renderInlineMarkup(p)}</p>
        ))}

        {section.pros && section.pros.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              Pros
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {section.pros.map((p, i) => (
                <li key={i}>{renderInlineMarkup(p)}</li>
              ))}
            </ul>
          </div>
        )}

        {section.cons && section.cons.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
              Cons
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {section.cons.map((c, i) => (
                <li key={i}>{renderInlineMarkup(c)}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
