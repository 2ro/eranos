import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { useToast } from '@/hooks/useToast';

/**
 * Renders the user's 24-word BIP-39 wallet seed phrase with show/hide,
 * copy-to-clipboard, and an explanatory warning. The mnemonic is derived
 * deterministically from the user's nsec via the v2 derivation pipeline
 * (`src/lib/hdwallet/seed.ts`); this component does not generate or store
 * anything — re-renders re-derive from the active login.
 *
 * The 24 words can be imported into any BIP-39-compatible wallet (Sparrow,
 * Electrum, Trezor, Ledger, Phoenix, BlueWallet, …) at the BIP-86 / BIP-352
 * paths. Agora itself only needs the nsec — the mnemonic exists solely so
 * users can take their funds elsewhere.
 *
 * Renders nothing when the active login type doesn't expose the nsec
 * (browser extension / NIP-46 bunker). Those signers can't derive the
 * wallet at all and so have no mnemonic to back up.
 */
export function WalletBackupMnemonic() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const access = useHdWalletAccess();

  const [showWords, setShowWords] = useState(false);
  const [copied, setCopied] = useState(false);

  // Split into a stable list reference so the render is cheap on every
  // toggle. Always compute (the cost of `useMemo` is trivial), but pass an
  // empty array when no mnemonic is available so hooks order stays stable.
  const words = useMemo(() => {
    if (access.status !== 'available') return [] as string[];
    return access.mnemonic.split(' ');
  }, [access]);

  if (access.status !== 'available') return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(access.mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: t('walletBackup.copyFailedTitle'),
        description: t('walletBackup.copyFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary/70" />
        <h2 className="text-sm font-semibold">{t('walletBackup.heading')}</h2>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('walletBackup.explainer')}
      </p>

      <div className="rounded-lg border bg-muted/30 p-4">
        {showWords ? (
          <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm font-mono">
            {words.map((w, i) => (
              <li key={`${i}-${w}`} className="flex items-baseline gap-2">
                <span className="text-muted-foreground tabular-nums w-6 text-right">
                  {i + 1}.
                </span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-center text-xs text-muted-foreground py-4">
            {t('walletBackup.hidden')}
          </p>
        )}
      </div>

      {showWords && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
            {t('walletBackup.warning')}
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowWords((v) => !v)}
          className="flex-1 gap-2"
        >
          {showWords ? (
            <>
              <EyeOff className="size-4" /> {t('walletBackup.hide')}
            </>
          ) : (
            <>
              <Eye className="size-4" /> {t('walletBackup.reveal')}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!showWords}
          className="flex-1 gap-2"
        >
          {copied ? (
            <>
              <Check className="size-4 text-emerald-600" /> {t('walletBackup.copied')}
            </>
          ) : (
            <>
              <Copy className="size-4" /> {t('walletBackup.copy')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Self-contained dialog wrapper around {@link WalletBackupMnemonic}. Used
 * by `/wallet` as a single "Back up wallet" affordance the user can open
 * without leaving the wallet flow.
 */
export function WalletBackupMnemonicDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('walletBackup.heading')}</DialogTitle>
          <DialogDescription>{t('walletBackup.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <WalletBackupMnemonic />
      </DialogContent>
    </Dialog>
  );
}
