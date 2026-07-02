import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';

import { GuideHero } from '@/components/GuideHero';
import {
  CalloutCard,
  GuideProse,
  GuideSteps,
  GuideTLDR,
  OptionGrid,
} from '@/components/guide';
import { useAppContext } from '@/hooks/useAppContext';
import { DEFAULT_ACTION_COVERS } from '@/lib/defaultActionCovers';
import { getRecipientGuideBlocks, type GuideBlock } from '@/lib/helpContent';
import { HOPE_PALETTE } from '@/lib/hopePalette';

/**
 * Recipient Guide. The long-form companion to the About page.
 *
 * The page body is composed from a typed sequence of `GuideBlock`s
 * defined in `src/lib/helpContent.ts`. Each block kind has a dedicated
 * component; this page just hands each block to the right one. Linked
 * from `/about` as one of the two large guide buttons.
 */
export function RecipientGuidePage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('policyPages.recipientGuide.seoTitle')} | ${config.appName}`,
    description: t('policyPages.recipientGuide.seoDescription', { appName: config.appName }),
  });

  const blocks = getRecipientGuideBlocks(config.appName);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <GuideHero
        title={t('policyPages.recipientGuide.title')}
        subtitle={t('policyPages.recipientGuide.subtitle')}
        images={RECIPIENT_HERO_IMAGES}
        palette={HOPE_PALETTE}
      />

      <div className="px-4 pt-6 pb-4 space-y-6 max-w-3xl mx-auto sm:px-6 lg:max-w-4xl">
        {blocks.map((block, i) => (
          <GuideBlockRenderer key={i} block={block} />
        ))}
      </div>
    </main>
  );
}

/** Dispatches a single block to the correct visual component. */
function GuideBlockRenderer({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'tldr':
      return <GuideTLDR block={block} />;
    case 'steps':
      return <GuideSteps block={block} />;
    case 'callout':
      return <CalloutCard block={block} />;
    case 'optionGrid':
      return <OptionGrid block={block} />;
    case 'prose':
      return <GuideProse block={block} />;
  }
}

/**
 * Hero images for the Recipient Guide. Reuses the protest / action cover
 * gallery already used by the Actions page hero (raised fists, people
 * power, freedom imagery) so the page reads as belonging to the people
 * receiving support, not just generic "users."
 */
const RECIPIENT_HERO_IMAGES: readonly string[] = DEFAULT_ACTION_COVERS.map(
  (c) => c.url,
);

export default RecipientGuidePage;
