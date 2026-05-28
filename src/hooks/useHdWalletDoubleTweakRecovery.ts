import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { deriveSilentPaymentKeys, type SilentPaymentKeys } from '@/lib/hdwallet/derivation';
import { fetchBlockEntries, fetchTipHeight } from '@/lib/hdwallet/sp/indexer';
import {
  scanForDoubleTweakedUtxos,
  type DoubleTweakMatch,
} from '@/lib/hdwallet/sp/recovery';

// ---------------------------------------------------------------------------
// Double-tweak SP recovery hook
// ---------------------------------------------------------------------------
//
// Drives the `/wallet/double-tweak-fix` page. Re-scans a range of blocks for
// silent-payment outputs that the historical double-tweak bug stranded at
// `Q = taproot_tweak(P_k)` instead of `P_k`, using the receiver's own
// `bscan`/`Bspend`. Matches are surfaced for the user to sweep into a fresh
// BIP-86 receive address.
//
// Unlike the regular SP scanner (`useHdWalletSp`), this path does NOT persist
// anything to NIP-78 — the recovered outputs are spent immediately by the
// sweep, so there's no long-lived UTXO set to maintain. The hook is purely an
// in-memory scan + report surface.
// ---------------------------------------------------------------------------

/** Up to this many block fetches in flight at once. */
const SCAN_FETCH_CONCURRENCY = 8;

/**
 * Default scan start height: one block before the earliest known
 * double-tweak-affected transaction (the original $500 send,
 * `9fb78657…`, mined in block 951431). No affected output can exist
 * before this point, so starting here covers every stranded payment
 * without scanning the whole chain.
 */
const DEFAULT_FROM_HEIGHT = 951430;

export type DoubleTweakRecoveryUnavailable =
  | 'logged-out'
  | 'unsupported-signer'
  | 'no-indexer';

export interface DoubleTweakScanProgress {
  fromHeight: number;
  toHeight: number;
  currentHeight: number;
  matchesFound: number;
}

export interface UseHdWalletDoubleTweakRecoveryResult {
  /** Whether recovery can run for the active login + config. */
  available: boolean;
  unavailableReason?: DoubleTweakRecoveryUnavailable;
  /** Receiver SP keys (present iff `available`). */
  keys?: SilentPaymentKeys;
  /** 64-byte BIP-32 seed (present iff `available`) — needed to sign the sweep. */
  seed?: Uint8Array;
  /** Indexer tip height, once resolved. */
  tipHeight?: number;
  /** Suggested default start height for a scan (one block before the
   * earliest affected transaction). Always defined. */
  defaultFromHeight: number;
  /** True while a scan is running. */
  isScanning: boolean;
  /** Live scan progress, or undefined when idle. */
  scanProgress?: DoubleTweakScanProgress;
  /** Last scan error, if any. */
  scanError?: string;
  /** Matches found by the most recent scan. */
  matches: DoubleTweakMatch[];
  /** Total recoverable sats across `matches`. */
  recoverableSats: number;
  /** Run a scan over `[fromHeight, toHeight]` (toHeight defaults to tip). */
  scan: (args: { fromHeight: number; toHeight?: number }) => Promise<void>;
  /** Abort an in-flight scan. */
  cancel: () => void;
  /** Clear matches + error (e.g. after a successful sweep). */
  reset: () => void;
}

