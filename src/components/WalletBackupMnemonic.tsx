import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';

/**
 * Renders the user's 24-word BIP-39 wallet seed phrase. The seed-phrase box
 * itself is the reveal affordance — tap once to expose the words, tap again
 * to hide them. The mnemonic is derived deterministically from the user's
 * nsec via the v2 derivation pipeline (`src/lib/hdwallet/seed.ts`); this
 * component does not generate or store anything — re-renders re-derive from
 * the active login.
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
  const access = useHdWalletAccess();

  const [showWords, setShowWords] = useState(false);

  // Split into a stable list reference so the render is cheap on every
  // toggle. Always compute (the cost of `useMemo` is trivial), but pass an
  // empty array when no mnemonic is available so hooks order stays stable.
  const words = useMemo(() => {
    if (access.status !== 'available') return [] as string[];
    return access.mnemonic.split(' ');
  }, [access]);

  if (access.status !== 'available') return null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setShowWords((v) => !v)}
        aria-pressed={showWords}
        aria-label={showWords ? t('walletBackup.hideAria') : t('walletBackup.revealAria')}
        className="w-full text-left rounded-lg border bg-muted/30 p-4 motion-safe:transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
      >
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
      </button>

      {showWords && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
            {t('walletBackup.warning')}
          </p>
        </div>
      )}
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
