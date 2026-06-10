import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, PauseCircle } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { useHdWalletSp } from '@/hooks/useHdWalletSpContext';

interface SilentPaymentScanStatusProps {
  /** Opens the scan options / advanced dialog. */
  onOpenScanDialog: () => void;
}

/**
 * Compact, always-visible status line for the silent-payment background
 * scanner, rendered on the Private wallet tab.
 *
 * Scanning runs automatically in the `HdWalletSpProvider` regardless of which
 * page the user is on, so this surface is purely a *reflection* of that shared
 * state plus an escape hatch into the full scan dialog (manual ranges,
 * deep rescans, reconcile). It never starts a scan itself.
 */
export function SilentPaymentScanStatus({ onOpenScanDialog }: SilentPaymentScanStatusProps) {
  const { t } = useTranslation();
  const sp = useHdWalletSp();

  if (!sp.enabled) return null;

  const scanHeight = sp.storage?.scanHeight ?? 0;

  const scanOptionsButton = (
    <button
      type="button"
      onClick={onOpenScanDialog}
      className="text-muted-foreground hover:text-foreground underline underline-offset-4 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm cursor-pointer"
    >
      {t('spAutoScan.manualLink')}
    </button>
  );

  // While scanning, surface a proper progress bar (matching the scan dialog)
  // instead of a lone spinner, so completeness is visible at a glance.
  if (sp.isScanning && sp.scanProgress) {
    const { currentHeight, fromHeight, toHeight } = sp.scanProgress;
    const progressPercent = Math.min(
      100,
      Math.round(
        ((currentHeight - fromHeight + 1) /
          Math.max(1, toHeight - fromHeight + 1)) *
          100,
      ),
    );

    return (
      <div className="space-y-2">
        <Progress value={progressPercent} className="h-2" />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {t('spAutoScan.scanning', {
              current: currentHeight.toLocaleString(),
              to: toHeight.toLocaleString(),
            })}
          </span>
          {scanOptionsButton}
        </div>
      </div>
    );
  }

  let content: React.ReactNode;
  if (!sp.autoScanEnabled) {
    content = (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <PauseCircle className="size-3" />
        {t('spAutoScan.paused')}
      </span>
    );
  } else if (scanHeight > 0 && sp.tipHeight !== undefined && scanHeight >= sp.tipHeight) {
    content = (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CheckCircle2 className="size-3 text-green-500" />
        {t('spAutoScan.caughtUp')}
      </span>
    );
  } else if (scanHeight > 0) {
    content = (
      <span className="text-muted-foreground">
        {t('spAutoScan.lastScanned', { height: scanHeight.toLocaleString() })}
      </span>
    );
  } else {
    content = (
      <span className="text-muted-foreground">{t('spAutoScan.neverScanned')}</span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {content}
      <span aria-hidden className="text-muted-foreground/40">
        ·
      </span>
      {scanOptionsButton}
    </div>
  );
}
