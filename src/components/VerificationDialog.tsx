import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getDisplayName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface VerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title of the campaign being verified, shown for context. */
  campaignTitle: string;
  /** Whether the verify publish is in flight. */
  isPending: boolean;
  /** Confirm handler — publishes the `agora.verified` label. */
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown before a moderator publishes an
 * `agora.verified` label. Previews the moderator's own avatar with the same
 * checkmark badge used on verified campaign cards, and states the
 * attestation the moderator is making.
 */
export function VerificationDialog({
  open,
  onOpenChange,
  campaignTitle,
  isPending,
  onConfirm,
}: VerificationDialogProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey ?? '');
  const metadata = author.data?.metadata;
  const picture = sanitizeUrl(metadata?.picture);
  const displayName = user ? getDisplayName(metadata, user.pubkey) : '';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('campaignVerification.dialogTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('campaignVerification.dialogTitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Preview: the moderator's avatar with the checkmark badge,
            mirroring how verifications render on campaign cards. */}
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="relative">
            <Avatar className="size-20 ring-2 ring-border">
              {picture && <AvatarImage src={picture} alt="" proxyWidth={160} />}
              <AvatarFallback className="text-lg bg-secondary text-secondary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full bg-background p-0.5">
              <BadgeCheck className="size-7 text-sky-500" fill="currentColor" stroke="white" />
            </span>
          </div>
          {campaignTitle && (
            <p className="text-sm font-medium text-center text-foreground line-clamp-2">
              {campaignTitle}
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('campaignVerification.attestation')}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            <BadgeCheck className="mr-1.5 size-4" />
            {t('campaignVerification.verifyCampaign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
