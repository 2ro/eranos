import { useSeoMeta } from '@unhead/react';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GuideHero } from '@/components/GuideHero';
import { GuideSectionCard } from '@/components/GuideSectionCard';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { DEFAULT_ACTION_COVERS } from '@/lib/defaultActionCovers';
import { getActivistGuideSections } from '@/lib/helpContent';
import { HOPE_PALETTE } from '@/lib/hopePalette';

/**
 * Activist Guide — long-form companion to the Help page.
 *
 * Explains how receiving donations works on Agora, why incoming donations
 * are public, and the main paths for cashing out privately. Linked from
 * `/help` as one of the two large guide buttons.
 */
export function ActivistGuidePage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Activist Guide | ${config.appName}`,
    description: `How to receive donations on ${config.appName} and cash out privately.`,
  });

  const sections = getActivistGuideSections(config.appName);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <GuideHero
        title="Activist Guide"
        subtitle="How to receive donations on Agora and move funds privately when you need to."
        images={ACTIVIST_HERO_IMAGES}
        palette={HOPE_PALETTE}
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
              {config.appName} is recommended only for above-ground activism. Every donation you
              receive is recorded publicly on the Bitcoin blockchain and on Nostr. If you or your
              donors require extreme privacy &mdash; including protection from state actors
              &mdash; additional steps are needed to protect yourself and the people supporting you.
              Read the sections below before accepting donations.
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
 * Hero images for the Activist Guide. Reuses the protest / action cover
 * gallery already used by the Actions page hero — raised fists, people
 * power, freedom imagery — so the page reads as belonging to activists,
 * not just generic "users."
 */
const ACTIVIST_HERO_IMAGES: readonly string[] = DEFAULT_ACTION_COVERS.map(
  (c) => c.url,
);

export default ActivistGuidePage;
