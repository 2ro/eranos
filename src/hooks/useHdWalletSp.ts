import { useCallback, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  deriveSilentPaymentKeys,
  type SilentPaymentKeys,
} from '@/lib/hdwallet/derivation';
import { fetchBlockEntries, fetchTipHeight } from '@/lib/hdwallet/sp/indexer';
import { scanBatch, type SPMatchedUtxo } from '@/lib/hdwallet/sp/scanner';
import {
  EMPTY_SP_STORAGE,
  matchedUtxoToStored,
  mergeUtxos,
  parseSPStorage,
  serializeSPStorage,
  type SPStorageDocument,
  spStorageBalance,
  spStorageDTag,
  SP_STORAGE_VERSION,
} from '@/lib/hdwallet/sp/storage';

// ---------------------------------------------------------------------------
// HD wallet — silent-payments orchestrator
// ---------------------------------------------------------------------------
//
// Pulls everything below together so the HD wallet UI can:
//
//   1. Read the persisted SP UTXO state (NIP-78 / kind 30078, NIP-44 encrypted).
//   2. Run a chain scan against a BlindBit Oracle v2 indexer in user-driven
//      ranges (`scanRange({ fromHeight, toHeight? })`).
//   3. Persist freshly discovered UTXOs back to the encrypted NIP-78 event
//      as they're found.
//
// Spending and sending are deliberately not in scope — see
// `src/lib/hdwallet/sp/crypto.ts` for the rationale.
// ---------------------------------------------------------------------------

/** Default scan window when the user clicks "Scan recent" with no explicit bounds. */
const DEFAULT_RECENT_SCAN_BLOCKS = 144; // ~24 hours of mainnet blocks.

export interface UseHdWalletSpResult {
  /** Whether the feature is usable. False when not logged in with nsec, or no indexer configured. */
  enabled: boolean;
  /** Concrete reason `enabled` is false, when applicable. */
  unavailableReason?: 'logged-out' | 'unsupported-signer' | 'no-indexer';

  /** The wallet's SP key material. `undefined` until the hook is enabled. */
  keys?: SilentPaymentKeys;

  /** The decrypted persisted UTXO document. `undefined` while loading. */
  storage?: SPStorageDocument;
  /** Sum of all stored SP UTXO values, in satoshis. */
  balance: number;
  /** True until the first storage load resolves. */
  isLoading: boolean;

  /** Active scan progress, if any. */
  scanProgress?: {
    fromHeight: number;
    toHeight: number;
    currentHeight: number;
    matchesFound: number;
  };
  /** True while `scanRange` (or a derived helper) is running. */
  isScanning: boolean;
  /** Error from the most recent scan, if it failed. Cleared on next scan start. */
  scanError?: Error;

  /** Tip height as reported by the indexer (cached, lightly refreshed). */
  tipHeight?: number;

  /** Scan a contiguous block range. `toHeight` defaults to current tip. */
  scanRange: (args: { fromHeight: number; toHeight?: number }) => Promise<void>;
  /** Scan the most recent `DEFAULT_RECENT_SCAN_BLOCKS` blocks (or fewer if newer). */
  scanRecent: () => Promise<void>;
  /** Abort an in-flight scan. */
  cancelScan: () => void;
}

const EMPTY_RESULT: UseHdWalletSpResult = {
  enabled: false,
  balance: 0,
  isLoading: false,
  isScanning: false,
  scanRange: async () => {},
  scanRecent: async () => {},
  cancelScan: () => {},
};

