import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useHdWalletSp } from '@/hooks/useHdWalletSp';

// ---------------------------------------------------------------------------
// HD wallet — silent-payment "Scan history" dialog
// ---------------------------------------------------------------------------
//
// Walks the user through running a BIP-352 chain scan from a configurable
// starting height up to the current indexer tip. Defaults to
// "last scanned height + 1", which is the common forward-catch-up case;
// advanced users can edit the starting bound for a targeted backfill.
// The scan always runs to the tip — to stop early, hit Cancel.
// ---------------------------------------------------------------------------

interface HDSilentPaymentScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HDSilentPaymentScanDialog({ open, onOpenChange }: HDSilentPaymentScanDialogProps) {
  const { t } = useTranslation();
  const sp = useHdWalletSp();
  const [from, setFrom] = useState('');
  const [touched, setTouched] = useState(false);
  const [includeSpent, setIncludeSpent] = useState(false);

  // Seed defaults whenever the dialog opens or upstream data changes.
  useEffect(() => {
    if (!open) {
      setTouched(false);
      setIncludeSpent(false);
      return;
    }
    if (touched) return;
    const tip = sp.tipHeight;
    const lastScanned = sp.storage?.scanHeight ?? 0;
    const defaultFrom = lastScanned > 0 ? lastScanned + 1 : tip ? Math.max(0, tip - 144) : 0;
    setFrom(String(defaultFrom));
  }, [open, sp.tipHeight, sp.storage?.scanHeight, touched]);

  const fromNum = Number(from);
  const fromValid = Number.isInteger(fromNum) && fromNum >= 0;
  const inputsValid = fromValid;

  const handleScan = async () => {
    if (!inputsValid) return;
    await sp.scanRange({
      fromHeight: fromNum,
      includeSpent,
    });
  };

  const progressPercent = sp.scanProgress
    ? Math.min(
        100,
        Math.round(
          ((sp.scanProgress.currentHeight - sp.scanProgress.fromHeight + 1) /
            Math.max(1, sp.scanProgress.toHeight - sp.scanProgress.fromHeight + 1)) *
            100,
        ),
      )
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('spScan.title')}</DialogTitle>
          <DialogDescription>
            {t('spScan.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sp-scan-from" className="text-xs">
              {t('spScan.fromBlock')}
            </Label>
            <Input
              id="sp-scan-from"
              type="number"
              inputMode="numeric"
              min={0}
              value={from}
              onChange={(e) => {
                setTouched(true);
                setFrom(e.target.value);
              }}
              disabled={sp.isScanning}
              aria-invalid={!fromValid}
            />
          </div>

          {sp.tipHeight !== undefined && (
            <p className="text-xs text-muted-foreground">
              {t('spScan.indexerTip')}: <span className="font-mono">{sp.tipHeight.toLocaleString()}</span>
              {sp.storage && (
                <>
                  {' · '}
                  {t('spScan.lastFullyScanned')}:{' '}
                  <span className="font-mono">
                    {sp.storage.scanHeight > 0 ? sp.storage.scanHeight.toLocaleString() : t('spScan.never')}
                  </span>
                </>
              )}
            </p>
          )}

          {/*
            * "Include already-spent" deep-rescan toggle. Off by default
            * because the normal scan path doesn't want already-spent
            * outputs cluttering the active UTXO set. Turn on to recover
            * historical receive rows whose UTXOs were later spent and
            * subsequently pruned from local storage — matches against
            * spent outputs are routed straight into the `spent` archive,
            * which powers both the receive-history rows and the
            * send-vs-receive classifier in the tx list.
            */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="sp-include-spent"
              checked={includeSpent}
              onCheckedChange={(v) => setIncludeSpent(v === true)}
              disabled={sp.isScanning}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="sp-include-spent" className="text-xs cursor-pointer">
                {t('spScan.includeSpent')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('spScan.includeSpentDesc')}
              </p>
            </div>
          </div>

          {sp.isScanning && sp.scanProgress && (
            <div className="space-y-2">
              <Progress value={progressPercent} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  {t('spScan.blockProgress', {
                    current: sp.scanProgress.currentHeight.toLocaleString(),
                    to: sp.scanProgress.toHeight.toLocaleString(),
                  })}
                </span>
                <span>
                  {t('spScan.matches', { count: sp.scanProgress.matchesFound })}
                </span>
              </div>
            </div>
          )}

          {!sp.isScanning && sp.scanError && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p>{sp.scanError.message}</p>
            </div>
          )}

          {!sp.isScanning && !sp.scanError && sp.scanProgress && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-green-500" />
              <p>
                {t('spScan.scannedRange', {
                  from: sp.scanProgress.fromHeight.toLocaleString(),
                  to: sp.scanProgress.currentHeight.toLocaleString(),
                })}{' '}
                {sp.scanProgress.matchesFound > 0
                  ? t('spScan.foundOutputs', { count: sp.scanProgress.matchesFound })
                  : t('spScan.noNewPayments')}
              </p>
            </div>
          )}

          {/* ── Reconcile spent UTXOs ──────────────────────────── */}
          {/*
            * Manual fix-up path for SP UTXOs that were spent outside the
            * local send flow — different device, or a build that predates
            * the send-time prune logic. Walks the stored set, asks
            * Blockbook for each output's spent status, and drops the spent
            * ones. Capped at 50 UTXOs per click; subsequent clicks pick up
            * any remainder.
            */}
          {sp.storage && sp.storage.utxos.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('spScan.reconcile.title')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('spScan.reconcile.description')}
                </p>
              </div>

              {sp.reconcileProgress && !sp.reconcileError && (
                <p className="text-xs text-muted-foreground">
                  {sp.isReconciling
                    ? t('spScan.reconcile.checking', {
                        checked: sp.reconcileProgress.checked,
                        total: sp.reconcileProgress.total,
                      })
                    : t('spScan.reconcile.checked', {
                        count: sp.reconcileProgress.checked,
                        pruned: sp.reconcileProgress.prunedSoFar,
                      })}
                </p>
              )}

              {sp.reconcileError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <p>{sp.reconcileError.message}</p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void sp.reconcileSpentUtxos();
                }}
                disabled={sp.isReconciling || sp.isScanning}
              >
                {sp.isReconciling ? (
                  <>
                    <Loader2 className="size-3 animate-spin mr-2" />
                    {t('spScan.reconcile.reconciling')}
                  </>
                ) : (
                  t('spScan.reconcile.reconcileNow')
                )}
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {sp.isScanning ? (
              <Button variant="outline" onClick={() => sp.cancelScan()}>
                {t('common.cancel')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('common.close')}
                </Button>
                <Button onClick={handleScan} disabled={!inputsValid}>
                  {t('spScan.startScan')}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
