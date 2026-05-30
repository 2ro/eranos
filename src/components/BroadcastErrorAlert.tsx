import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  getUniqueBitcoinFeeSpeeds,
  type BitcoinFeeRates,
  type BitcoinFeeSpeed,
} from '@/lib/bitcoinFeeSpeed';
import {
  isFeeRecoverable,
  type BroadcastErrorKind,
} from '@/lib/bitcoinBroadcastError';

interface BroadcastErrorAlertProps {
  /** Classifier output from {@link classifyBroadcastError}. */
  error: BroadcastErrorKind;
  /** Currently-resolved sat/vB rate, used to decide whether bump can do anything. */
  currentFeeRate: number | undefined;
  /** Currently-selected fee tier. */
  feeSpeed: BitcoinFeeSpeed;
  /** Loaded fee rates, used to compute the de-duped preset tier list. */
  feeRates: BitcoinFeeRates | undefined;
  /** Whether the underlying mutation is in flight (disables actions). */
  isPending: boolean;
  /** Bump-fee recovery action. */
  onBumpFee: () => void;
  /** Plain retry recovery action (used for `network` failures). */
  onRetry: () => void;
  /**
   * When `true` the component knows there's no custom-rate input available
   * in the consumer (e.g. {@link DonateDialog}), so we hide the bump button
   * and surface a static "you're on the fastest tier" message once the
   * user is already on the top preset.
   */
  presetTiersOnly?: boolean;
}

/**
 * Inline alert rendered above a Bitcoin transaction's Send button when a
 * broadcast attempt is rejected. The classifier in
 * {@link ../lib/bitcoinBroadcastError} maps the raw relay error onto a
 * small enum; each kind gets specific copy and, where recovery is
 * possible, an action button.
 *
 * Action button rules:
 *
 * - **Fee-recoverable kinds** (`feeTooLow`, `mempoolFull`,
 *   `rbfReplacementFeeTooLow`) get **Use a higher fee**, which calls
 *   `onBumpFee`. In `presetTiersOnly` consumers, the button is disabled
 *   when the user is already on the top preset and a separate hint
 *   suggests donating from an external wallet.
 * - **`network`** gets **Try again**, which re-fires the mutation as-is.
 * - **Everything else** gets no action button — the user has to adjust
 *   amount or recipient (which the consumer's auto-dismiss effect uses
 *   to clear the alert) before retrying.
 *
 * The toast surface is intentionally not used for classified failures.
 * Toasts auto-dismiss and are visually disconnected from the fee picker;
 * an inline alert directly above Send keeps the recovery in the donor's
 * line of sight.
 */
export function BroadcastErrorAlert({
  error,
  currentFeeRate,
  feeSpeed,
  feeRates,
  isPending,
  onBumpFee,
  onRetry,
  presetTiersOnly,
}: BroadcastErrorAlertProps) {
  const { t } = useTranslation();

  const { title, body } = useMemo(() => {
    switch (error.kind) {
      case 'feeTooLow':
        return {
          title: t('walletSend.broadcastError.feeTooLowTitle'),
          body: error.minRelayFeeRate
            ? t('walletSend.broadcastError.feeTooLowBodyWithMin', { min: error.minRelayFeeRate })
            : t('walletSend.broadcastError.feeTooLowBody'),
        };
      case 'rbfReplacementFeeTooLow':
        return {
          title: t('walletSend.broadcastError.rbfTitle'),
          body: t('walletSend.broadcastError.rbfBody'),
        };
      case 'mempoolFull':
        return {
          title: t('walletSend.broadcastError.mempoolFullTitle'),
          body: t('walletSend.broadcastError.mempoolFullBody'),
        };
      case 'network':
        return {
          title: t('walletSend.broadcastError.networkTitle'),
          body: t('walletSend.broadcastError.networkBody'),
        };
      case 'mempoolConflict':
        return {
          title: t('walletSend.broadcastError.mempoolConflictTitle'),
          body: t('walletSend.broadcastError.mempoolConflictBody'),
        };
      case 'tooLongChain':
        return {
          title: t('walletSend.broadcastError.tooLongChainTitle'),
          body: t('walletSend.broadcastError.tooLongChainBody'),
        };
      case 'badInputs':
        return {
          title: t('walletSend.broadcastError.badInputsTitle'),
          body: t('walletSend.broadcastError.badInputsBody'),
        };
      case 'absurdlyHighFee':
        return {
          title: t('walletSend.broadcastError.absurdlyHighFeeTitle'),
          body: t('walletSend.broadcastError.absurdlyHighFeeBody'),
        };
      case 'unknown':
      default:
        return {
          title: t('walletSend.broadcastError.unknownTitle'),
          // Fall back to the raw bitcoind / framing message so the donor
          // (or a support thread) has something concrete to act on. Empty
          // when the classifier had no message to preserve.
          body: 'raw' in error && error.raw ? error.raw : '',
        };
    }
  }, [error, t]);

  // Decide whether the bump-fee CTA is actually useful here. For consumers
  // that ship a custom-rate input (the HD wallet flow), the bump is always
  // useful — we either jump to a faster preset or escalate to a custom
  // rate seeded from the error. For preset-only consumers (the donate
  // flow), the button only makes sense while a faster preset exists; once
  // the user is on the top preset they need to switch to an external
  // wallet.
  const uniquePresets = feeRates ? getUniqueBitcoinFeeSpeeds(feeRates) : [];
  const isCustom = feeSpeed === 'custom';
  const isOnTopPreset =
    !isCustom
    && uniquePresets.length > 0
    // Cast through the preset union to avoid `.indexOf` narrowing
    // `feeSpeed` for the rest of the function body.
    && uniquePresets.indexOf(feeSpeed as Exclude<BitcoinFeeSpeed, 'custom'>) === 0;
  const haveFeeHint =
    error.kind === 'feeTooLow'
    && !!(error.minRelayFeeRate || error.actualFeeRate);

  const showBumpFee = isFeeRecoverable(error.kind) && !(presetTiersOnly && isOnTopPreset);
  const showAtMaxHint = presetTiersOnly && isOnTopPreset && isFeeRecoverable(error.kind);
  const canBumpUsefully =
    !isOnTopPreset || haveFeeHint || isCustom || !!currentFeeRate;

  const showRetry = error.kind === 'network';

  return (
    <Alert variant="destructive" className="py-2.5">
      <AlertTriangle className="size-4" />
      <AlertTitle className="text-sm">{title}</AlertTitle>
      {body && <AlertDescription className="text-xs mt-1">{body}</AlertDescription>}
      {showAtMaxHint && (
        <AlertDescription className="text-xs mt-1 font-medium">
          {t('walletSend.broadcastError.atMaxFeeTier')}
        </AlertDescription>
      )}
      {(showBumpFee || showRetry) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {showBumpFee && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onBumpFee}
              disabled={isPending || !canBumpUsefully}
            >
              {t('walletSend.broadcastError.useHigherFee')}
            </Button>
          )}
          {showRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isPending}
            >
              {t('walletSend.broadcastError.tryAgain')}
            </Button>
          )}
        </div>
      )}
    </Alert>
  );
}
