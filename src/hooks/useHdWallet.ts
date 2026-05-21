import { useCallback, useMemo, useRef } from 'react';
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
  fromPersistedScan,
  type PersistedScan,
  scanCacheKey,
  toPersistedScan,
} from '@/lib/hdwallet/cache';
import { secureStorage } from '@/lib/secureStorage';

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
 * steady-state wallet with 5 used addresses uses ~5 requests/refresh.
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
// Cache hydration
// ---------------------------------------------------------------------------

/**
 * Read the persisted scan skeleton for the given pubkey directly from the
 * platform's storage layer (Keychain on native, localStorage on web). Used
 * inside `queryFn` to avoid the previous useEffect/useRef hydration race —
 * by the time the query fires, `pubkey` is guaranteed non-empty (we gate the
 * query on that), so the read is deterministic and synchronous.
 *
 * Returns `undefined` when:
 *   - the key is absent (first ever scan for this account),
 *   - the stored value is corrupt JSON,
 *   - or the stored schema version is from a previous incompatible build.
 *
 * Any of those falls back to a cold scan, which then writes a fresh
 * skeleton back out.
 */
async function readPersistedPrev(pubkey: string): Promise<AccountScanResult | undefined> {
  try {
    const raw = await secureStorage.getItem(scanCacheKey(pubkey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedScan;
    return fromPersistedScan(parsed);
  } catch (err) {
    console.warn('Failed to load HD wallet cache, falling back to cold scan:', err);
    return undefined;
  }
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
 *   - Subsequent scans are **incremental**: the persisted skeleton
 *     (`PersistedScan`) is read directly inside `queryFn`, fed to
 *     `scanAccount` as `prev`, and the scan only re-fetches known-used
 *     addresses plus a small tail past `firstUnusedIndex` — typically << 10
 *     requests for a steady-state wallet.
 *   - Per-refresh request count is further halved by `fetchAddressSnapshot`,
 *     which derives balance, UTXOs, **and** tx history from a single
 *     `/address/:addr/txs` call (down from 3 separate calls).
 *   - Tx history aggregation runs in memory from the snapshot data — no
 *     additional round trips.
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

  // ── In-memory live cache ─────────────────────────────────────
  //
  // After a successful scan we hold the full result here so the *next*
  // refresh (every 2 minutes, or on manual refetch) doesn't need to re-read
  // the persisted skeleton. The persisted copy still gets updated for
  // page-reload survival.
  const livePrevRef = useRef<AccountScanResult | undefined>(undefined);

  // ── Scan query ───────────────────────────────────────────────
  //
  // CRITICAL: `enabled` requires a non-empty pubkey *and* an account. The
  // empty-pubkey false-start (render 1, before useCurrentUser resolves) is
  // what previously caused the cold-scan-on-every-refresh bug.
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
      if (!account || !pubkey) throw new Error('HD wallet account unavailable');

      // Prefer the in-memory prev from a previous successful scan; otherwise
      // hydrate from the platform's storage layer. Either path runs entirely
      // synchronously on web (secureStorage.getItem reads localStorage
      // directly) and async-but-fast on native.
      const prev = livePrevRef.current ?? (await readPersistedPrev(pubkey));

      const result = await scanAccount(account, esploraApis, signal, prev);

      // Update both caches before returning. The persisted write is
      // fire-and-forget on native (no await needed for correctness).
      livePrevRef.current = result;
      void secureStorage.setItem(scanCacheKey(pubkey), JSON.stringify(toPersistedScan(result)))
        .catch((err) => console.warn('Failed to persist HD wallet cache:', err));

      return result;
    },
    enabled: !!account && pubkey !== '',
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
    // Avoid a refetch storm when the user tabs back in mid-interval.
    refetchOnWindowFocus: false,
  });

  // ── Transaction history (derived, no extra fetches) ──────────
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
