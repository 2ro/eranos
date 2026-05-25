import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHdWalletSp } from '@/hooks/useHdWalletSp';

// ---------------------------------------------------------------------------
// HD wallet — silent-payment "Scan history" dialog
// ---------------------------------------------------------------------------
//
// Walks the user through running a BIP-352 chain scan up to the current
// indexer tip. The primary control is a relative time window ("Since")
// because most users know when they expect a payment, not which block it
// landed in. Block-count math is done client-side from the BlindBit
// `/info` tip.
//
// Power users can override the resolved starting height (or toggle
// rebuild-from-spent rescans) under the "Advanced" disclosure.
// ---------------------------------------------------------------------------

interface HDSilentPaymentScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Since" presets — relative time windows expressed in block counts.
 *
 * Block intervals follow an exponential distribution with a mean of ~10
 * minutes, so we pad each preset to absorb short-run variance. Re-scanning
 * already-covered blocks is cheap and idempotent (mergeUtxos dedupes,
 * scanHeight is monotonic), so we round generously — missing a payment is
 * the failure mode we care about.
 *
 * Safety factor decreases with window length because variance averages out:
 *   1h  → 2.0×   (high variance dominates)
 *   3h  → 1.5×
 *   24h → 1.1×   (mean dominates)
 *   7d  → 1.1×
 *   30d → 1.1×
 */
const PRESETS = {
  lastHour: { blocks: 12 },
  last3h: { blocks: 27 },
  last24h: { blocks: 158 },
  lastWeek: { blocks: 1110 },
  lastMonth: { blocks: 4752 },
} as const;

type PresetId = keyof typeof PRESETS;

const PRESET_ORDER: PresetId[] = ['lastHour', 'last3h', 'last24h', 'lastWeek', 'lastMonth'];
const DEFAULT_PRESET: PresetId = 'lastHour';

/**
 * Resolves the starting block height that a scan would actually use given
 * the current wallet state and a selected preset. Clamps upward to
 * `scanHeight + 1` so re-opening the dialog after a recent scan never
 * walks blocks the wallet already covered.
 */
function resolveFromHeight(
  preset: PresetId,
  tipHeight: number | undefined,
  scanHeight: number | undefined,
): number | undefined {
  if (tipHeight === undefined) return undefined;
  const target = Math.max(0, tipHeight - PRESETS[preset].blocks);
  const resume = (scanHeight ?? 0) + 1;
  return Math.max(resume, target);
}

export function HDSilentPaymentScanDialog({ open, onOpenChange }: HDSilentPaymentScanDialogProps) {
  const { t } = useTranslation();
  const sp = useHdWalletSp();
  const [since, setSince] = useState<PresetId>(DEFAULT_PRESET);
  const [fromOverride, setFromOverride] = useState('');
  const [includeSpent, setIncludeSpent] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Reset all local state when the dialog closes so reopening always
  // starts from a clean, conservative default.
  useEffect(() => {
    if (!open) {
      setSince(DEFAULT_PRESET);
      setFromOverride('');
      setIncludeSpent(false);
      setAdvancedOpen(false);
    }
  }, [open]);

  // Computed starting height when the override is empty. Drives both the
  // submit path and the placeholder hint shown inside Advanced.
  const computedFrom = useMemo(
    () => resolveFromHeight(since, sp.tipHeight, sp.storage?.scanHeight),
    [since, sp.tipHeight, sp.storage?.scanHeight],
  );

  // Parse the override input. Empty string means "no override".
  const overrideTrimmed = fromOverride.trim();
  const overrideParsed = overrideTrimmed === '' ? undefined : Number(overrideTrimmed);
  const overrideValid =
    overrideTrimmed === '' ||
    (Number.isInteger(overrideParsed) && (overrideParsed as number) >= 0);

  // Effective starting height. Override takes priority; otherwise the
  // preset-derived value.
  const effectiveFrom = overrideTrimmed !== '' ? overrideParsed : computedFrom;

  const tipHeight = sp.tipHeight;
  const isUpToDate =
    tipHeight !== undefined &&
    effectiveFrom !== undefined &&
    effectiveFrom > tipHeight;

  // Disable Start when:
  //  - the override field has garbage in it (input is invalid)
  //  - we still don't know the tip and the user hasn't overridden
  //  - the resolved range is empty (already up to date)
  const canStart =
    overrideValid &&
    effectiveFrom !== undefined &&
    !isUpToDate &&
    !sp.isScanning;

  const handleScan = async () => {
    if (!canStart || effectiveFrom === undefined) return;
    await sp.scanRange({
      fromHeight: effectiveFrom,
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
          <DialogDescription className="flex items-center gap-1.5">
            <span>{t('spScan.subtitle')}</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full cursor-pointer"
                  aria-label={t('spScan.descriptionHelp')}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="text-xs w-72">
                {t('spScan.description')}
              </PopoverContent>
            </Popover>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Primary control: relative time window. */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-scan-since" className="text-xs">
              {t('spScan.since')}
            </Label>
            <Select
              value={since}
              onValueChange={(v) => setSince(v as PresetId)}
              disabled={sp.isScanning}
            >
              <SelectTrigger id="sp-scan-since">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`spScan.preset.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced disclosure — collapsed by default, resets on close. */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm cursor-pointer"
              >
                {advancedOpen ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                {t('spScan.advanced')}
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 pt-3">
              {/* From-block override. Empty by default; the placeholder
                  shows what the Since selection would resolve to so the
                  user sees what they're overriding. When non-empty, this
                  value wins over the Since selection at submit time. */}
              <div className="space-y-1.5">
                <Label htmlFor="sp-scan-from" className="text-xs">
                  {t('spScan.fromBlock')}
                </Label>
                <Input
                  id="sp-scan-from"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={fromOverride}
                  placeholder={computedFrom !== undefined ? String(computedFrom) : ''}
                  onChange={(e) => setFromOverride(e.target.value)}
                  disabled={sp.isScanning}
                  aria-invalid={!overrideValid}
                />
              </div>

              {/* Indexer tip + last-scanned helper line. Kept as before
                  for power users diagnosing scan progress. */}
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

              {/* "Include already-spent" deep-rescan toggle. Off by
                  default; only useful when rebuilding receive history
                  after a missed scan or storage reset. */}
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
            </CollapsibleContent>
          </Collapsible>

          {/* Disabled-state hints below the primary control. Only the most
              relevant one renders so the dialog stays quiet. */}
          {!sp.isScanning && tipHeight === undefined && overrideTrimmed === '' && (
            <p className="text-xs text-muted-foreground">
              {t('spScan.connectingIndexer')}
            </p>
          )}
          {!sp.isScanning && isUpToDate && (
            <p className="text-xs text-muted-foreground">
              {t('spScan.upToDate')}
            </p>
          )}

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
              <Button onClick={handleScan} disabled={!canStart}>
                {t('spScan.startScan')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
