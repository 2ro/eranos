import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useSecureLocalStorage } from '@/hooks/useSecureLocalStorage';
import { useHdWalletAccess, type HdWalletAvailability } from '@/hooks/useHdWalletAccess';
import { deriveReceiveAddress, type DerivedAddress } from '@/lib/hdwallet/derivation';
import {
  type AccountScanResult,
  buildHdTransactions,
  type HdTransaction,
  scanAccount,
} from '@/lib/hdwallet/scan';

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
  /** Full scan result — UTXOs, used addresses, etc. */
  scan?: AccountScanResult;
  /** Aggregated wallet-level transaction history (newest first). */
  transactions?: HdTransaction[];
  /** Confirmed + pending balance in sats. */
  totalBalance: number;
  /** Pending (mempool) balance in sats. */
  pendingBalance: number;
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

  const pubkey = availability.status === 'available' ? availability.pubkey : '';
  const account = availability.status === 'available' ? availability.account : undefined;

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
  const transactions = useMemo<HdTransaction[] | undefined>(() => {
    if (!scan) return undefined;
    return buildHdTransactions(scan);
  }, [scan]);

  // ── Current receive address ──────────────────────────────────
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
    await queryClient.invalidateQueries({ queryKey: ['hdwallet-scan'] });
    return refetchScan();
  }, [queryClient, refetchScan]);

  return {
    availability,
    currentReceiveAddress,
    scan,
    transactions,
    totalBalance: scan?.totalBalance ?? 0,
    pendingBalance: scan?.pendingBalance ?? 0,
    isLoading: scanLoading,
    isFetching: scanFetching,
    error: scanError,
    refetch,
    nextReceiveAddress,
  };
}
