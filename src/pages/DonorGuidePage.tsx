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
import { getDonorGuideBlocks, type GuideBlock } from '@/lib/helpContent';
import { COOL_PALETTE } from '@/lib/hopePalette';

/**
 * Donor Guide. The long-form companion to the About page.
 *
 * The page body is composed from a typed sequence of `GuideBlock`s
 * defined in `src/lib/helpContent.ts`. Each block kind has a dedicated
 * component; this page just hands each block to the right one. Linked
 * from `/about` as one of the two large guide buttons.
 */
export function DonorGuidePage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('policyPages.donorGuide.seoTitle')} | ${config.appName}`,
    description: t('policyPages.donorGuide.seoDescription', { appName: config.appName }),
  });

  const blocks = getDonorGuideBlocks(config.appName);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <GuideHero
        title={t('policyPages.donorGuide.title')}
        subtitle={t('policyPages.donorGuide.subtitle')}
        images={DONOR_HERO_IMAGES}
        palette={COOL_PALETTE}
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
 * Hero images for the Donor Guide. Reuses the World Liberty Congress
 * event photos already in `/public/hero/`. They read as "community of
 * supporters," which fits a donor-facing page. Same assets used by the
 * Organize and Communities homepage heroes, so we get free preload
 * caching across the app.
 */
const DONOR_HERO_IMAGES: readonly string[] = [
  '/hero/wlc-1.webp',
  '/hero/wlc-2.webp',
];

export default DonorGuidePage;
