import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useSecureLocalStorage } from '@/hooks/useSecureLocalStorage';
import { useHdWalletAccess, type HdWalletAvailability } from '@/hooks/useHdWalletAccess';
import { useHdWalletSp } from '@/hooks/useHdWalletSp';
import {
  deriveReceiveAddress,
  deriveSilentPaymentAddress,
  type DerivedAddress,
  type SilentPaymentAddress,
} from '@/lib/hdwallet/derivation';
import {
  type AccountScanResult,
  buildHdTransactions,
  type HdTransaction,
  scanAccount,
} from '@/lib/hdwallet/scan';
import type { SPStorageDocument } from '@/lib/hdwallet/sp/storage';

// ---------------------------------------------------------------------------
// Persisted UI cursor (per user)
// ---------------------------------------------------------------------------
//
// We persist a single integer per user: the "preferred receive index" — the
// index of the address we are currently advertising on the wallet page.
// The chain-scan source of truth is `firstUnusedIndex` (from Blockbook), but
// if the user explicitly bumps to a fresh address we honour that until the
// chain catches up.

const CURSOR_KEY = (pubkey: string) => `hdwallet:cursor:${pubkey}`;

interface PersistedCursor {
  /** Currently-displayed receive index. */
  receiveIndex: number;
}

const DEFAULT_CURSOR: PersistedCursor = { receiveIndex: 0 };

// ---------------------------------------------------------------------------
// Query refresh cadence
// ---------------------------------------------------------------------------

/**
 * Re-scan every 60 seconds. With Blockbook, a refresh is exactly 2 HTTP
 * calls (`/xpub` + `/utxo`) regardless of wallet size, so a faster refresh
 * is cheap. We pick 60s as a UX compromise between immediacy and politeness
 * to the public Blockbook host.
 */
