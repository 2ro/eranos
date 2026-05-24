import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { renderInlineMarkup } from '@/lib/helpMarkup';
import type { GuideTldrBlock } from '@/lib/helpContent';

/**
 * Top-of-page summary card. Renders the lede on the left and a checklist
 * of 2 to 3 next actions on the right (stacked on mobile). Sets the
 * page's promise in a single screen.
 */
export function GuideTLDR({ block }: { block: GuideTldrBlock }) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="grid gap-5 p-5 sm:p-6 sm:grid-cols-[1fr_auto] sm:gap-8 sm:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">
            {t('guides.shared.tldrEyebrow')}
          </p>
          <p className="text-lg sm:text-xl font-medium leading-snug text-foreground">
            {renderInlineMarkup(block.lede)}
          </p>
        </div>
        <ul className="space-y-2 sm:min-w-[220px]">
          {block.nextActions.map((action, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-foreground/85"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="leading-snug">{renderInlineMarkup(action)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
