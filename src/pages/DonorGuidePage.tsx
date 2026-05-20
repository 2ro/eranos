import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, AlertTriangle, HandHeart } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { GuideSectionCard } from '@/components/GuideSectionCard';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { getDonorGuideSections } from '@/lib/helpContent';

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
      <PageHeader
        title="Donor Guide"
        icon={<HandHeart className="size-5" />}
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
              {config.appName} is recommended only for supporting above-ground activism. Your
              donation is public on the Bitcoin blockchain and on Nostr. If you need extreme
              privacy &mdash; including protection from state actors &mdash; additional steps are
              required before donating. Read the sections below first.
            </p>
          </AlertDescription>
        </Alert>

        {/* Short intro */}
        <p className="text-sm text-muted-foreground">
          Supporting an activist on {config.appName} means sending real Bitcoin on-chain. Here&apos;s
          how it works, and how to do it privately if you need to.
        </p>

        {/* Sections */}
        {sections.map((section) => (
          <GuideSectionCard key={section.id} section={section} />
        ))}

        {/* Bottom navigation back to the Help page */}
        <div className="pt-2">
          <Button asChild variant="outline" className="w-full">
            <Link to="/help">
              <ArrowLeft className="size-4" />
              Back to Help
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

export default DonorGuidePage;
