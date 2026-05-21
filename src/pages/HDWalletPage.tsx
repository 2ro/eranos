import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import {
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  ShieldOff,
  ArrowRight,
  KeyRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useAppContext } from '@/hooks/useAppContext';
import { useHdWallet } from '@/hooks/useHdWallet';
import { useHdBtcPrice } from '@/hooks/useHdBtcPrice';
import { satsToUSD, formatBTC } from '@/lib/bitcoin';
import type { HdTransaction } from '@/lib/hdwallet/scan';

export function HDWalletPage() {
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
  const { data: btcPrice } = useHdBtcPrice();

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedSp, setCopiedSp] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  useSeoMeta({
    title: `HD Wallet | ${config.appName}`,
    description: 'Hierarchical-deterministic Bitcoin wallet derived from your Nostr nsec.',
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
            <h2 className="text-xl font-bold">HD Bitcoin Wallet</h2>
            <p className="text-muted-foreground text-sm">
              A hierarchical wallet derived from your Nostr identity. Fresh address per receive,
              full transaction history, no address reuse.
            </p>
            <p className="text-muted-foreground text-xs pt-2">
              Requires login with an nsec (your Nostr private key).
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
            <h2 className="text-xl font-bold">HD wallet unavailable</h2>
            <p className="text-muted-foreground text-sm">
              {availability.loginType === 'extension'
                ? 'Your browser extension keeps your secret key isolated, so we can\'t derive child keys for an HD wallet.'
                : availability.loginType === 'bunker'
                  ? 'Your remote signer (NIP-46 bunker) keeps your secret key on the bunker side, so we can\'t derive child keys for an HD wallet.'
                  : "Your login type doesn't expose the secret key needed to derive an HD wallet."}
            </p>
            <p className="text-muted-foreground text-sm pt-2">
              The single-address wallet at <Link to="/wallet" className="underline">/wallet</Link>{' '}
              works for every login type.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/wallet">
              Go to standard wallet
              <ArrowRight className="size-4 ml-2" />
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  // ── Available — full HD wallet UI ────────────────────────────
  return (
    <main>
      <div className="flex flex-col items-center px-4 pt-8 pb-4 space-y-6 max-w-sm mx-auto">
        {/* Balance */}
        {isLoading ? (
          <div className="flex flex-col items-center space-y-2">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        ) : error ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-destructive">Failed to scan wallet</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex flex-col items-center space-y-1 group cursor-pointer disabled:cursor-default rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-4 py-2"
            aria-label="Refresh balance"
            title="Click to refresh balance"
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
                  ? `${satsToUSD(Math.abs(pendingBalance), btcPrice)} pending`
                  : 'pending'}
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
              Send
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiveOpen(true)}
              className="rounded-full"
              disabled={!address}
            >
              <ArrowDownLeft className="size-3.5 mr-1.5" />
              Receive
            </Button>
          </div>
        )}

        <HDSendBitcoinDialog
          isOpen={sendOpen}
          onClose={() => setSendOpen(false)}
          btcPrice={btcPrice}
        />

        {/* Receive Dialog */}
        <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Receive Bitcoin</DialogTitle>
              <DialogDescription>
                Share an address to receive bitcoin.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="onchain" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="onchain">On-chain</TabsTrigger>
                <TabsTrigger value="silent" disabled={!spAddress}>
                  Silent payment
                </TabsTrigger>
              </TabsList>

              {/* ── On-chain (BIP86 single-use) ──────────────── */}
              <TabsContent value="onchain" className="mt-4">
                {address && (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-xs text-muted-foreground text-center max-w-xs">
                      Fresh address each time. Bump to a new index after sharing
                      for privacy.
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
                      <span>Address #{currentReceiveAddress?.index ?? 0}</span>
                      <span aria-hidden>·</span>
                      <button
                        onClick={() => nextReceiveAddress()}
                        className="hover:text-foreground underline-offset-4 hover:underline transition-colors cursor-pointer"
                      >
                        New address
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
                      Static receive identifier. Share once and reuse forever —
                      senders derive a unique on-chain address per payment.
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

                    <p className="text-xs text-orange-500 dark:text-orange-400 text-center max-w-xs">
                      Receive-only. This wallet doesn't yet scan for incoming
                      silent payments — funds sent here won't show up in your
                      balance until silent payment support is wired in.
                    </p>
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
              Transactions
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

function formatTxDate(timestamp?: number): string {
  if (!timestamp) return 'Pending';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TxRow({ tx, btcPrice }: { tx: HdTransaction; btcPrice?: number }) {
  const isReceive = tx.type === 'receive';
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
          <p className="text-sm font-medium">{isReceive ? 'Received' : 'Sent'}</p>
          <p className="text-xs text-muted-foreground">{formatTxDate(tx.timestamp)}</p>
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
