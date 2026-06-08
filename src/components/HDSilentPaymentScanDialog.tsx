import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { useHdWalletSp } from '@/hooks/useHdWalletSpContext';
import { useToast } from '@/hooks/useToast';

// ---------------------------------------------------------------------------
// HD wallet — silent-payment "Scan history" dialog
// ---------------------------------------------------------------------------
//
// Walks the user through running a BIP-352 chain scan up to the current
// indexer tip. The primary control is a relative time window ("Since")
// because most users know when they expect a payment, not which block it
// landed in. The selected time window is resolved to a block height on start
// via mempool.space's timestamp-to-block endpoint, then passed to the
// existing scanRange API. If mempool.space is unreachable, the dialog
// surfaces a toast pointing the user at the Advanced → From block escape
// hatch instead of stalling on a slow indexer fallback.
//
// Power users can override the resolved starting height (or toggle
// rebuild-from-spent rescans) under the "Advanced" disclosure.
// ---------------------------------------------------------------------------

interface HDSilentPaymentScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Since" presets — relative time windows expressed in wall-clock seconds.
 * Block height is resolved from real block timestamps at scan time, not by
 * assuming an average block interval.
 */
const PRESETS = {
  lastHour: { seconds: 60 * 60 },
  last3h: { seconds: 3 * 60 * 60 },
  last24h: { seconds: 24 * 60 * 60 },
  lastWeek: { seconds: 7 * 24 * 60 * 60 },
  lastMonth: { seconds: 30 * 24 * 60 * 60 },
} as const;

type PresetId = keyof typeof PRESETS;

/**
 * Sentinel for the "Custom" Since option — selects a user-supplied window
 * in hours instead of a fixed preset. The hours value lives in its own
 * input rendered conditionally under the Select.
 */
const CUSTOM_SINCE = 'custom' as const;
type SinceId = PresetId | typeof CUSTOM_SINCE;

const PRESET_ORDER: PresetId[] = ['lastHour', 'last3h', 'last24h', 'lastWeek', 'lastMonth'];
const SINCE_ORDER: SinceId[] = [...PRESET_ORDER, CUSTOM_SINCE];
const DEFAULT_SINCE: SinceId = 'lastHour';
// Bitcoin block timestamps aren't strictly monotonic — the consensus rule is
// only that a block's timestamp must exceed the median of the previous 11
// (the "median-time-past" rule, BIP-113). So a block at height H can carry a
// timestamp earlier than its predecessor's, but no inversion can drag a block
// more than 11 positions out of timestamp order. Rewinding by 11 blocks from
// mempool.space's "highest block with ts <= cutoff" guarantees we don't skip
// past a payment whose containing block has an out-of-order timestamp near
// the boundary. The cost is ~11 extra block fetches on the SP scanner.
const TIME_RESOLUTION_SAFETY_BLOCKS = 11;
const MEMPOOL_TIMESTAMP_BLOCK_URL = 'https://mempool.space/api/v1/mining/blocks/timestamp';

interface MempoolTimestampBlockResponse {
  height?: unknown;
}

async function fetchMempoolTimestampBlockHeight(cutoffTime: number): Promise<number> {
  const response = await fetch(`${MEMPOOL_TIMESTAMP_BLOCK_URL}/${cutoffTime}`);
  if (!response.ok) {
    throw new Error(`mempool.space timestamp lookup returned ${response.status}`);
  }

  const data = (await response.json()) as MempoolTimestampBlockResponse;
  if (typeof data.height !== 'number' || !Number.isInteger(data.height) || data.height < 0) {
    throw new Error('mempool.space timestamp lookup missing valid block height');
  }

  return data.height;
}

/**
 * Resolves a wall-clock time window (in seconds) to the scan start block.
 * mempool.space's timestamp-to-block endpoint is the only source of truth;
 * if it's unreachable the caller surfaces a toast pointing the user at
 * Advanced → From block. The 11-block rewind (see
 * TIME_RESOLUTION_SAFETY_BLOCKS) covers BIP-113 timestamp inversions.
 *
 * The start block is the literal window boundary — we deliberately don't
 * clamp it forward to the wallet's last scanned height. Re-scanning blocks
 * we've already scanned is cheap (the indexer is just iterating tweak data)
 * and is exactly what the user asked for. The previous "forward only" clamp
 * silently degraded "Last week" into a no-op when the wallet had been
 * scanned more recently, which made the dialog useless for the case it was
 * designed to fix.
 */
async function resolveWindowFromHeight(
  windowSeconds: number,
  tipHeight: number,
): Promise<number> {
  const cutoffTime = Math.floor(Date.now() / 1000) - windowSeconds;
  let boundary = await fetchMempoolTimestampBlockHeight(cutoffTime);
  boundary = Math.min(boundary, tipHeight);
  return Math.max(0, boundary - TIME_RESOLUTION_SAFETY_BLOCKS);
}

