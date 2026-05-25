import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Clock, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddressLedger } from '@/hooks/useAddressLedger';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { type AddressTransaction, formatBTC, satsToUSD } from '@/lib/bitcoin';
import { openUrl } from '@/lib/downloadFile';
import { timeAgo } from '@/lib/timeAgo';

interface CampaignLedgerProps {
  /** The campaign's on-chain (`bc1…`) Bitcoin address. */
  address: string;
}

/**
 * Public on-chain activity for a campaign's `bc1…` address, presented as a
 * mempool.space-style ledger. Each row is one transaction touching the
 * address, with its address-relative net sat flow (inbound or outbound),
 * confirmation status, and a deep link to mempool.space for the full tx.
 *
 * Only applicable when the campaign declares a public on-chain endpoint —
 * silent-payment-only campaigns have no scannable address and should not
 * surface this tab at all.
 */
export function CampaignLedger({ address }: CampaignLedgerProps) {
  const { t } = useTranslation();
  const { data: btcPrice } = useBtcPrice();
  const query = useAddressLedger(address, true);

  const pages = query.data?.pages ?? [];
  const txs: AddressTransaction[] = pages.flat();

  return (
    <div className="rounded-2xl bg-muted/60 overflow-hidden border-l border-r border-primary/20">
      <LedgerHeader address={address} />

      {query.isLoading ? (
        <div className="divide-y divide-primary/20">
          {Array.from({ length: 4 }).map((_, i) => (
            <LedgerRowSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t('campaignsDetail.ledger.error')}
        </div>
      ) : txs.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t('campaignsDetail.ledger.empty')}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-primary/20">
            {txs.map((tx) => (
              <LedgerRow key={tx.txid} tx={tx} btcPrice={btcPrice} />
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="px-4 py-3 flex justify-center border-t border-primary/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage
                  ? t('campaignsDetail.ledger.loadingMore')
                  : t('campaignsDetail.ledger.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LedgerHeader({ address }: { address: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-primary/20 bg-background/40">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('campaignsDetail.ledger.publicAddress')}
        </p>
        <p className="mt-0.5 text-xs sm:text-sm font-mono text-foreground/90 break-all">
          {address}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => void openUrl(`https://mempool.space/address/${address}`)}
        title={t('campaignsDetail.ledger.viewOnMempool')}
      >
        <ExternalLink className="size-3.5" />
        <span className="hidden sm:inline">{t('campaignsDetail.ledger.viewOnMempool')}</span>
      </Button>
    </div>
  );
}

function LedgerRow({
  tx,
  btcPrice,
}: {
  tx: AddressTransaction;
  btcPrice: number | undefined;
}) {
  const { t } = useTranslation();
  const isInflow = tx.netSats >= 0;
  const absSats = Math.abs(tx.netSats);
  const Icon = isInflow ? ArrowDownLeft : ArrowUpRight;
  const tone = isInflow ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
  const bgTone = isInflow ? 'bg-emerald-500/10' : 'bg-amber-500/10';

  const when = tx.confirmed && tx.blockTime
    ? timeAgo(tx.blockTime)
    : t('campaignsDetail.ledger.unconfirmed');

  return (
    <li>
      <button
        type="button"
        onClick={() => void openUrl(`https://mempool.space/tx/${tx.txid}`)}
        className="w-full px-4 sm:px-5 py-3 flex items-center gap-3 text-left hover:bg-background/40 motion-safe:transition-colors"
        title={t('campaignsDetail.ledger.openOnMempool')}
      >
        <span
          aria-hidden
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${bgTone} ${tone}`}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">
              {isInflow
                ? t('campaignsDetail.ledger.received')
                : t('campaignsDetail.ledger.sent')}
            </span>
            <span className="text-xs font-mono text-muted-foreground truncate">
              {tx.txid.slice(0, 8)}…{tx.txid.slice(-6)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {!tx.confirmed && <Clock className="size-3" aria-hidden />}
            <span>{when}</span>
            {tx.confirmed && tx.blockHeight ? (
              <>
                <span aria-hidden>·</span>
                <span>{t('campaignsDetail.ledger.block', { height: tx.blockHeight })}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="text-right shrink-0">
          {btcPrice ? (
            <div className={`text-sm font-semibold tabular-nums ${tone}`}>
              {isInflow ? '+' : '−'}
              {satsToUSD(absSats, btcPrice)}
            </div>
          ) : null}
          <div
            className={`tabular-nums ${
              btcPrice ? 'text-xs text-muted-foreground' : `text-sm font-semibold ${tone}`
            }`}
          >
            {isInflow ? '+' : '−'}
            {formatBTC(absSats)} {t('campaignsDetail.ledger.btcUnit')}
          </div>
        </div>
      </button>
    </li>
  );
}

function LedgerRowSkeleton() {
  return (
    <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
      <Skeleton className="size-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}
