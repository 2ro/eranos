import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Wallet as WalletIcon,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useHdWalletV1Migration } from '@/hooks/useHdWalletV1Migration';
import { broadcastBlockbookTx } from '@/lib/hdwallet/blockbook';
import {
  buildHdSweepPsbt,
  finalizeHdPsbt,
  signHdPsbt,
  type HdInput,
} from '@/lib/hdwallet/transaction';
import { logger } from '@/lib/logger';
import { formatBTC } from '@/lib/bitcoin';

type Step = 'idle' | 'building' | 'signing' | 'broadcasting' | 'success' | 'error';

/** sat/vB — conservative default for a sweep tx; user has no fee control. */
const SWEEP_FEE_RATE = 5;

/**
 * One-shot migration UI for users whose nsec previously seeded the v1
 * Agora HD wallet. v1 used the raw nsec as the BIP-32 master seed; v2 (the
 * current scheme — see `src/lib/hdwallet/seed.ts`) feeds the nsec through
 * HKDF + BIP-39 + PBKDF2 to produce a portable mnemonic, which results in
 * completely different addresses for the same identity.
 *
 * The page builds a single sweep transaction that consumes every BIP-86
 * UTXO + every silent-payment UTXO held by the v1 wallet, and sends the
 * lot (minus fee) to a fresh v2 BIP-86 receive address. Once broadcast,
 * the user's funds live entirely under the v2 derivation and the v1
 * wallet falls dormant.
 *
 * The page is intentionally narrow: no per-UTXO selection, no fee
 * customisation, no Lightning. The only knob is "do the migration."
 */
