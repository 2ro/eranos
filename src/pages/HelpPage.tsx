import { useSeoMeta } from '@unhead/react';
import { AlertTriangle, ChevronRight, HandHeart, HelpCircle, Megaphone, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { PageHeader } from '@/components/PageHeader';
import { TeamSoapboxCard } from '@/components/TeamSoapboxCard';
import { HelpFAQSection } from '@/components/HelpFAQSection';

export function HelpPage() {
  const { config } = useAppContext();
  useLayoutOptions({});

  useSeoMeta({
    title: `Help | ${config.appName}`,
    description: `Get help with ${config.appName} — donor and activist guides, FAQs, and support`,
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Help" icon={<HelpCircle className="size-5" />} />

      {/* Top-of-page disclaimer: first thing visitors see */}
      <div className="px-4 pt-2">
        <Alert className="border-amber-500/50 [&>svg]:text-amber-500">
          <AlertTriangle className="size-4" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">Read this first</AlertTitle>
          <AlertDescription className="text-foreground/80">
            <p>
              {config.appName} is recommended only for above-ground activism. Every donation
              &mdash; given or received &mdash; is public on the Bitcoin blockchain and on Nostr. If
              you or your donors require extreme privacy, including from state actors, additional
              steps are required to protect yourself. Read the <strong>Donor Guide</strong> and{' '}
              <strong>Activist Guide</strong> below before participating.
            </p>
          </AlertDescription>
        </Alert>
      </div>

      {/* Two large guide buttons */}
      <div className="px-4 pt-4 grid gap-3 sm:grid-cols-2">
        <GuideButton
          to="/help/donors"
          icon={<HandHeart className="size-6" />}
          title="Donor Guide"
          description="How to support activists privately and safely."
        />
        <GuideButton
          to="/help/activists"
          icon={<Megaphone className="size-6" />}
          title="Activist Guide"
          description="Receiving donations and cashing out privately."
        />
      </div>

      {/* FAQ heading */}
      <div className="px-4 pt-6 pb-1">
        <h2 className="text-lg font-bold">Frequently Asked Questions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Everything else you need to know about Nostr, {config.appName}, and how it all works.
        </p>
      </div>

      {/* FAQ accordion sections */}
      <HelpFAQSection className="px-4 pb-4" />

      {/* Team Soapbox follow pack — at the end, after the FAQ */}
      <TeamSoapboxCard className="px-4 pt-2 pb-4" />

      {/* Privacy policy link */}
      <div className="px-4 pb-8">
        <Link
          to="/privacy"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="size-4" />
          <span>Privacy Policy</span>
        </Link>
      </div>
    </main>
  );
}

interface GuideButtonProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function GuideButton({ to, icon, title, description }: GuideButtonProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-snug">{title}</p>
        <p className="text-sm text-muted-foreground leading-snug">{description}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