export function HDSilentPaymentScanDialog({ open, onOpenChange }: HDSilentPaymentScanDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sp = useHdWalletSp();
  const [since, setSince] = useState<SinceId>(DEFAULT_SINCE);
  const [customHours, setCustomHours] = useState('');
  const [fromOverride, setFromOverride] = useState('');
  const [includeSpent, setIncludeSpent] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isResolvingSince, setIsResolvingSince] = useState(false);

  // Reset all local state when the dialog closes so reopening always
  // starts from a clean, conservative default.
  useEffect(() => {
    if (!open) {
      setSince(DEFAULT_SINCE);
      setCustomHours('');
      setFromOverride('');
      setIncludeSpent(false);
      setAdvancedOpen(false);
      setIsResolvingSince(false);
    }
  }, [open]);

  // Parse the override input. Empty string means "no override".
  const overrideTrimmed = fromOverride.trim();
  const overrideParsed = overrideTrimmed === '' ? undefined : Number(overrideTrimmed);
  const overrideValid =
    overrideTrimmed === '' ||
    (Number.isInteger(overrideParsed) && (overrideParsed as number) >= 0);

  // Effective starting height for the manual override path. The Since path is
  // resolved asynchronously on submit from real block timestamps.
  const effectiveFrom = overrideTrimmed !== '' ? overrideParsed : undefined;

  // Parse the Custom hours input. Allow fractional hours (e.g. 0.5 for 30
  // minutes) but reject zero / negative / non-finite values. Empty string
  // means "not yet entered" — the Start button stays disabled until the
  // user actually types a number.
  const customTrimmed = customHours.trim();
  const customParsed = customTrimmed === '' ? undefined : Number(customTrimmed);
  const customValid =
    customTrimmed === '' ||
    (typeof customParsed === 'number' &&
      Number.isFinite(customParsed) &&
      (customParsed as number) > 0);
  const customSeconds =
    typeof customParsed === 'number' && customValid && customParsed > 0
      ? Math.round(customParsed * 60 * 60)
      : undefined;

  const tipHeight = sp.tipHeight;
  // Only the manual From-block override has a real "nothing to scan" state —
  // typing a height past the tip would produce an empty range. The Since
  // presets don't have an equivalent: re-scanning blocks we've already
  // scanned is cheap and is what the user asked for, so we never block the
  // Start button just because scanHeight has caught up to the tip.
  const isManualUpToDate =
    tipHeight !== undefined && effectiveFrom !== undefined && effectiveFrom > tipHeight;

  // Disable Start when:
  //  - the override field has garbage in it (input is invalid)
  //  - we still don't know the tip and the user hasn't overridden
  //  - the manual override is past the tip (nothing to scan)
  //  - the user picked Custom but hasn't entered a valid hour value yet
  const sinceReady = since === CUSTOM_SINCE ? customSeconds !== undefined : true;
  const canStart =
    overrideValid &&
    customValid &&
    (overrideTrimmed !== '' ? effectiveFrom !== undefined : tipHeight !== undefined) &&
    sinceReady &&
    !isManualUpToDate &&
    !sp.isScanning &&
    !isResolvingSince;

  const handleScan = async () => {
    if (!canStart) return;

    if (overrideTrimmed !== '') {
      if (effectiveFrom === undefined) return;
      await sp.scanRange({
        fromHeight: effectiveFrom,
        includeSpent,
      });
      return;
    }

    if (tipHeight === undefined) return;

    // Resolve the selected "Since" option to a window in seconds. Custom
    // pulls from the hours input; everything else is a fixed preset.
    const windowSeconds =
      since === CUSTOM_SINCE ? customSeconds : PRESETS[since].seconds;
    if (windowSeconds === undefined) return;

    setIsResolvingSince(true);
    try {
      const fromHeight = await resolveWindowFromHeight(
        windowSeconds,
        tipHeight,
      );
      await sp.scanRange({
        fromHeight,
        includeSpent,
      });
    } catch {
      // mempool.space is the only path now — when it's down, point the
      // user at the Advanced → From block escape hatch and auto-open it.
      toast({
        title: t('spScan.resolveFailed.title'),
        description: t('spScan.resolveFailed.description'),
        variant: 'destructive',
      });
      setAdvancedOpen(true);
    } finally {
      setIsResolvingSince(false);
    }
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
          {/* Automatic background scanning toggle. When on, the provider
              quietly resumes scanning from the last block and keeps up with
              the tip without the user opening this dialog. The manual
              controls below remain available for targeted/deep rescans. */}
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="sp-auto-scan" className="text-sm cursor-pointer">
                {t('spScan.autoScan.label')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('spScan.autoScan.description')}
              </p>
            </div>
            <Switch
              id="sp-auto-scan"
              checked={sp.autoScanEnabled}
              onCheckedChange={(v) => sp.setAutoScanEnabled(v)}
              className="mt-0.5"
            />
          </div>

          {/* Primary control: relative time window. */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-scan-since" className="text-xs">
              {t('spScan.since')}
            </Label>
            <Select
              value={since}
              onValueChange={(v) => setSince(v as SinceId)}
              disabled={sp.isScanning}
            >
              <SelectTrigger id="sp-scan-since">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SINCE_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`spScan.preset.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom hours input — only renders when Custom is selected.
                Accepts fractional values (e.g. 0.5 = 30 minutes) and the
                Start button stays disabled until a positive number is
                entered, so there's no ambiguous "empty == zero" submit. */}
            {since === CUSTOM_SINCE && (
              <div className="pt-1.5 space-y-1.5">
                <Label htmlFor="sp-scan-custom-hours" className="text-xs">
                  {t('spScan.customHours')}
                </Label>
                <Input
                  id="sp-scan-custom-hours"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder={t('spScan.customHoursPlaceholder')}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  disabled={sp.isScanning}
                  aria-invalid={!customValid}
                />
              </div>
            )}
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
              {/* From-block override. Empty by default. When non-empty, this
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
          {!sp.isScanning && isManualUpToDate && (
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

          <div className="pt-2">
            {sp.isScanning ? (
              <Button variant="outline" className="w-full" onClick={() => sp.cancelScan()}>
                {t('common.cancel')}
              </Button>
            ) : (
              <Button className="w-full" onClick={handleScan} disabled={!canStart}>
                {isResolvingSince && <Loader2 className="size-4 animate-spin mr-2" />}
                {t('spScan.startScan')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
