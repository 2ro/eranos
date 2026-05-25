import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldOff,
  KeyRound,
  Radar,
  MoreVertical,
  History,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginArea } from '@/components/auth/LoginArea';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HDSendBitcoinDialog } from '@/components/HDSendBitcoinDialog';
import { HDSilentPaymentScanDialog } from '@/components/HDSilentPaymentScanDialog';
import { WalletBackupMnemonicDialog } from '@/components/WalletBackupMnemonic';
import { PendingBadge } from '@/components/PendingBadge';
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

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [spScanOpen, setSpScanOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  useSeoMeta({
    title: `${t('wallet.seoTitle')} | ${config.appName}`,
    description: t('wallet.seoDescription'),
  });

  const address = currentReceiveAddress?.address ?? '';
  const spAddress = silentPaymentAddress?.address ?? '';

  // Combined BIP-21 payload: `bitcoin:<bc1>?sp=<sp1>` when both are
  // available, falling back to the single endpoint that exists.
  // Mirrors the campaign donate panel's QR payload so BIP-352-aware
  // wallets pick the `sp=` parameter and legacy wallets fall back to
  // the on-chain address.
  const qrPayload = address && spAddress
    ? `bitcoin:${address}?sp=${spAddress}`
    : address
      ? `bitcoin:${address}`
      : spAddress
        ? `bitcoin:?sp=${spAddress}`
        : '';

  const copyPayload = async () => {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(qrPayload);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

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
      <div className="flex flex-col items-center px-4 pt-4 pb-4 space-y-6">
        {/* Balance */}
        {isLoading ? (
          <div className="flex flex-col items-center space-y-2">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-4 w-24 rounded" />
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
              <PendingBadge
                amountLabel={btcPrice ? satsToUSD(Math.abs(pendingBalance), btcPrice) : undefined}
                className="pt-1 flex"
              />
            )}
          </button>
        )}

        {/* Back-up affordance and v1 detection live in the overflow menu
            in the top-right. Back up opens a dialog inline; Legacy wallet
            recovery navigates to its own page. The wallet home no longer
            auto-detects any legacy balances — that scan only runs when
            the user explicitly opens the Legacy Wallet Recovery screen. */}

        <HDSendBitcoinDialog
          isOpen={sendOpen}
          onClose={() => setSendOpen(false)}
          btcPrice={btcPrice}
        />

        <HDSilentPaymentScanDialog open={spScanOpen} onOpenChange={setSpScanOpen} />

        <WalletBackupMnemonicDialog open={backupOpen} onOpenChange={setBackupOpen} />

        {/* Inline receive panel — lives directly under the balance instead
            of behind a modal so the QR is always visible. The copy row uses
            the same explicit width as the white QR tile (280 + p-4 + p-4). */}
        {!isLoading && !error && qrPayload && (
          <div className="flex flex-col items-center gap-4 pt-2">
            {/* Combined BIP-21 QR with centered Agora logo. BIP-352-aware
                wallets pick the `sp=` parameter; legacy wallets fall back
                to the on-chain address. Mirrors CampaignWalletDonatePanel:
                level="H" tolerates the logo occlusion. */}
            <div className="relative rounded-2xl bg-white p-4 shadow-sm">
              <QRCodeCanvas value={qrPayload} size={280} level="H" />
              <div
                aria-hidden
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="rounded-full bg-primary p-2 ring-[6px] ring-white">
                  <img
                    src="/logo.svg"
                    alt=""
                    className="size-16 object-contain brightness-0 invert"
                    draggable={false}
                  />
                </div>
              </div>
            </div>

            {/* Copyable row showing the full payment URI. A refresh icon on
                the left rotates to the next unused on-chain address; clicks
                stop propagation so they don't trigger the row's copy. */}
            <button
              type="button"
              onClick={copyPayload}
              className="w-[312px] flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60 motion-safe:transition-colors cursor-pointer"
            >
              {address && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    nextReceiveAddress();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      nextReceiveAddress();
                    }
                  }}
                  className="shrink-0 -ml-1 inline-flex items-center justify-center size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                  aria-label={t('wallet.receiveDialog.newAddress')}
                  title={t('wallet.receiveDialog.newAddress')}
                >
                  <RefreshCw className="size-3.5" />
                </span>
              )}
              <span className="flex-1 min-w-0 truncate font-mono text-xs" title={qrPayload}>
                {qrPayload}
              </span>
              {copiedPayload ? (
                <Check className="size-4 text-green-500 shrink-0" />
              ) : (
                <Copy className="size-4 text-muted-foreground shrink-0" />
              )}
            </button>
          </div>
        )}

        {/* Send button — placed at the bottom of the wallet column so the
            receive QR is the first thing users see; sending is a less
            frequent action. Styled to mirror the `Start a campaign` hero
            CTA on the home page. */}
        {!isLoading && !error && (
          <div className="w-[312px] flex items-center gap-2">
            <Button
              size="lg"
              onClick={() => setSendOpen(true)}
              className="flex-1 rounded-full text-white font-semibold text-base h-12 px-7 [&_svg]:size-[18px] motion-safe:transition-colors"
            >
              <ArrowUpRight className="mr-2" />
              {t('wallet.send')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('wallet.openMenu')}
                  title={t('wallet.openMenu')}
                  className="shrink-0 p-2 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreVertical className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sp.enabled && spAddress && (
                  <DropdownMenuItem onSelect={() => setSpScanOpen(true)} className="cursor-pointer">
                    <Radar className="size-4 mr-2" />
                    {sp.storage?.scanHeight && sp.storage.scanHeight > 0
                      ? t('wallet.receiveDialog.scanForNew')
                      : t('wallet.receiveDialog.scanForPayments')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setBackupOpen(true)} className="cursor-pointer">
                  <KeyRound className="size-4 mr-2" />
                  {t('walletSettings.backup.label')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/wallet/legacy" className="cursor-pointer">
                    <History className="size-4 mr-2" />
                    {t('walletSettings.legacy.label')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

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
