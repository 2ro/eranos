import { useSeoMeta } from '@unhead/react';
import { AlertTriangle, Megaphone } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GuideSectionCard } from '@/components/GuideSectionCard';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getActivistGuideSections } from '@/lib/helpContent';

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
      <PageHeader
        title="Activist Guide"
        icon={<Megaphone className="size-5" />}
        backTo="/help"
      />

      <div className="px-4 pt-2 pb-4 space-y-4">
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

        {/* Short intro */}
        <p className="text-sm text-muted-foreground">
          Receiving support on {config.appName} means donors send Bitcoin directly to an address
          derived from your Nostr key. Here&apos;s how it works, and how to move funds privately if
          you need to.
        </p>

        {/* Sections */}
        {sections.map((section) => (
          <GuideSectionCard key={section.id} section={section} />
        ))}
      </div>
    </main>
  );
}

export default ActivistGuidePage;
