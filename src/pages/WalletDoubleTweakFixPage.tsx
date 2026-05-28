import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Wallet as WalletIcon,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useHdWalletDoubleTweakRecovery } from '@/hooks/useHdWalletDoubleTweakRecovery';
import { useHdBtcPrice } from '@/hooks/useHdBtcPrice';
import { broadcastBlockbookTx } from '@/lib/hdwallet/blockbook';
import {
  buildDoubleTweakSweepPsbt,
  signDoubleTweakSweep,
} from '@/lib/hdwallet/sp/recovery';
import { logger } from '@/lib/logger';
import { formatBTC, satsToUSD } from '@/lib/bitcoin';

type Step = 'idle' | 'sweeping' | 'success' | 'error';

/** sat/vB — conservative default for the recovery sweep. */
const SWEEP_FEE_RATE = 5;

/**
 * Recovery page at `/wallet/double-tweak-fix`.
 *
 * Re-scans the BIP-352 indexer for silent-payment outputs stranded by the
 * historical double-tweak bug (`btc.p2tr(P_k)` shipped `taproot_tweak(P_k)`
 * on chain instead of `P_k`). Found outputs are swept into a fresh BIP-86
 * receive address using `taprootTweakPrivKey(b_spend + t_k)` as the signing
 * key. Nothing is persisted — the recovered coins move straight into the
 * spendable BIP-86 wallet.
 */
export function WalletDoubleTweakFixPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const recovery = useHdWalletDoubleTweakRecovery();
  const wallet = useHdWallet();
  const { data: btcPrice } = useHdBtcPrice();

  const blockbookUrl = (config.blockbookBaseUrl ?? '').trim();
  const destinationAddress = wallet.currentReceiveAddress?.address;

  const [fromHeight, setFromHeight] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [sweptSats, setSweptSats] = useState<number | null>(null);

  useSeoMeta({
    title: `${t('walletDoubleTweak.seoTitle')} | ${config.appName}`,
    description: t('walletDoubleTweak.seoDescription'),
  });

  // Pre-fill the start height once the indexer tip resolves.
  useEffect(() => {
    if (fromHeight === '' && recovery.defaultFromHeight !== undefined) {
      setFromHeight(String(recovery.defaultFromHeight));
    }
  }, [recovery.defaultFromHeight, fromHeight]);

  const fromHeightNum = useMemo(() => {
    const n = parseInt(fromHeight, 10);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  }, [fromHeight]);

  async function runScan() {
    if (fromHeightNum === undefined) return;
    setStep('idle');
    setError(null);
    setTxid(null);
    try {
      await recovery.scan({ fromHeight: fromHeightNum });
    } catch (err) {
      logger.error('[DoubleTweakFix] scan failed', err);
    }
  }

  async function runSweep() {
    if (!recovery.seed || !recovery.matches.length) return;
    if (!destinationAddress) {
      setError(t('walletDoubleTweak.errors.noDestination'));
      setStep('error');
      return;
    }
    if (!blockbookUrl) {
      setError(t('walletDoubleTweak.errors.noBlockbook'));
      setStep('error');
      return;
    }

    setError(null);
    setStep('sweeping');
    try {
      const built = buildDoubleTweakSweepPsbt({
        matches: recovery.matches,
        destination: destinationAddress,
        feeRate: SWEEP_FEE_RATE,
      });
      const txHex = signDoubleTweakSweep(built.psbtHex, recovery.matches, recovery.seed);
      const broadcastTxid = await broadcastBlockbookTx(blockbookUrl, txHex);

      setTxid(broadcastTxid);
      setSweptSats(built.amountSats);
      setStep('success');
      recovery.reset();
      void wallet.refetch();

      toast({
        title: t('walletDoubleTweak.toast.successTitle'),
        description: t('walletDoubleTweak.toast.successDesc', {
          sats: built.amountSats.toLocaleString(),
        }),
      });
    } catch (err) {
      logger.error('[DoubleTweakFix] sweep failed', err);
      setError(err instanceof Error ? err.message : t('walletDoubleTweak.errors.sweepGeneric'));
      setStep('error');
    }
  }

  // ── Availability gates ───────────────────────────────────────
  if (recovery.unavailableReason === 'logged-out') {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader backTo="/wallet/legacy" alwaysShowBack title={t('walletDoubleTweak.title')} />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <WalletIcon className="size-8 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t('walletDoubleTweak.loggedOut')}
          </p>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  if (recovery.unavailableReason === 'unsupported-signer') {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader backTo="/wallet/legacy" alwaysShowBack title={t('walletDoubleTweak.title')} />
        <div className="px-4 py-10">
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('walletDoubleTweak.unsupported.title')}</AlertTitle>
            <AlertDescription>{t('walletDoubleTweak.unsupported.description')}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  if (recovery.unavailableReason === 'no-indexer') {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader backTo="/wallet/legacy" alwaysShowBack title={t('walletDoubleTweak.title')} />
        <div className="px-4 py-10">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('walletDoubleTweak.noIndexer.title')}</AlertTitle>
            <AlertDescription>{t('walletDoubleTweak.noIndexer.description')}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  const hasMatches = recovery.matches.length > 0;
  const scannedClean =
    !recovery.isScanning &&
    !hasMatches &&
    recovery.scanProgress !== undefined &&
    !recovery.scanError &&
    step !== 'success';

  return (
    <main className="max-w-md mx-auto">
      <PageHeader backTo="/wallet/legacy" alwaysShowBack title={t('walletDoubleTweak.title')} />

      <div className="px-4 py-6 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('walletDoubleTweak.heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('walletDoubleTweak.subheading')}</p>
        </div>

        {/* Scan controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('walletDoubleTweak.scan.title')}</CardTitle>
            <CardDescription>{t('walletDoubleTweak.scan.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dt-from-height" className="text-xs">
                {t('walletDoubleTweak.scan.fromHeightLabel')}
              </Label>
              <Input
                id="dt-from-height"
                inputMode="numeric"
                value={fromHeight}
                onChange={(e) => setFromHeight(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={
                  recovery.defaultFromHeight !== undefined
                    ? String(recovery.defaultFromHeight)
                    : '—'
                }
                disabled={recovery.isScanning}
              />
              {recovery.tipHeight !== undefined && (
                <p className="text-[11px] text-muted-foreground">
                  {t('walletDoubleTweak.scan.tipHint', { tip: recovery.tipHeight.toLocaleString() })}
                </p>
              )}
            </div>

            {recovery.isScanning ? (
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={recovery.cancel}>
                  {t('walletDoubleTweak.scan.cancel')}
                </Button>
                {recovery.scanProgress && (
                  <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t('walletDoubleTweak.scan.progress', {
                      current: recovery.scanProgress.currentHeight.toLocaleString(),
                      to: recovery.scanProgress.toHeight.toLocaleString(),
                      found: recovery.scanProgress.matchesFound,
                    })}
                  </p>
                )}
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={runScan}
                disabled={fromHeightNum === undefined}
              >
                <Search className="size-4 mr-1.5" />
                {t('walletDoubleTweak.scan.start')}
              </Button>
            )}

            {recovery.scanError && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{recovery.scanError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {scannedClean && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <p className="text-base font-medium">{t('walletDoubleTweak.noFunds.title')}</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('walletDoubleTweak.noFunds.description')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results + sweep */}
        {hasMatches && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('walletDoubleTweak.found.title')}</CardTitle>
                <CardDescription>{t('walletDoubleTweak.found.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">{t('walletDoubleTweak.found.count')}</span>
                  <span className="font-mono">{recovery.matches.length}</span>
                </div>
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="font-medium">{t('walletDoubleTweak.found.recoverable')}</span>
                  <span className="font-mono font-medium">
                    {btcPrice
                      ? satsToUSD(recovery.recoverableSats, btcPrice)
                      : `${formatBTC(recovery.recoverableSats)} BTC`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {destinationAddress && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('walletDoubleTweak.destination.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('walletDoubleTweak.destination.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs font-mono">
                    {destinationAddress}
                  </code>
                </CardContent>
              </Card>
            )}

            {step === 'idle' && (
              <Button
                size="lg"
                className="w-full rounded-full h-12"
                onClick={runSweep}
                disabled={!destinationAddress}
              >
                {t('walletDoubleTweak.sweepButton')}
              </Button>
            )}

            {step === 'sweeping' && (
              <Card>
                <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">{t('walletDoubleTweak.sweeping')}</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {t('walletDoubleTweak.dontClose')}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {step === 'success' && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
              <div className="p-3 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold">{t('walletDoubleTweak.success.title')}</p>
                {sweptSats !== null && (
                  <p className="text-sm text-muted-foreground">
                    {t('walletDoubleTweak.success.sent', { sats: sweptSats.toLocaleString() })}
                  </p>
                )}
              </div>
              {txid && (
                <Button variant="outline" asChild>
                  <Link to={`/i/bitcoin:tx:${txid}`}>{t('walletDoubleTweak.success.viewTx')}</Link>
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/wallet')}>
                {t('walletDoubleTweak.back')}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'error' && (
          <Card>
            <CardContent className="py-6 space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>{t('walletDoubleTweak.error.title')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => setStep('idle')}>
                {t('walletDoubleTweak.error.tryAgain')}
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('walletDoubleTweak.footnote')}
        </p>
      </div>
    </main>
  );
}

export default WalletDoubleTweakFixPage;
