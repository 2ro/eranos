import { useSeoMeta } from '@unhead/react';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GuideHero } from '@/components/GuideHero';
import { GuideSectionCard } from '@/components/GuideSectionCard';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getDonorGuideSections } from '@/lib/helpContent';
import { COOL_PALETTE } from '@/lib/hopePalette';

/**
 * Donor Guide — long-form companion to the Help page.
 *
 * Explains how on-chain donations on Agora work, why they are publicly
 * visible, and what a donor can do if they need privacy. Linked from
 * `/help` as one of the two large guide buttons.
 */
export function DonorGuidePage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Donor Guide | ${config.appName}`,
    description: `How donating works on ${config.appName} and how to protect your privacy.`,
  });

  const sections = getDonorGuideSections(config.appName);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <GuideHero
        title="Donor Guide"
        subtitle="Real Bitcoin, sent directly. Here's how it works and how to do it privately."
        images={DONOR_HERO_IMAGES}
        palette={COOL_PALETTE}
      />

      <div className="px-4 pt-4 pb-4 space-y-4 max-w-3xl mx-auto">
        {/* Above-ground recommendation alert */}
        <Alert className="border-amber-500/50 [&>svg]:text-amber-500">
          <AlertTriangle className="size-4" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">
            Recommended for above-ground activism
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            <p>
              {config.appName} is recommended only for supporting above-ground activism. Your
              donation is public on the Bitcoin blockchain and on Nostr. If you need extreme
              privacy &mdash; including protection from state actors &mdash; additional steps are
              required before donating. Read the sections below first.
            </p>
          </AlertDescription>
        </Alert>

        {/* Sections */}
        {sections.map((section) => (
          <GuideSectionCard key={section.id} section={section} />
        ))}
      </div>
    </main>
  );
}

/**
 * Hero images for the Donor Guide. Reuses the World Liberty Congress
 * event photos already in `/public/hero/` — they read as "community of
 * supporters," which fits a donor-facing page. Same assets used by the
 * Organize and Communities homepage heroes, so we get free preload
 * caching across the app.
 */
const DONOR_HERO_IMAGES: readonly string[] = [
  '/hero/wlc-1.webp',
  '/hero/wlc-2.webp',
  '/hero/wlc-3.webp',
];

export default DonorGuidePage;
