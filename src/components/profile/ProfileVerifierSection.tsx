import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';

import { PolicyMarkdown } from '@/components/PolicyMarkdown';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';
import { useSetVerifierStatement, useVerifierStatement } from '@/hooks/useVerifierStatement';
import { cn } from '@/lib/utils';

interface ProfileVerifierSectionProps {
  pubkey: string;
  /**
   * Whether the viewer owns this profile. When true, a Withdraw control is
   * surfaced in the card's top-right corner (mirroring the "Edit Profile"
   * affordance), letting the verifier retract their statement.
   */
  isOwnProfile?: boolean;
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
export function ProfileVerifierSection({ pubkey, isOwnProfile = false, className }: ProfileVerifierSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { statement, isLoading } = useVerifierStatement(pubkey);
  const { mutateAsync: setStatement, isPending } = useSetVerifierStatement();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <section className={cn('space-y-3', className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>
    );
  }

  if (!statement) return null;

  const handleWithdraw = async () => {
    try {
      await setStatement('');
      setConfirmOpen(false);
      toast({ title: t('verifier.withdrawnToast') });
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <section className={className}>
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t('verifier.howWeVerifyTitle')}
          </h2>
          {isOwnProfile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
              className="-mt-1 -mr-2 h-7 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span className="ml-1.5">{t('verifier.withdraw')}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mt-1 -mr-2 h-7 shrink-0 rounded-full border border-primary/20 bg-background/70 px-2.5 text-xs font-medium text-primary shadow-sm hover:bg-primary/10 hover:text-primary"
              asChild
            >
              <Link to={`/messages?to=${pubkey}`}>
                <MessageSquare className="mr-1.5 size-3" />
                {t('verifier.requestVerification')}
              </Link>
            </Button>
          )}
        </div>
        <PolicyMarkdown source={statement} />
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('verifier.withdrawConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('verifier.withdrawConfirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleWithdraw();
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              {t('verifier.withdraw')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