export function useHdWalletDoubleTweakRecovery(): UseHdWalletDoubleTweakRecoveryResult {
  const access = useHdWalletAccess();
  const { config } = useAppContext();
  const indexerUrl = (config.bip352IndexerUrl ?? '').trim();

  const seed = access.status === 'available' ? access.seed : undefined;

  const keys = useMemo<SilentPaymentKeys | undefined>(() => {
    if (!seed) return undefined;
    return deriveSilentPaymentKeys(seed);
  }, [seed]);

  const unavailableReason: DoubleTweakRecoveryUnavailable | undefined =
    access.status === 'logged-out'
      ? 'logged-out'
      : access.status === 'unsupported'
        ? 'unsupported-signer'
        : indexerUrl === ''
          ? 'no-indexer'
          : undefined;
  const available = unavailableReason === undefined;

  // Resolve indexer tip (cheap, cached 60s).
  const { data: tipHeight } = useQuery<number>({
    queryKey: ['dt-recovery-tip', indexerUrl],
    queryFn: ({ signal }) => fetchTipHeight(indexerUrl, signal),
    enabled: available,
    staleTime: 60_000,
  });

  // Fixed floor — one block before the earliest affected tx. Clamp to the
  // tip when known so we never suggest scanning past the chain end.
  const defaultFromHeight =
    tipHeight !== undefined ? Math.min(DEFAULT_FROM_HEIGHT, tipHeight) : DEFAULT_FROM_HEIGHT;

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<DoubleTweakScanProgress>();
  const [scanError, setScanError] = useState<string>();
  const [matches, setMatches] = useState<DoubleTweakMatch[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsScanning(false);
  }, []);

  const reset = useCallback(() => {
    setMatches([]);
    setScanError(undefined);
    setScanProgress(undefined);
  }, []);

  const scan = useCallback<UseHdWalletDoubleTweakRecoveryResult['scan']>(
    async ({ fromHeight, toHeight }) => {
      if (!available || !keys) return;
      if (!Number.isInteger(fromHeight) || fromHeight < 0) {
        throw new Error(`Invalid fromHeight: ${fromHeight}`);
      }

      const resolvedTo = toHeight ?? tipHeight ?? (await fetchTipHeight(indexerUrl));
      if (!Number.isInteger(resolvedTo) || resolvedTo < fromHeight) {
        throw new Error(`Invalid toHeight: ${resolvedTo}`);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setScanError(undefined);
      setMatches([]);
      setIsScanning(true);
      setScanProgress({ fromHeight, toHeight: resolvedTo, currentHeight: fromHeight, matchesFound: 0 });

      const found: DoubleTweakMatch[] = [];

      // Sliding-window fetch pipeline, processed strictly in height order.
      const inflight = new Map<number, ReturnType<typeof fetchBlockEntries>>();
      let nextToSchedule = fromHeight;
      const scheduleUpTo = (limit: number) => {
        while (
          nextToSchedule <= resolvedTo &&
          inflight.size < limit &&
          !controller.signal.aborted
        ) {
          const h = nextToSchedule++;
          // Include spent rows: a stranded output may already have been
          // (mistakenly) swept or double-spent; but for recovery we want the
          // currently-unspent set, so default (spent filtered) is correct.
          inflight.set(h, fetchBlockEntries(indexerUrl, h, controller.signal));
        }
      };

      try {
        scheduleUpTo(SCAN_FETCH_CONCURRENCY);

        for (let h = fromHeight; h <= resolvedTo; h++) {
          if (controller.signal.aborted) break;

          const pending = inflight.get(h);
          if (!pending) throw new Error(`scan pipeline missing height ${h}`);
          inflight.delete(h);

          let entries: Awaited<ReturnType<typeof fetchBlockEntries>>;
          try {
            entries = await pending;
          } catch (err) {
            controller.abort();
            throw err;
          }
          scheduleUpTo(SCAN_FETCH_CONCURRENCY);

          if (entries.length > 0) {
            const hits = await scanForDoubleTweakedUtxos(entries, keys.bscan, keys.Bspend, {
              signal: controller.signal,
            });
            if (hits.length > 0) found.push(...hits);
          }

          setScanProgress({
            fromHeight,
            toHeight: resolvedTo,
            currentHeight: h,
            matchesFound: found.length,
          });
        }

        if (!controller.signal.aborted) {
          setMatches(found.slice());
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setScanError(err instanceof Error ? err.message : 'Scan failed');
        }
      } finally {
        // Drain any still-pending fetches so their rejections don't surface
        // as unhandled promise rejections.
        for (const p of inflight.values()) p.catch(() => {});
        if (abortRef.current === controller) abortRef.current = null;
        setIsScanning(false);
      }
    },
    [available, keys, tipHeight, indexerUrl],
  );

  const recoverableSats = useMemo(
    () => matches.reduce((s, m) => s + m.value, 0),
    [matches],
  );

  return {
    available,
    unavailableReason,
    keys,
    seed,
    tipHeight,
    defaultFromHeight,
    isScanning,
    scanProgress,
    scanError,
    matches,
    recoverableSats,
    scan,
    cancel,
    reset,
  };
}
