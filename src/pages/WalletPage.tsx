import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation, Trans } from 'react-i18next';
import {
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  ShieldOff,
  KeyRound,
  Radar,
  Settings,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LoginArea } from '@/components/auth/LoginArea';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HDSendBitcoinDialog } from '@/components/HDSendBitcoinDialog';
import { HDSilentPaymentScanDialog } from '@/components/HDSilentPaymentScanDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useHdWalletSp } from '@/hooks/useHdWalletSp';
import { useHdBtcPrice } from '@/hooks/useHdBtcPrice';
import { satsToUSD, formatBTC } from '@/lib/bitcoin';
import type { HdTransaction } from '@/lib/hdwallet/scan';

export function WalletPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const {
    availability,
    currentReceiveAddress,
    silentPaymentAddress,
    transactions,
    totalBalance,
    pendingBalance,
    isLoading,
    isFetching,
    error,
    refetch,
    nextReceiveAddress,
  } = useHdWallet();
  const sp = useHdWalletSp();
  const { data: btcPrice } = useHdBtcPrice();

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedSp, setCopiedSp] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [spScanOpen, setSpScanOpen] = useState(false);

  useSeoMeta({
    title: `${t('wallet.seoTitle')} | ${config.appName}`,
    description: t('wallet.seoDescription'),
  });

  const address = currentReceiveAddress?.address ?? '';
  const spAddress = silentPaymentAddress?.address ?? '';

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const copySpAddress = async () => {
    if (!spAddress) return;
    try {
      await navigator.clipboard.writeText(spAddress);
      setCopiedSp(true);
      setTimeout(() => setCopiedSp(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const truncatedAddress = address
    ? `${address.slice(0, 12)}...${address.slice(-8)}`
    : '';

  const truncatedSpAddress = spAddress
    ? `${spAddress.slice(0, 12)}...${spAddress.slice(-8)}`
    : '';

  // ── Logged out ────────────────────────────────────────────────
  if (availability.status === 'logged-out') {
    return (
      <main>
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <KeyRound className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">{t('wallet.loggedOut.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('wallet.loggedOut.description')}
            </p>
            <p className="text-muted-foreground text-xs pt-2">
              {t('wallet.loggedOut.requiresNsec')}
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  // ── Logged in, but signer doesn't expose the secret key ─────
  if (availability.status === 'unsupported') {
    return (
      <main>
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center max-w-md mx-auto">
          <div className="p-4 rounded-full bg-muted">
            <ShieldOff className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{t('wallet.unsupported.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {availability.loginType === 'extension'
                ? t('wallet.unsupported.extension')
                : availability.loginType === 'bunker'
                  ? t('wallet.unsupported.bunker')
                  : t('wallet.unsupported.other')}
            </p>
            <p className="text-muted-foreground text-sm pt-2">
              {t('wallet.unsupported.instructions')}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ── Available — full HD wallet UI ────────────────────────────
  return (
    <main className="max-w-sm mx-auto">
      {/* Top bar: settings cog only. We deliberately keep this minimal —
          the wallet home doubles as a phone-style "home screen" with the
          balance as the hero, so any chrome here pushes that down. The cog
          shares the `max-w-sm` container with the rest of the wallet UI so
          it sits flush with the balance + send/receive controls instead of
          floating off in the far corner of a wide layout. */}
      <div className="flex items-center justify-end px-4 pt-3">
        <Link
          to="/wallet/settings"
          aria-label={t('wallet.openSettings')}
          title={t('wallet.openSettings')}
          className="p-2 -mr-2 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="size-5" />
        </Link>
      </div>

      <div className="flex flex-col items-center px-4 pt-4 pb-4 space-y-6">
        {/* Balance */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-destructive">{t('wallet.scanFailed')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5 mr-1.5" />
              {t('wallet.retry')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex flex-col items-center space-y-1 group cursor-pointer disabled:cursor-default rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-4 py-2"
            aria-label={t('wallet.refreshBalance')}
            title={t('wallet.refreshBalanceTitle')}
          >
            <span className="text-4xl font-bold tracking-tight group-hover:opacity-80 transition-opacity flex items-center gap-2">
              {btcPrice ? satsToUSD(totalBalance, btcPrice) : '---'}
              {isFetching && (
                <RefreshCw className="size-5 animate-spin text-muted-foreground" />
              )}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatBTC(totalBalance)} BTC
            </span>

            {pendingBalance !== 0 && (
              <span className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400 pt-1">
                <RefreshCw className="size-3 animate-spin" />
                {btcPrice
                  ? t('wallet.amountPending', { amount: satsToUSD(Math.abs(pendingBalance), btcPrice) })
                  : t('wallet.pending')}
              </span>
            )}
          </button>
        )}

        {/* Send + Receive */}
        {!isLoading && !error && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSendOpen(true)}
              className="rounded-full"
            >
              <Send className="size-3.5 mr-1.5" />
              {t('wallet.send')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiveOpen(true)}
              className="rounded-full"
              disabled={!address}
            >
              <ArrowDownLeft className="size-3.5 mr-1.5" />
              {t('wallet.receive')}
            </Button>
          </div>
        )}

        {/* Back-up affordance and v1 detection have moved into
            `/wallet/settings` (cog in the top-right). The wallet home no
            longer auto-detects any legacy balances — that scan only runs
            when the user explicitly opens the Legacy Wallet Recovery
            screen. */}

        <HDSendBitcoinDialog
          isOpen={sendOpen}
          onClose={() => setSendOpen(false)}
          btcPrice={btcPrice}
        />

        <HDSilentPaymentScanDialog open={spScanOpen} onOpenChange={setSpScanOpen} />

        {/* Receive Dialog */}
        <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('wallet.receiveDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('wallet.receiveDialog.description')}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="onchain" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="onchain">{t('wallet.receiveDialog.onChain')}</TabsTrigger>
                <TabsTrigger value="silent" disabled={!spAddress}>
                  {t('wallet.receiveDialog.silentPayment')}
                </TabsTrigger>
              </TabsList>

              {/* ── On-chain (BIP86 single-use) ──────────────── */}
              <TabsContent value="onchain" className="mt-4">
                {address && (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      {t('wallet.receiveDialog.onChainIntro')}
                    </p>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <QRCodeCanvas value={address} size={200} level="M" />
                    </div>

                    <button
                      onClick={copyAddress}
                      className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-mono text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      {truncatedAddress}
                      {copiedAddress ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t('wallet.receiveDialog.addressIndex', { index: currentReceiveAddress?.index ?? 0 })}</span>
                      <span aria-hidden>·</span>
                      <button
                        onClick={() => nextReceiveAddress()}
                        className="hover:text-foreground underline-offset-4 hover:underline transition-colors cursor-pointer"
                      >
                        {t('wallet.receiveDialog.newAddress')}
                      </button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Silent payment (BIP-352 static) ──────────── */}
              <TabsContent value="silent" className="mt-4">
                {spAddress && (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      {t('wallet.receiveDialog.silentIntro')}
                    </p>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <QRCodeCanvas value={spAddress} size={220} level="L" />
                    </div>

                    <button
                      onClick={copySpAddress}
                      className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-mono text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      {truncatedSpAddress}
                      {copiedSp ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>

                    {sp.unavailableReason === 'no-indexer' ? (
                      <p className="text-xs text-orange-500 dark:text-orange-400 text-center max-w-xs">
                        <Trans
                          i18nKey="wallet.receiveDialog.noIndexer"
                          components={{ 0: <span className="font-mono" /> }}
                        />
                      </p>
                    ) : sp.enabled ? (
                      <div className="flex flex-col items-center gap-2 w-full">
                        {sp.balance > 0 && (
                          <p className="text-xs text-muted-foreground text-center">
                            <Trans
                              i18nKey="wallet.receiveDialog.silentBalance"
                              values={{
                                amount: btcPrice
                                  ? satsToUSD(sp.balance, btcPrice)
                                  : `${formatBTC(sp.balance)} BTC`,
                              }}
                              components={{ 0: <span className="text-foreground font-medium" /> }}
                            />
                          </p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSpScanOpen(true)}
                          className="rounded-full"
                        >
                          <Radar className="size-3.5 mr-1.5" />
                          {sp.storage?.scanHeight && sp.storage.scanHeight > 0
                            ? t('wallet.receiveDialog.scanForNew')
                            : t('wallet.receiveDialog.scanForPayments')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Transactions */}
        {transactions && transactions.length > 0 && (
          <>
            <button
              onClick={() => setTxOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {t('wallet.transactions')}
              <ChevronDown className={`size-3 transition-transform duration-200 ${txOpen ? 'rotate-180' : ''}`} />
            </button>

            <TxAccordion open={txOpen}>
              <div className="w-full divide-y">
                {transactions.map((tx) => (
                  <TxRow key={tx.txid} tx={tx} btcPrice={btcPrice} />
                ))}
              </div>
            </TxAccordion>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers (mirrors WalletPage.tsx)
// ---------------------------------------------------------------------------

function TxAccordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="w-full grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div ref={contentRef} className="overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function formatTxDate(timestamp: number | undefined, t: (key: string, options?: Record<string, unknown>) => string, locale: string): string {
  if (!timestamp) return t('wallet.tx.pending');
  const date = new Date(timestamp * 1000);
  const now = new Date();
  // Clamp negative diffs (timestamp slightly in the future) to "Today" rather
  // than rendering "-1d ago". Real block timestamps can run a few seconds
  // ahead of the local clock, and synthetic estimates may overshoot.
  const diffDays = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)),
  );
  if (diffDays === 0) return t('wallet.tx.today');
  if (diffDays === 1) return t('wallet.tx.yesterday');
  if (diffDays < 7) return t('wallet.tx.daysAgo', { count: diffDays });
  try {
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function TxRow({ tx, btcPrice }: { tx: HdTransaction; btcPrice?: number }) {
  const { t, i18n } = useTranslation();
  const isReceive = tx.type === 'receive';
  const isSilent = tx.source === 'silent-payment';
  return (
    <Link
      to={`/i/bitcoin:tx:${tx.txid}`}
      className="flex items-center justify-between py-3 hover:bg-muted/50 transition-colors rounded-lg -mx-1 px-2"
    >
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${
          isReceive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {isReceive
            ? <ArrowDownLeft className="size-4" />
            : <ArrowUpRight className="size-4" />}
        </div>
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            {isReceive ? t('wallet.tx.received') : t('wallet.tx.sent')}
            {isSilent && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                title={t('wallet.tx.silentDetectedTitle')}
              >
                <Radar className="size-2.5" />
                {t('wallet.tx.silentBadge')}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{formatTxDate(tx.timestamp, t, i18n.language)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${
          isReceive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isReceive ? '+' : '-'}
          {btcPrice ? satsToUSD(tx.amount, btcPrice) : `${formatBTC(tx.amount)} BTC`}
        </p>
        <p className="text-xs text-muted-foreground">{formatBTC(tx.amount)} BTC</p>
      </div>
    </Link>
  );
}
