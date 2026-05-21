import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useSecureLocalStorage } from '@/hooks/useSecureLocalStorage';
import { useHdWalletAccess, type HdWalletAvailability } from '@/hooks/useHdWalletAccess';
import { deriveReceiveAddress, type DerivedAddress } from '@/lib/hdwallet/derivation';
import {
  type AccountScanResult,
  fetchHdTransactions,
  type HdTransaction,
  scanAccount,
} from '@/lib/hdwallet/scan';

// ---------------------------------------------------------------------------
// Persisted UI cursor (per user)
// ---------------------------------------------------------------------------
//
// We persist a single integer per user: the "preferred receive index" — the
// index of the address we are *currently advertising* on the wallet page.
// The chain-scan source of truth is the relay-derived `firstUnusedIndex`,
// but if the user explicitly bumps to a fresh address (or rotates back),
// we honour that until the chain catches up.
//
// On native, this lives in the Keychain / KeyStore via secureStorage. On web
// it's localStorage. Either way it's not secret — losing it means we fall
// back to firstUnusedIndex on next login.

const STORAGE_KEY = (pubkey: string) => `hdwallet:cursor:${pubkey}`;

interface PersistedCursor {
  /** Currently-displayed receive index. */
  receiveIndex: number;
}

const DEFAULT_CURSOR: PersistedCursor = { receiveIndex: 0 };

// ---------------------------------------------------------------------------
// Query refresh cadence
// ---------------------------------------------------------------------------

/** Re-scan + refresh balances every 60 s. Slower than the single-address
 *  wallet (30 s) because each scan can be 10–40 Esplora calls. */
const REFRESH_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface UseHdWalletResult {
  /** Availability status — mirrors `useHdWalletAccess`. */
  availability: HdWalletAvailability;
  /** Currently-advertised receive address (the one the UI shows). */
  currentReceiveAddress?: DerivedAddress;
  /** Full scan result — UTXOs, used addresses, etc. */
  scan?: AccountScanResult;
  /** Aggregated wallet-level transaction history (newest first). */
  transactions?: HdTransaction[];
  /** Confirmed + pending balance in sats. */
  totalBalance: number;
  /** Pending (mempool) balance in sats. May be negative for outgoing. */
  pendingBalance: number;
  /** Initial scan in progress. */
  isLoading: boolean;
  /** Either scan or tx-history loading. */
  isFetching: boolean;
  /** Scan error, if any. */
  error: unknown;
  /** Trigger a manual scan + tx refresh. */
  refetch: () => Promise<unknown>;
  /** Advance the receive cursor to the next unused address. Persisted. */
  nextReceiveAddress: () => DerivedAddress | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Top-level HD wallet hook. Returns the cached scan, balance, transactions,
 * and the current receive address.
 *
 * The hook is safe to call regardless of login state — it returns
 * `availability.status !== 'available'` for non-nsec users without doing any
 * derivation or network work.
 */
export function useHdWallet(): UseHdWalletResult {
  const { config } = useAppContext();
  const { esploraApis } = config;
  const availability = useHdWalletAccess();
  const queryClient = useQueryClient();

  const pubkey = availability.status === 'available' ? availability.pubkey : '';
  const account = availability.status === 'available' ? availability.account : undefined;

  // ── Persisted receive cursor ─────────────────────────────────
  // Key by pubkey so account-switching doesn't leak indices across users.
  const [cursor, setCursor] = useSecureLocalStorage<PersistedCursor>(
    pubkey ? STORAGE_KEY(pubkey) : 'hdwallet:cursor:none',
    DEFAULT_CURSOR,
  );

  // ── Scan query ───────────────────────────────────────────────
  const scanKey = ['hdwallet-scan', esploraApis, pubkey];
  const {
    data: scan,
    isLoading: scanLoading,
    isFetching: scanFetching,
    error: scanError,
    refetch: refetchScan,
  } = useQuery<AccountScanResult>({
    queryKey: scanKey,
    queryFn: async ({ signal }) => {
      if (!account) throw new Error('HD wallet account unavailable');
      return scanAccount(account, esploraApis, signal);
    },
    enabled: !!account,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
  });

  // ── Transaction history query ────────────────────────────────
  const {
    data: transactions,
    isFetching: txFetching,
    refetch: refetchTxs,
  } = useQuery<HdTransaction[]>({
    queryKey: ['hdwallet-txs', esploraApis, pubkey, scan?.receive.used.length, scan?.change.used.length],
    queryFn: async ({ signal }) => {
      if (!scan) return [];
      return fetchHdTransactions(scan, esploraApis, signal);
    },
    enabled: !!scan,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
  });

  // ── Current receive address ──────────────────────────────────
  //
  // Resolution rules, in order:
  //   1. If the persisted cursor is *behind* the chain-derived
  //      firstUnusedIndex, the persisted index has been used by a sender →
  //      auto-advance to firstUnusedIndex. (No address reuse.)
  //   2. If the persisted cursor is *ahead* of firstUnusedIndex (user clicked
  //      "next" multiple times without any deposits), honour it.
  //   3. Otherwise use the chain-derived firstUnusedIndex.
  const currentReceiveAddress = useMemo<DerivedAddress | undefined>(() => {
    if (!account) return undefined;
    const chainNextUnused = scan?.receive.firstUnusedIndex ?? 0;
    const resolved = Math.max(chainNextUnused, cursor.receiveIndex);
    return deriveReceiveAddress(account, resolved);
  }, [account, scan, cursor.receiveIndex]);

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
    // Invalidate UTXO/balance queries used by the send dialog too.
    await queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
    return Promise.all([refetchScan(), refetchTxs()]);
  }, [queryClient, refetchScan, refetchTxs]);

  return {
    availability,
    currentReceiveAddress,
    scan,
    transactions,
    totalBalance: scan?.totalBalance ?? 0,
    pendingBalance: scan?.pendingBalance ?? 0,
    isLoading: scanLoading,
    isFetching: scanFetching || txFetching,
    error: scanError,
    refetch,
    nextReceiveAddress,
  };
}