export function useHdWalletSp(): UseHdWalletSpResult {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const access = useHdWalletAccess();
  const queryClient = useQueryClient();

  const indexerUrl = (config.bip352IndexerUrl ?? '').trim();
  const pubkey = access.status === 'available' ? access.pubkey : '';
  const nsecBytes = access.status === 'available' ? access.nsecBytes : undefined;

  // ── SP key derivation (memoised) ─────────────────────────────
  const keys = useMemo<SilentPaymentKeys | undefined>(() => {
    if (!nsecBytes) return undefined;
    return deriveSilentPaymentKeys(nsecBytes);
  }, [nsecBytes]);

  // ── Availability gating ──────────────────────────────────────
  // Compute the early-return shape *before* hooks branch so React's
  // hook-order rule stays happy.
  const unavailableReason: UseHdWalletSpResult['unavailableReason'] =
    access.status === 'logged-out'
      ? 'logged-out'
      : access.status === 'unsupported'
        ? 'unsupported-signer'
        : indexerUrl === ''
          ? 'no-indexer'
          : undefined;
  const enabled = unavailableReason === undefined;

  // ── Stable d-tag for the persisted UTXO event ────────────────
  const dTag = spStorageDTag(config.appId);

  // ── Tip-height query (cheap, refreshed every 60s when enabled) ──
  const { data: tipHeight } = useQuery<number>({
    queryKey: ['hdwallet-sp-tip', indexerUrl],
    queryFn: ({ signal }) => fetchTipHeight(indexerUrl, signal),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // ── Persisted storage event ──────────────────────────────────
  //
  // Two-stage query like `useEncryptedSettings`: stage 1 fetches the raw
  // event from relays, stage 2 NIP-44-decrypts it. We key the parse stage
  // on the event id so a stale parse doesn't survive an event update.
  const storageEventQuery = useQuery({
    queryKey: ['hdwallet-sp-event', pubkey, dTag],
    queryFn: async () => {
      if (!user) return null;
      const events = await nostr.query([
        {
          kinds: [30078],
          authors: [user.pubkey],
          '#d': [dTag],
          limit: 1,
        },
      ]);
      if (events.length === 0) return null;
      // Pick the most recent if multiple relays returned different versions.
      return events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
    },
    enabled: enabled && !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const storageDocQuery = useQuery<SPStorageDocument>({
    queryKey: ['hdwallet-sp-doc', storageEventQuery.data?.id ?? '(empty)'],
    queryFn: async () => {
      const event = storageEventQuery.data;
      if (!event) return { ...EMPTY_SP_STORAGE };
      if (!user?.signer.nip44) return { ...EMPTY_SP_STORAGE };
      if (!event.content) return { ...EMPTY_SP_STORAGE };
      try {
        const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
        return parseSPStorage(plaintext);
      } catch (err) {
        console.warn('Failed to decrypt SP storage event; treating as empty:', err);
        return { ...EMPTY_SP_STORAGE };
      }
    },
    enabled: enabled && !!user,
    staleTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // ── Optimistic in-memory copy ────────────────────────────────
  //
  // The relay round-trip on each scan-progress tick would be unacceptable, so
  // we maintain an in-memory document that the scanner updates synchronously
  // and the relay republish coalesces every few seconds. The `?? loaded`
  // pattern below means we drop the optimistic copy as soon as a newer
  // event lands.
  const optimisticRef = useRef<SPStorageDocument | null>(null);
  const [optimisticVersion, setOptimisticVersion] = useState(0);
  void optimisticVersion; // touched so React knows to re-render on bump

  const storage = useMemo<SPStorageDocument | undefined>(() => {
    if (!enabled) return undefined;
    if (!storageDocQuery.data) return undefined;
    // Prefer the optimistic copy when it's at least as fresh as relays.
    const loaded = storageDocQuery.data;
    const opt = optimisticRef.current;
    if (!opt) return loaded;
    if (opt.scanHeight >= loaded.scanHeight && opt.utxos.length >= loaded.utxos.length) {
      return opt;
    }
    return loaded;
  }, [enabled, storageDocQuery.data]);

  // ── Mutation: persist a new document to relays ───────────────
  const publishStorage = useMutation({
    mutationFn: async (next: SPStorageDocument) => {
      if (!user) throw new Error('not logged in');
      if (!user.signer.nip44) throw new Error('signer does not support NIP-44');
      // Always read-modify-write off the freshest event so a concurrent device
      // doesn't lose its progress.
      const prev = await fetchFreshEvent(nostr, {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
      });
      let merged: SPStorageDocument = next;
      if (prev?.content) {
        try {
          const decrypted = await user.signer.nip44.decrypt(user.pubkey, prev.content);
          const remote = parseSPStorage(decrypted);
          merged = {
            version: SP_STORAGE_VERSION,
            scanHeight: Math.max(remote.scanHeight, next.scanHeight),
            utxos: mergeUtxos(remote.utxos, next.utxos),
          };
        } catch {
          // Treat undecryptable remote as empty rather than blocking the write.
        }
      }
      const ciphertext = await user.signer.nip44.encrypt(user.pubkey, serializeSPStorage(merged));
      const unsigned = {
        kind: 30078,
        content: ciphertext,
        tags: [
          ['d', dTag],
          ['title', `${config.appName} HD Wallet — Silent Payment UTXOs`],
          ['client', config.appName, ...(config.client ? [config.client] : [])],
          ['alt', 'Encrypted silent-payment UTXO set for the HD wallet'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };
      const signed = await user.signer.signEvent(unsigned);
      // Best-effort publish — the local optimistic copy is still authoritative.
      nostr.event(signed, { signal: AbortSignal.timeout(5000) }).catch((e) => {
        console.warn('Failed to publish SP storage event:', e);
      });
      return { merged, signed };
    },
    onSuccess: ({ merged, signed }) => {
      // Update query caches in-place to avoid an immediate refetch round-trip.
      queryClient.setQueryData(['hdwallet-sp-event', pubkey, dTag], signed);
      queryClient.setQueryData(['hdwallet-sp-doc', signed.id], merged);
    },
  });

  // ── Scan state ───────────────────────────────────────────────
  const [scanProgress, setScanProgress] = useState<UseHdWalletSpResult['scanProgress']>();
  const [scanError, setScanError] = useState<Error | undefined>();
  const [isScanning, setIsScanning] = useState(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  // Debounce timer for republishing storage during a long scan.
  const republishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScan = useCallback(() => {
    scanAbortRef.current?.abort();
  }, []);

  const flushRepublish = useCallback(() => {
    if (republishTimerRef.current) {
      clearTimeout(republishTimerRef.current);
      republishTimerRef.current = null;
    }
    const doc = optimisticRef.current;
    if (!doc) return;
    publishStorage.mutate(doc);
  }, [publishStorage]);

  const scheduleRepublish = useCallback(() => {
    if (republishTimerRef.current) clearTimeout(republishTimerRef.current);
    republishTimerRef.current = setTimeout(() => {
      republishTimerRef.current = null;
      const doc = optimisticRef.current;
      if (doc) publishStorage.mutate(doc);
    }, 5000);
  }, [publishStorage]);

  // ── The core scan loop ───────────────────────────────────────
  const scanRange = useCallback<UseHdWalletSpResult['scanRange']>(
    async ({ fromHeight, toHeight }) => {
      if (!enabled || !keys) return;
      if (!storage) return; // Wait for the first load — caller can retry.
      if (!Number.isInteger(fromHeight) || fromHeight < 0) {
        throw new Error(`Invalid fromHeight: ${fromHeight}`);
      }

      // Resolve the upper bound — default to current tip.
      const resolvedTo = toHeight ?? tipHeight ?? (await fetchTipHeight(indexerUrl));
      if (!Number.isInteger(resolvedTo) || resolvedTo < fromHeight) {
        throw new Error(`Invalid toHeight: ${resolvedTo}`);
      }

      // Abort any prior in-flight scan.
      scanAbortRef.current?.abort();
      const controller = new AbortController();
      scanAbortRef.current = controller;

      setScanError(undefined);
      setIsScanning(true);
      setScanProgress({
        fromHeight,
        toHeight: resolvedTo,
        currentHeight: fromHeight,
        matchesFound: 0,
      });

      // Seed the optimistic doc from the current snapshot so we don't lose
      // existing UTXOs while scanning a sparse range.
      optimisticRef.current = {
        version: SP_STORAGE_VERSION,
        scanHeight: storage.scanHeight,
        utxos: storage.utxos.slice(),
      };

      let matchesFound = 0;
      let highestContiguousScanned = fromHeight - 1;

      try {
        for (let h = fromHeight; h <= resolvedTo; h++) {
          if (controller.signal.aborted) break;

          const entries = await fetchBlockEntries(indexerUrl, h, controller.signal);
          let blockMatches: SPMatchedUtxo[] = [];
          if (entries.length > 0) {
            blockMatches = await scanBatch(entries, keys.bscan, keys.Bspend, {
              signal: controller.signal,
            });
          }

          // Merge matches into the optimistic doc.
          if (blockMatches.length > 0) {
            const opt = optimisticRef.current!;
            const fresh = blockMatches.map(matchedUtxoToStored);
            optimisticRef.current = {
              version: SP_STORAGE_VERSION,
              scanHeight: opt.scanHeight,
              utxos: mergeUtxos(opt.utxos, fresh),
            };
            matchesFound += blockMatches.length;
          }

          // Forward the scan cursor as long as we advance contiguously from
          // the start of this range.
          if (h === highestContiguousScanned + 1) {
            highestContiguousScanned = h;
            const opt = optimisticRef.current!;
            optimisticRef.current = {
              ...opt,
              scanHeight: Math.max(opt.scanHeight, highestContiguousScanned),
            };
          }

          setScanProgress({
            fromHeight,
            toHeight: resolvedTo,
            currentHeight: h,
            matchesFound,
          });
          // Bump the optimistic-version state so `storage` recomputes.
          setOptimisticVersion((v) => v + 1);

          // Coalesce relay republishes so a 10k-block scan doesn't fire 10k
          // events at the user's signer.
          scheduleRepublish();
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Caller asked to cancel — not an error to surface.
        } else {
          setScanError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsScanning(false);
        // Final flush — make sure the last scan progress reaches relays.
        flushRepublish();
        if (scanAbortRef.current === controller) {
          scanAbortRef.current = null;
        }
      }
    },
    [enabled, keys, storage, tipHeight, indexerUrl, scheduleRepublish, flushRepublish],
  );

  const scanRecent = useCallback<UseHdWalletSpResult['scanRecent']>(async () => {
    if (!enabled) return;
    const tip = tipHeight ?? (await fetchTipHeight(indexerUrl));
    const from = Math.max(0, tip - DEFAULT_RECENT_SCAN_BLOCKS + 1);
    await scanRange({ fromHeight: from, toHeight: tip });
  }, [enabled, indexerUrl, tipHeight, scanRange]);

  const balance = useMemo(() => (storage ? spStorageBalance(storage) : 0), [storage]);

  // ── Assemble the public shape ───────────────────────────────
  if (!enabled) {
    return { ...EMPTY_RESULT, unavailableReason, keys };
  }

  return {
    enabled,
    keys,
    storage,
    balance,
    isLoading: storageEventQuery.isLoading || storageDocQuery.isLoading,
    scanProgress,
    isScanning,
    scanError,
    tipHeight,
    scanRange,
    scanRecent,
    cancelScan,
  };
}
