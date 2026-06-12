import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';

import { PolicyMarkdown } from '@/components/PolicyMarkdown';
import { Skeleton } from '@/components/ui/skeleton';
import { useVerifierStatement } from '@/hooks/useVerifierStatement';
import { cn } from '@/lib/utils';

interface ProfileVerifierSectionProps {
  pubkey: string;
  className?: string;
}

/**
 * Renders a profile's kind 15063 verifier statement — a self-published
 * explanation of how the account verifies campaigns. Surfaced prominently
 * in the profile overview so donors can judge whether to trust the
 * account's verifications.
 *
 * Renders nothing when the profile has no statement (or has withdrawn it).
 */
export function ProfileVerifierSection({ pubkey, className }: ProfileVerifierSectionProps) {
  const { t } = useTranslation();
  const { statement, isLoading } = useVerifierStatement(pubkey);

  if (isLoading) {
    return (
      <section className={cn('space-y-3', className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>
    );
  }

  if (!statement) return null;

  return (
    <section className={cn('space-y-3', className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
        <ShieldCheck className="size-4" aria-hidden="true" />
        <span>{t('verifier.profileSectionTitle')}</span>
      </h2>
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <PolicyMarkdown source={statement} />
      </div>
    </section>
  );
}
