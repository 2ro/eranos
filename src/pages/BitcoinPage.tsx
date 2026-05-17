import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowDownLeft, ArrowUpRight, Bitcoin, Check, ChevronDown, Copy, RefreshCw, Send } from 'lucide-react';

import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { SendBitcoinDialog } from '@/components/SendBitcoinDialog';
import { Button } from '@/components/ui/button';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatBTC, satsToUSD } from '@/lib/bitcoin';
import type { Transaction } from '@/lib/bitcoin';

export function BitcoinPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { bitcoinAddress, addressData, btcPrice, transactions, isLoading, error, refetch } = useBitcoinWallet();

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useSeoMeta({
    title: `Bitcoin | ${config.appName}`,
    description: 'Your Bitcoin Taproot wallet derived from your Nostr identity.',
  });

  const copyAddress = async () => {
    if (!bitcoinAddress) return;
    try {
      await navigator.clipboard.writeText(bitcoinAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // Clipboard API unavailable.
    }
  };

  const truncatedAddress = bitcoinAddress ? `${bitcoinAddress.slice(0, 12)}...${bitcoinAddress.slice(-8)}` : '';

  return (
    <main>
      <PageHeader title="Bitcoin" icon={<Bitcoin className="size-5" />} />

      {!user ? (
        <div className="flex flex-col items-center gap-6 px-8 py-20 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Bitcoin className="size-8 text-primary" />
          </div>
          <div className="max-w-xs space-y-2">
            <h2 className="text-xl font-bold">Your Bitcoin Wallet</h2>
            <p className="text-sm text-muted-foreground">
              Log in to see your Bitcoin Taproot address derived from your Nostr identity.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : (
        <div className="mx-auto flex max-w-sm flex-col items-center space-y-6 px-4 pb-4 pt-8">
          {isLoading ? (
            <div className="flex flex-col items-center space-y-2">
              <Skeleton className="h-10 w-40 rounded-lg" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          ) : error ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-destructive">Failed to load balance</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : addressData ? (
            <div className="flex flex-col items-center space-y-1">
              <span className="text-4xl font-bold tracking-tight">
                {btcPrice ? satsToUSD(addressData.totalBalance, btcPrice) : '---'}
              </span>
              <span className="text-sm text-muted-foreground">{formatBTC(addressData.totalBalance)} BTC</span>

              {addressData.pendingBalance !== 0 && (
                <span className="flex items-center gap-1 pt-1 text-xs text-orange-500 dark:text-orange-400">
                  <RefreshCw className="size-3 animate-spin" />
                  {btcPrice ? `${satsToUSD(addressData.pendingBalance, btcPrice)} pending` : 'pending'}
                </span>
              )}
            </div>
          ) : null}

          {addressData && (
            <Button variant="outline" size="sm" onClick={() => setSendOpen(true)} className="rounded-full">
              <Send className="size-3.5 mr-1.5" />
              Send
            </Button>
          )}

          <SendBitcoinDialog isOpen={sendOpen} onClose={() => setSendOpen(false)} btcPrice={btcPrice} />

          {bitcoinAddress ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <QRCodeCanvas value={bitcoinAddress} size={200} level="M" />
            </div>
          ) : (
            <Skeleton className="size-[232px] rounded-2xl" />
          )}

          {bitcoinAddress && (
            <button
              type="button"
              onClick={copyAddress}
              className="flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted/50"
            >
              {truncatedAddress}
              {copiedAddress ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            </button>
          )}

          {transactions && transactions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setTxOpen((open) => !open)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
      )}
    </main>
  );
}

function TxAccordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="grid w-full transition-[grid-template-rows] duration-300 ease-in-out"
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
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TxRow({ tx, btcPrice }: { tx: Transaction; btcPrice?: number }) {
  const isReceive = tx.type === 'receive';

  return (
    <Link
      to={`/i/bitcoin:tx:${tx.txid}`}
      className="-mx-1 flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        <div className={`flex size-8 items-center justify-center rounded-full ${
          isReceive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}
        >
          {isReceive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div>
          <p className="text-sm font-medium">{isReceive ? 'Received' : 'Sent'}</p>
          <p className="text-xs text-muted-foreground">{formatTxDate(tx.timestamp)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${isReceive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {isReceive ? '+' : '-'}{btcPrice ? satsToUSD(tx.amount, btcPrice) : `${formatBTC(tx.amount)} BTC`}
        </p>
        <p className="text-xs text-muted-foreground">{formatBTC(tx.amount)} BTC</p>
      </div>
    </Link>
  );
}
