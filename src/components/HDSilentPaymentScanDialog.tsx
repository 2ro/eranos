import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useHdWalletSp } from '@/hooks/useHdWalletSp';

// ---------------------------------------------------------------------------
// HD wallet — silent-payment "Scan history" dialog
// ---------------------------------------------------------------------------
//
// Walks the user through running a BIP-352 chain scan over a configurable
// block range. Defaults to "from last scanned height → tip", which is the
// common forward-catch-up case; advanced users can edit the bounds for a
// targeted backfill.
// ---------------------------------------------------------------------------

export interface HDSilentPaymentScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HDSilentPaymentScanDialog({ open, onOpenChange }: HDSilentPaymentScanDialogProps) {
  const sp = useHdWalletSp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [touched, setTouched] = useState(false);

  // Seed defaults whenever the dialog opens or upstream data changes.
  useEffect(() => {
    if (!open) {
      setTouched(false);
      return;
    }
    if (touched) return;
    const tip = sp.tipHeight;
    const lastScanned = sp.storage?.scanHeight ?? 0;
    const defaultFrom = lastScanned > 0 ? lastScanned + 1 : tip ? Math.max(0, tip - 144) : 0;
    setFrom(String(defaultFrom));
    setTo(tip ? String(tip) : '');
  }, [open, sp.tipHeight, sp.storage?.scanHeight, touched]);

  const fromNum = Number(from);
  const toNum = Number(to);
  const fromValid = Number.isInteger(fromNum) && fromNum >= 0;
  const toValid = to === '' || (Number.isInteger(toNum) && toNum >= fromNum);
  const inputsValid = fromValid && toValid;

  const handleScan = async () => {
    if (!inputsValid) return;
    await sp.scanRange({
      fromHeight: fromNum,
      toHeight: to === '' ? undefined : toNum,
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
          <DialogTitle>Scan for silent payments</DialogTitle>
          <DialogDescription>
            Walks the configured BIP-352 indexer block-by-block to detect incoming silent payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-scan-from" className="text-xs">
                From block
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
            <div className="space-y-1.5">
              <Label htmlFor="sp-scan-to" className="text-xs">
                To block
              </Label>
              <Input
                id="sp-scan-to"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="tip"
                value={to}
                onChange={(e) => {
                  setTouched(true);
                  setTo(e.target.value);
                }}
                disabled={sp.isScanning}
                aria-invalid={!toValid}
              />
            </div>
          </div>

          {sp.tipHeight !== undefined && (
            <p className="text-xs text-muted-foreground">
              Indexer tip: <span className="font-mono">{sp.tipHeight.toLocaleString()}</span>
              {sp.storage && (
                <>
                  {' · '}
                  Last fully scanned:{' '}
                  <span className="font-mono">
                    {sp.storage.scanHeight > 0 ? sp.storage.scanHeight.toLocaleString() : 'never'}
                  </span>
                </>
              )}
            </p>
          )}

          {sp.isScanning && sp.scanProgress && (
            <div className="space-y-2">
              <Progress value={progressPercent} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  Block {sp.scanProgress.currentHeight.toLocaleString()} /{' '}
                  {sp.scanProgress.toHeight.toLocaleString()}
                </span>
                <span>
                  {sp.scanProgress.matchesFound} match
                  {sp.scanProgress.matchesFound === 1 ? '' : 'es'}
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
                Scanned blocks {sp.scanProgress.fromHeight.toLocaleString()} →{' '}
                {sp.scanProgress.currentHeight.toLocaleString()}.{' '}
                {sp.scanProgress.matchesFound > 0
                  ? `Found ${sp.scanProgress.matchesFound} new ${
                      sp.scanProgress.matchesFound === 1 ? 'output' : 'outputs'
                    }.`
                  : 'No new payments.'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {sp.isScanning ? (
              <Button variant="outline" onClick={() => sp.cancelScan()}>
                Cancel
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button onClick={handleScan} disabled={!inputsValid}>
                  Start scan
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