const REFRESH_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface UseHdWalletResult {
  /** Availability status — mirrors `useHdWalletAccess`. */
  availability: HdWalletAvailability;
  /** Currently-advertised receive address (the one the UI shows). */
  currentReceiveAddress?: DerivedAddress;
  /**
   * BIP-352 silent payment address (`sp1q…`) for this wallet. Static — a
   * single identifier the user can publish and reuse forever. Undefined
   * unless `availability.status === 'available'`.
   */
  silentPaymentAddress?: SilentPaymentAddress;
  /** Full scan result — UTXOs, used addresses, etc. */
  scan?: AccountScanResult;
  /** Aggregated wallet-level transaction history (newest first). */
  transactions?: HdTransaction[];
  /** Confirmed + pending balance in sats. */
  totalBalance: number;
  /** Pending (mempool) balance in sats. */
  pendingBalance: number;
  /**
   * Confirmed balance of silent-payment UTXOs only, in sats. Already included
   * in `totalBalance` — this field is exposed for the UI breakdown.
   */
  silentPaymentBalance: number;
  /** The persisted SP UTXO document, if loaded. */
  silentPaymentStorage?: SPStorageDocument;
  /** Initial scan in progress. */
  isLoading: boolean;
  /** Scan currently fetching (initial or background refresh). */
  isFetching: boolean;
  /** Scan error, if any. */
  error: unknown;
  /** Trigger a manual scan refresh. */
  refetch: () => Promise<unknown>;
  /** Advance the receive cursor to the next unused address. Persisted. */
  nextReceiveAddress: () => DerivedAddress | undefined;
  /**
   * Drop the given SP UTXOs from local storage and republish so other
   * devices stay in sync. Call after a successful spend that consumed
   * silent-payment UTXOs — see `useHdWalletSp.pruneSpentUtxos`.
   */
  pruneSpentSilentPaymentUtxos: (spent: ReadonlyArray<{ txid: string; vout: number }>) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Top-level HD wallet hook backed by Trezor's Blockbook indexer.
 *
 * The entire scan (balance, used addresses, tx history, UTXOs) comes from
 * two HTTP calls to the configured Blockbook server:
 *
 *   - `GET /api/v2/xpub/<tr(xpub)>?details=txs&tokens=used`
 *   - `GET /api/v2/utxo/<tr(xpub)>`
 *
 * No fallback to other indexers, no client-side gap-limit walking. If
 * Blockbook is unreachable the wallet surfaces the error.
 *
 * The hook is safe to call regardless of login state — non-nsec logins
 * return `availability.status !== 'available'` without doing any derivation
 * or network work.
 */
export function useHdWallet(): UseHdWalletResult {
  const { config } = useAppContext();
  const { blockbookBaseUrl } = config;
  const availability = useHdWalletAccess();
  const queryClient = useQueryClient();
  const sp = useHdWalletSp();

  const pubkey = availability.status === 'available' ? availability.pubkey : '';
  const account = availability.status === 'available' ? availability.account : undefined;
  const nsecBytes = availability.status === 'available' ? availability.nsecBytes : undefined;

  // ── Persisted receive cursor ─────────────────────────────────
  const [cursor, setCursor] = useSecureLocalStorage<PersistedCursor>(
    pubkey ? CURSOR_KEY(pubkey) : 'hdwallet:cursor:none',
    DEFAULT_CURSOR,
  );

  // ── Scan query ───────────────────────────────────────────────
  const scanKey = ['hdwallet-scan', blockbookBaseUrl, pubkey];
  const {
    data: scan,
    isLoading: scanLoading,
    isFetching: scanFetching,
    error: scanError,
    refetch: refetchScan,
  } = useQuery<AccountScanResult>({
    queryKey: scanKey,
    queryFn: async ({ signal }) => {
      if (!account || !pubkey) throw new Error('HD wallet account unavailable');
      return scanAccount(account, blockbookBaseUrl, signal);
    },
    enabled: !!account && pubkey !== '',
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
    refetchOnWindowFocus: false,
  });

  // ── Transaction history (derived; zero extra fetches) ────────
  //
  // Combines BIP-86 transactions (scanned from Blockbook) with silent-payment
  // receives (discovered by the BIP-352 scanner). SP UTXOs carry a real
  // block timestamp when one is available (sourced from Blockbook by the
  // SP orchestrator at scan time, or backfilled on subsequent loads). When
  // a UTXO is missing `time` — older docs written before this field
  // existed, or scans that ran while Blockbook was unreachable — we fall
  // back to a synthetic estimate from height using a fixed anchor
  // (block 800,000 ≈ 2023-07-23T00:00:00Z, average 10-minute spacing).
  // The synthetic estimate is clamped to "now" so it never reports a future
  // timestamp (real average block time is shorter than 600s, so the naive
  // estimate drifts noticeably ahead of wall-clock as cumulative blocks
  // accumulate).
  const transactions = useMemo<HdTransaction[] | undefined>(() => {
    if (!scan && !sp.storage) return undefined;

    const bip86 = scan ? buildHdTransactions(scan) : [];

    // Group SP UTXOs by txid and sum to keep the row shape consistent with
    // the rest of the wallet (one row per tx, not per output).
    const spByTxid = new Map<
      string,
      { amount: number; height: number; time?: number }
    >();
    for (const u of sp.storage?.utxos ?? []) {
      const existing = spByTxid.get(u.txid);
      if (existing) {
        existing.amount += u.value;
        // Same tx → same block; prefer any concrete time we find.
        if (existing.time === undefined && u.time !== undefined) {
          existing.time = u.time;
        }
      } else {
        spByTxid.set(u.txid, { amount: u.value, height: u.height, time: u.time });
      }
    }

    const HEIGHT_ANCHOR = 800_000;
    const TIMESTAMP_ANCHOR = 1_690_070_400; // 2023-07-23T00:00:00Z (block 800,000)
    const SECONDS_PER_BLOCK = 600;
    const nowSeconds = Math.floor(Date.now() / 1000);

    const spRows: HdTransaction[] = Array.from(spByTxid.entries()).map(([txid, info]) => {
      const synthetic = TIMESTAMP_ANCHOR + (info.height - HEIGHT_ANCHOR) * SECONDS_PER_BLOCK;
      const timestamp = info.time ?? Math.min(synthetic, nowSeconds);
      return {
        txid,
        amount: info.amount,
        type: 'receive',
        // SP UTXOs come from confirmed P2TR outputs in mined blocks — mempool
        // SP detection isn't supported by BlindBit (you need a confirmed block
        // to derive `input_hash`), so any UTXO we've persisted is confirmed.
        confirmed: true,
        timestamp,
        source: 'silent-payment',
      };
    });

    const merged = [...bip86, ...spRows];
    merged.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return -1;
      if (!b.timestamp) return 1;
      return b.timestamp - a.timestamp;
    });
    return merged;
  }, [scan, sp.storage]);

  // ── Current receive address ──────────────────────────────────
  const currentReceiveAddress = useMemo<DerivedAddress | undefined>(() => {
    if (!account) return undefined;
    const chainNextUnused = scan?.receive.firstUnusedIndex ?? 0;
    const resolved = Math.max(chainNextUnused, cursor.receiveIndex);
    return deriveReceiveAddress(account, resolved);
  }, [account, scan, cursor.receiveIndex]);

  // ── Silent payment address (static; depends only on nsec) ────
  const silentPaymentAddress = useMemo<SilentPaymentAddress | undefined>(() => {
    if (!nsecBytes) return undefined;
    return deriveSilentPaymentAddress(nsecBytes);
  }, [nsecBytes]);

  // ── Advance to next receive address ──────────────────────────
  const nextReceiveAddress = useCallback((): DerivedAddress | undefined => {
    if (!account) return undefined;
    const chainNextUnused = scan?.receive.firstUnusedIndex ?? 0;
    const current = Math.max(chainNextUnused, cursor.receiveIndex);
    const next = current + 1;
    setCursor({ receiveIndex: next });
    return deriveReceiveAddress(account, next);
  }, [account, scan, cursor.receiveIndex, setCursor]);

  // ── Unified refetch ──────────────────────────────────────────
  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
    return refetchScan();
  }, [queryClient, refetchScan]);

  return {
    availability,
    currentReceiveAddress,
    silentPaymentAddress,
    scan,
    transactions,
    totalBalance: (scan?.totalBalance ?? 0) + sp.balance,
    pendingBalance: scan?.pendingBalance ?? 0,
    silentPaymentBalance: sp.balance,
    silentPaymentStorage: sp.storage,
    isLoading: scanLoading,
    isFetching: scanFetching,
    error: scanError,
    refetch,
    nextReceiveAddress,
    pruneSpentSilentPaymentUtxos: sp.pruneSpentUtxos,
  };
}
