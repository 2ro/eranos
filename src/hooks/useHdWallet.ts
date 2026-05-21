import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import {
  EMPTY_PERSISTED_SCAN,
  fromPersistedScan,
  type PersistedScan,
  scanCacheKey,
  toPersistedScan,
} from '@/lib/hdwallet/cache';

// ---------------------------------------------------------------------------
// Persisted UI cursor (per user)
// ---------------------------------------------------------------------------
//
// We persist a single integer per user: the "preferred receive index" — the
// index of the address we are *currently advertising* on the wallet page.
// The chain-scan source of truth is the relay-derived `firstUnusedIndex`,
// but if the user explicitly bumps to a fresh address (or rotates back),
// we honour that until the chain catches up.

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
 * Re-scan every 2 minutes. On-chain activity is slow; the incremental scan
 * (warm scan only re-fetches known-used addresses + a small gap tail) keeps
 * the per-refresh request count low even at 2-minute polling. Combined with
 * `fetchAddressSnapshot` collapsing 3 calls into 1 per used address, a
 * steady-state wallet with 5 used addresses now uses ~5 requests/refresh
 * instead of the previous ~50+.
 */
const REFRESH_INTERVAL_MS = 120_000;

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
  /** Trigger a manual scan refresh. */
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
 * Performance:
 *
 *   - The first scan ever is a cold gap-limit walk (full BIP44 scan).
 *   - Subsequent scans are **incremental**: we persist the used-address
 *     skeleton in secure storage and feed it back as `prev` to
 *     `scanAccount`. The scan then only re-fetches known-used addresses
 *     plus a small tail past `firstUnusedIndex` — typically << 10 requests
 *     for a steady-state wallet.
 *   - Per-refresh request count is further halved by `fetchAddressSnapshot`,
 *     which derives balance, UTXOs, **and** tx history from a single
 *     `/address/:addr/txs` call (down from 3 separate calls).
 *   - Tx history aggregation runs in memory from the snapshot data — no
 *     additional round trips. (Previous implementation re-fetched
 *     `/address/:addr/txs` separately on every refresh.)
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
  const [cursor, setCursor] = useSecureLocalStorage<PersistedCursor>(
    pubkey ? CURSOR_KEY(pubkey) : 'hdwallet:cursor:none',
    DEFAULT_CURSOR,
  );

  // ── Persisted scan skeleton ──────────────────────────────────
  //
  // Loaded lazily — when secure storage is on native it's async. We feed
  // whatever is loaded back into `scanAccount` as `prev` on every fetch so
  // the warm scan runs even on the very first call after page reload.
  const [persistedScan, setPersistedScan, persistedScanReady] = useSecureLocalStorage<PersistedScan>(
    pubkey ? scanCacheKey(pubkey) : 'hdwallet:scan:none',
    EMPTY_PERSISTED_SCAN,
  );

  // Track the "live" prev that's threaded through the scan, so the
  // *result* of one scan informs the *prev* of the next without forcing a
  // re-render on every successful fetch.
  const livePrevRef = useRef<AccountScanResult | undefined>(undefined);

  // Hydrate `livePrev` from the persisted skeleton the first time it loads.
  useEffect(() => {
    if (!persistedScanReady) return;
    if (livePrevRef.current) return;
    livePrevRef.current = fromPersistedScan(persistedScan);
  }, [persistedScanReady, persistedScan]);

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
      const result = await scanAccount(account, esploraApis, signal, livePrevRef.current);
      // Update our in-memory prev for the next refresh, and asynchronously
      // persist the new skeleton.
      livePrevRef.current = result;
      setPersistedScan(toPersistedScan(result));
      return result;
    },
    enabled: !!account && persistedScanReady,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
    // Avoid a refetch storm when the user tabs back in mid-interval.
    refetchOnWindowFocus: false,
  });

  // ── Transaction history (derived, no extra fetches) ──────────
  //
  // The address snapshots already contain every tx that touched each used
  // address. We just merge them in memory whenever the scan result changes.
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
