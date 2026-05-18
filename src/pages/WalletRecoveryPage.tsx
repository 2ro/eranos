import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Wallet as WalletIcon,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import { logger } from '@/lib/logger';

type Step = 'input' | 'sweeping' | 'success' | 'error';

/**
 * Standalone recovery page for the legacy Breez/Spark Lightning wallet.
 *
 * Lazy-loads the heavy Breez SDK only when the user actually starts a sweep,
 * so the main bundle stays free of the Lightning custody runtime. The flow:
 *
 *   1. Detect a NIP-78 encrypted backup (kind 30078 `d=spark-wallet-backup`)
 *      on the user's relays, or accept a manual 12-word mnemonic.
 *   2. Connect the Breez SDK in-memory, fetch the wallet balance.
 *   3. Send the entire on-chain balance to the user's Nostr-key-derived
 *      Taproot address.
 *   4. Disconnect; nothing is persisted to local storage.
 *
 * The page is intentionally single-purpose: there is no "send Lightning"
 * UI, no payment history, no Lightning address. We just want to evacuate
 * funds from the deprecated wallet into the user's deterministic Taproot
 * address.
 */
export function WalletRecoveryPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('input');
  const [mnemonic, setMnemonic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [sweptSats, setSweptSats] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useSeoMeta({
    title: `Recover Old Wallet | ${config.appName}`,
    description: 'Recover funds from a previous Lightning wallet and transfer them to your Nostr-derived Bitcoin address.',
  });

  const destinationAddress = useMemo(
    () => (user ? nostrPubkeyToBitcoinAddress(user.pubkey) : null),
    [user],
  );

  // Look for a NIP-78 relay backup so we can offer one-click decrypt-and-fill.
  const backupQuery = useQuery({
    queryKey: ['spark-relay-backup', user?.pubkey],
    enabled: Boolean(user),
    queryFn: async (c) => {
      // Lazy-load the backup helpers so the legacy code path doesn't pull
      // anything into the main wallet bundle.
      const { fetchBackup } = await import('@/lib/spark/backup');
      return fetchBackup(nostr, user!.pubkey, c.signal);
    },
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!error) return;
    setStep('error');
  }, [error]);

  if (!user) {
    return (
      <main>
        <PageHeader title="Recover Old Wallet" icon={<WalletIcon className="size-5" />} />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <WalletIcon className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">Log in to recover</h2>
            <p className="text-muted-foreground text-sm">
              Log in with the Nostr identity that owned the old Lightning wallet so the funds can be swept to its Bitcoin address.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  async function decryptRelayBackup() {
    const backup = backupQuery.data;
    if (!backup || !user) return;
    if (!user.signer.nip44?.decrypt) {
      setError('Your signer does not support NIP-44 decryption, which is required to read the relay backup. Paste your 12-word recovery phrase manually instead.');
      return;
    }
    try {
      const { decryptBackupEvent } = await import('@/lib/spark/backup');
      const decrypted = await decryptBackupEvent(backup, user.signer);
      if (!decrypted) {
        setError('Could not decrypt the relay backup. Paste your 12-word recovery phrase manually instead.');
        return;
      }
      setMnemonic(decrypted.trim());
      toast({
        title: 'Backup loaded',
        description: 'Recovery phrase decrypted from your relays.',
      });
    } catch (err) {
      logger.error('[WalletRecovery] decryptRelayBackup failed', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt relay backup.');
    }
  }

  async function startSweep() {
    if (!user || !destinationAddress) return;
    const trimmed = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const wordCount = trimmed.split(' ').filter(Boolean).length;
    if (wordCount !== 12 && wordCount !== 24) {
      setError('Recovery phrase must be 12 or 24 words.');
      return;
    }

    setError(null);
    setStep('sweeping');

    // Lazy-import the Breez SDK so we only pay the WASM cost when actually
    // recovering. Everything below stays scoped to this function so the SDK
    // instance is discarded as soon as we're done.
    try {
      setProgress('Loading wallet SDK…');
      const { breezService } = await import('@/lib/spark/breezService');

      setProgress('Connecting to your old wallet…');
      await breezService.connect(trimmed);

      setProgress('Checking balance…');
      const balance = await breezService.getBalance();
      if (balance <= 0) {
        await breezService.disconnect();
        setError('Your old wallet has no spendable balance. There is nothing to recover.');
        return;
      }

      setProgress(`Preparing transfer of ${balance.toLocaleString()} sats…`);
      // Pass the whole balance as the amount; Breez will deduct the network
      // fee from the prepared response and we let it use its default "medium"
      // confirmation speed.
      const prep = await breezService.prepareBitcoinPayment(destinationAddress, balance);

      setProgress('Broadcasting transaction…');
      const payment = await breezService.sendBitcoinPayment(prep, 'medium');

      setProgress(null);
      setSweptSats(balance);
      setTxid(extractTxid(payment));
      setStep('success');

      try {
        await breezService.disconnect();
      } catch (err) {
        // Disconnect is best-effort once funds are out.
        logger.warn('[WalletRecovery] disconnect after sweep failed', err);
      }
    } catch (err) {
      logger.error('[WalletRecovery] sweep failed', err);
      setError(err instanceof Error ? err.message : 'Recovery failed. Please try again.');
    }
  }

  return (
    <main>
      <PageHeader title="Recover Old Wallet" icon={<WalletIcon className="size-5" />} />

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/wallet">
            <ArrowLeft className="size-4 mr-1.5" />
            Back to wallet
          </Link>
        </Button>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Recover your old wallet</h2>
          <p className="text-sm text-muted-foreground">
            If you previously held funds in the Lightning wallet, you can sweep them to your Nostr-derived Bitcoin address. Your old wallet is not restored — this is a one-time, one-way transfer.
          </p>
        </div>

        {destinationAddress && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funds will be sent to</CardTitle>
              <CardDescription>Your Nostr-derived Taproot address.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs font-mono">
                {destinationAddress}
              </code>
            </CardContent>
          </Card>
        )}

        {step === 'input' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recovery phrase</CardTitle>
              <CardDescription>
                Paste the 12-word recovery phrase from your old wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {backupQuery.isLoading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking your relays for an encrypted backup…
                </p>
              )}
              {backupQuery.data && (
                <Alert>
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Backup found on your relays</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      We found an encrypted backup of your old wallet's recovery phrase published from this account.
                    </p>
                    <Button size="sm" variant="secondary" onClick={decryptRelayBackup}>
                      Decrypt and use it
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <Textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                placeholder="word1 word2 word3 …"
                rows={4}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm"
              />

              <Alert variant="default" className="border-amber-500/50 bg-amber-500/5 text-amber-900 dark:text-amber-100">
                <AlertTriangle className="size-4 !text-amber-500" />
                <AlertDescription className="text-xs">
                  Only paste a recovery phrase you trust. Anyone with this phrase can spend the funds. After the sweep completes, delete it from any place you copied it from.
                </AlertDescription>
              </Alert>

              <Button onClick={startSweep} disabled={!mnemonic.trim()} className="w-full">
                Sweep funds to my Bitcoin address
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'sweeping' && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{progress ?? 'Working…'}</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Don't close this tab. This can take up to a minute while the old wallet syncs and the transaction is broadcast.
              </p>
            </CardContent>
          </Card>
        )}

        {step === 'success' && (
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold">Recovery complete</p>
                {sweptSats !== null && (
                  <p className="text-sm text-muted-foreground">
                    Sent {sweptSats.toLocaleString()} sats to your Bitcoin address.
                  </p>
                )}
              </div>
              {txid && (
                <Button variant="outline" asChild>
                  <Link to={`/i/bitcoin:tx:${txid}`}>View transaction</Link>
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/wallet')}>
                Back to wallet
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'error' && (
          <Card>
            <CardContent className="py-6 space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Recovery failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setStep('input');
                }}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

/**
 * Pull the txid out of whatever shape Breez returned. The payment-info object
 * from `mapPaymentToInfo` has historically been a slim record; rather than
 * couple to its exact shape we probe a few common fields.
 */
function extractTxid(payment: unknown): string | null {
  if (!payment || typeof payment !== 'object') return null;
  const p = payment as Record<string, unknown>;
  for (const key of ['txid', 'txId', 'transactionId', 'paymentHash', 'id']) {
    const value = p[key];
    if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) {
      return value.toLowerCase();
    }
  }
  return null;
}
