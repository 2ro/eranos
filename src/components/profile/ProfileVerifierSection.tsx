import { useTranslation } from 'react-i18next';

import { PolicyMarkdown } from '@/components/PolicyMarkdown';
import { Skeleton } from '@/components/ui/skeleton';
import { useVerifierStatement } from '@/hooks/useVerifierStatement';
import { cn } from '@/lib/utils';

interface ProfileVerifierSectionProps {
  pubkey: string;
  className?: string;
}

/**
 * Renders a profile's kind 14672 verifier statement — a self-published
 * explanation of how the account verifies campaigns. Surfaced full-width
 * above the profile tabs so donors can read, in the account's own words,
 * how it vets campaigns.
 *
 * Note: this is a self-authored claim, not a platform endorsement — the
 * heading is deliberately neutral ("How We Verify") and carries no
 * trust-implying badge, since Agora makes no guarantees about the account.
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
    <section className={className}>
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t('verifier.howWeVerifyTitle')}
        </h2>
        <PolicyMarkdown source={statement} />
      </div>
    </section>
  );
}