export function WalletMigrateV1Page() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();

  const v1 = useHdWalletV1Migration();
  const v2 = useHdWallet();

  const blockbookUrl = (config.blockbookBaseUrl ?? '').trim();

  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [sweptSats, setSweptSats] = useState<number | null>(null);
  const [feeSats, setFeeSats] = useState<number | null>(null);

  useSeoMeta({
    title: `${t('walletMigrate.seoTitle')} | ${config.appName}`,
    description: t('walletMigrate.seoDescription'),
  });

  const destinationAddress = v2.currentReceiveAddress?.address;

  // ── Assemble the input list (BIP-86 UTXOs + SP UTXOs) ────────
  const inputs: HdInput[] = useMemo(() => {
    const out: HdInput[] = [];
    for (const u of v1.v1Scan?.utxos ?? []) {
      out.push({ kind: 'bip86', utxo: u });
    }
    for (const u of v1.v1Sp?.utxos ?? []) {
      out.push({
        kind: 'sp',
        utxo: {
          txid: u.txid,
          vout: u.vout,
          value: u.value,
          tweakHex: u.tweak,
          k: u.k,
          height: u.height,
        },
      });
    }
    return out;
  }, [v1.v1Scan, v1.v1Sp]);

  const hasFunds = v1.v1TotalBalance > 0 && inputs.length > 0;
  const hasSpFunds = (v1.v1SpBalance ?? 0) > 0;

  async function runMigration() {
    if (!v1.v1Account || !v1.v1Seed) {
      setError(t('walletMigrate.errors.noV1Account'));
      setStep('error');
      return;
    }
    if (!destinationAddress) {
      setError(t('walletMigrate.errors.noDestination'));
      setStep('error');
      return;
    }
    if (!blockbookUrl) {
      setError(t('walletMigrate.errors.noBlockbook'));
      setStep('error');
      return;
    }
    if (!hasFunds) {
      setError(t('walletMigrate.errors.noFunds'));
      setStep('error');
      return;
    }

    setError(null);
    setStep('building');

    try {
      // v1 fed the 32-byte nsec straight into `HDKey.fromMasterSeed`. The
      // unified derivation helpers now accept any BIP-32-compliant seed
      // length (16-64 bytes), so we pass `v1Seed` (the 32-byte nsec bytes)
      // through unchanged. Re-deriving with the v1 byte sequence
      // reproduces every leaf key, the BIP-86 chain, and `b_spend` —
      // exactly what the legacy wallet would have signed with.
      const built = buildHdSweepPsbt({
        account: v1.v1Account,
        inputs,
        destination: destinationAddress,
        feeRate: SWEEP_FEE_RATE,
        seed: hasSpFunds ? v1.v1Seed : undefined,
      });

      setFeeSats(built.fee);
      setSweptSats(built.amountSats);
      setStep('signing');

      const signedHex = signHdPsbt(
        built.psbtHex,
        built.inputDescriptors,
        v1.v1Account,
        hasSpFunds ? v1.v1Seed : undefined,
      );
      const txHex = finalizeHdPsbt(signedHex);

      setStep('broadcasting');
      const broadcastTxid = await broadcastBlockbookTx(blockbookUrl, txHex);
      setTxid(broadcastTxid);
      setStep('success');

      // Refresh both wallets so the UI reflects v1 = 0 and v2 = swept amount
      // on next page mount.
      void v1.refetch();
      void v2.refetch();

      toast({
        title: t('walletMigrate.toast.successTitle'),
        description: t('walletMigrate.toast.successDesc', {
          sats: built.amountSats.toLocaleString(),
        }),
      });
    } catch (err) {
      logger.error('[WalletMigrateV1] sweep failed', err);
      setError(err instanceof Error ? err.message : t('walletMigrate.errors.sweepGeneric'));
      setStep('error');
    }
  }

  // ── Logged-out / unavailable surfaces ────────────────────────
  if (v1.unavailableReason === 'logged-out') {
    return (
      <main>
        <PageHeader title={t('walletMigrate.title')} icon={<WalletIcon className="size-5" />} />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <WalletIcon className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">{t('walletMigrate.loggedOut.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('walletMigrate.loggedOut.description')}
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  if (v1.unavailableReason === 'unsupported-signer') {
    return (
      <main>
        <PageHeader title={t('walletMigrate.title')} icon={<WalletIcon className="size-5" />} />
        <div className="max-w-md mx-auto px-4 py-10 space-y-4">
          <Alert variant="default">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('walletMigrate.unsupported.title')}</AlertTitle>
            <AlertDescription>{t('walletMigrate.unsupported.description')}</AlertDescription>
          </Alert>
          <Button variant="ghost" onClick={() => navigate('/wallet')}>
            <ArrowLeft className="size-4 mr-1.5 rtl:rotate-180" />
            {t('walletMigrate.backToWallet')}
          </Button>
        </div>
      </main>
    );
  }

  if (v1.unavailableReason === 'no-blockbook') {
    return (
      <main>
        <PageHeader title={t('walletMigrate.title')} icon={<WalletIcon className="size-5" />} />
        <div className="max-w-md mx-auto px-4 py-10 space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t('walletMigrate.noBlockbook.title')}</AlertTitle>
            <AlertDescription>{t('walletMigrate.noBlockbook.description')}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('walletMigrate.title')} icon={<WalletIcon className="size-5" />} />

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/wallet">
            <ArrowLeft className="size-4 mr-1.5 rtl:rotate-180" />
            {t('walletMigrate.backToWallet')}
          </Link>
        </Button>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('walletMigrate.heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('walletMigrate.subheading')}</p>
        </div>

        {v1.isLoading ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('walletMigrate.loading')}</p>
            </CardContent>
          </Card>
        ) : !hasFunds ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <p className="text-base font-medium">{t('walletMigrate.noFunds.title')}</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('walletMigrate.noFunds.description')}
              </p>
              <Button variant="outline" asChild className="mt-2">
                <Link to="/wallet">{t('walletMigrate.backToWallet')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('walletMigrate.detected.title')}</CardTitle>
                <CardDescription>{t('walletMigrate.detected.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">{t('walletMigrate.detected.bip86')}</span>
                  <span className="font-mono">{formatBTC(v1.v1Bip86Balance)} BTC</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">{t('walletMigrate.detected.sp')}</span>
                  <span className="font-mono">{formatBTC(v1.v1SpBalance)} BTC</span>
                </div>
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="font-medium">{t('walletMigrate.detected.total')}</span>
                  <span className="font-mono font-medium">
                    {formatBTC(v1.v1TotalBalance)} BTC
                  </span>
                </div>
              </CardContent>
            </Card>

            {destinationAddress && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('walletMigrate.destination.title')}</CardTitle>
                  <CardDescription>{t('walletMigrate.destination.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs font-mono">
                    {destinationAddress}
                  </code>
                </CardContent>
              </Card>
            )}

            {step === 'idle' && (
              <>
                <Alert variant="default" className="border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-100">
                  <AlertTriangle className="size-4 !text-amber-600 dark:!text-amber-400" />
                  <AlertDescription className="text-xs">
                    {t('walletMigrate.warning')}
                  </AlertDescription>
                </Alert>
                <Button
                  size="lg"
                  className="w-full rounded-full h-12"
                  onClick={runMigration}
                  disabled={!destinationAddress}
                >
                  {t('walletMigrate.startButton')}
                </Button>
              </>
            )}

            {(step === 'building' || step === 'signing' || step === 'broadcasting') && (
              <Card>
                <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">
                    {step === 'building'
                      ? t('walletMigrate.progress.building')
                      : step === 'signing'
                        ? t('walletMigrate.progress.signing')
                        : t('walletMigrate.progress.broadcasting')}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {t('walletMigrate.progress.dontClose')}
                  </p>
                </CardContent>
              </Card>
            )}

            {step === 'success' && (
              <Card>
                <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
                  <div className="p-3 rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-bold">{t('walletMigrate.success.title')}</p>
                    {sweptSats !== null && (
                      <p className="text-sm text-muted-foreground">
                        {t('walletMigrate.success.sent', {
                          sats: sweptSats.toLocaleString(),
                          fee: (feeSats ?? 0).toLocaleString(),
                        })}
                      </p>
                    )}
                  </div>
                  {txid && (
                    <Button variant="outline" asChild>
                      <Link to={`/i/bitcoin:tx:${txid}`}>{t('walletMigrate.success.viewTx')}</Link>
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => navigate('/wallet')}>
                    {t('walletMigrate.backToWallet')}
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === 'error' && (
              <Card>
                <CardContent className="py-6 space-y-4">
                  <Alert variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>{t('walletMigrate.error.title')}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                  <Button variant="outline" className="w-full" onClick={() => setStep('idle')}>
                    {t('walletMigrate.error.tryAgain')}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
}
