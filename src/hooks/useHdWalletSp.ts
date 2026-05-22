import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { fetchBlockTime, fetchUtxoSpentStatus } from '@/lib/hdwallet/blockbook';
import { fetchBlockEntries, fetchTipHeight } from '@/lib/hdwallet/sp/indexer';
import { scanBatch, type SPMatchedUtxo } from '@/lib/hdwallet/sp/scanner';
import {
  EMPTY_SP_STORAGE,
  archiveSpentUtxos,
  matchedUtxoToStored,
  mergeUtxos,
  parseSPStorage,
  pruneSpUtxos,
  serializeSPStorage,
  type SPStorageDocument,
  type SPStoredUtxo,
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

/**
 * Maximum distinct txids to check per manual reconcile click. Bounds the
 * Blockbook WS fan-out on wallets with many stored SP UTXOs — remaining
 * entries are picked up on subsequent clicks.
 */
const MAX_RECONCILE_UTXOS = 50;

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

  /**
   * Scan a contiguous block range. `toHeight` defaults to current tip.
   *
   * `includeSpent` opts into a deeper rescan that also considers UTXOs
   * already spent on-chain. Matches against spent outputs land in the
   * `spent` archive rather than the active set — useful for recovering
   * historical receive rows when the wallet's local doc was pruned
   * without archiving (e.g. by a build that predates the archive logic).
   */
  scanRange: (args: {
    fromHeight: number;
    toHeight?: number;
    includeSpent?: boolean;
  }) => Promise<void>;
  /** Scan the most recent `DEFAULT_RECENT_SCAN_BLOCKS` blocks (or fewer if newer). */
  scanRecent: () => Promise<void>;
  /** Abort an in-flight scan. */
  cancelScan: () => void;

  /**
   * Drop the given SP UTXOs from local storage and republish the NIP-78
   * document so other devices stay in sync.
   *
   * Called by the send flow after a successful broadcast — Blockbook's
   * xpub-scoped scan can't observe silent-payment outputs, so without
   * this the wallet has no way to learn that an SP UTXO it just spent is
   * gone. Failure to call it (or to publish) results in stale balance and
   * subsequent double-spend attempts.
   */
  pruneSpentUtxos: (spent: ReadonlyArray<{ txid: string; vout: number }>) => void;

  /** Progress for an in-flight reconcile (or the last completed one). */
  reconcileProgress?: {
    /** Number of UTXOs queued for checking this run. */
    total: number;
    /** UTXOs whose Blockbook lookup has completed. */
    checked: number;
    /** UTXOs flagged as spent and pruned. */
    prunedSoFar: number;
  };
  /** True while a reconcile pass is in flight. */
  isReconciling: boolean;
  /** Error from the most recent reconcile, cleared on next start. */
  reconcileError?: Error;

  /**
   * Walk the stored SP UTXO set, ask Blockbook whether each one is still
   * unspent, and prune any that are spent. Capped at 50 distinct txids per
   * call to bound network fan-out — remaining entries are reconciled on
   * the next click.
   *
   * Exists because Blockbook's xpub scan can't observe SP outputs, so a
   * UTXO spent outside the local send flow (different device, pre-fix
   * build) would otherwise linger in the encrypted NIP-78 doc forever.
   *
   * Resolves with the number of UTXOs pruned this pass.
   */
  reconcileSpentUtxos: () => Promise<number>;
}

const EMPTY_RESULT: UseHdWalletSpResult = {
  enabled: false,
  balance: 0,
  isLoading: false,
  isScanning: false,
  scanRange: async () => {},
  scanRecent: async () => {},
  cancelScan: () => {},
  pruneSpentUtxos: () => {},
  isReconciling: false,
  reconcileSpentUtxos: async () => 0,
};

export function useHdWalletSp(): UseHdWalletSpResult {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const access = useHdWalletAccess();
  const queryClient = useQueryClient();

  const indexerUrl = (config.bip352IndexerUrl ?? '').trim();
  const blockbookUrl = (config.blockbookBaseUrl ?? '').trim();
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
    // Heuristic: optimistic wins when it's caught up scan-wise AND it
    // accounts for at least as many entries (active + archived) as the
    // loaded copy. The combined-count check matters because prunes shrink
    // `utxos` while growing `spent`, and deep rescans grow `spent` without
    // touching `utxos`.
    const optTotal = opt.utxos.length + (opt.spent?.length ?? 0);
    const loadedTotal = loaded.utxos.length + (loaded.spent?.length ?? 0);
    if (opt.scanHeight >= loaded.scanHeight && optTotal >= loadedTotal) {
      return opt;
    }
    return loaded;
  }, [enabled, storageDocQuery.data]);

  // ── Mutation: persist a new document to relays ───────────────
  //
  // Optionally accepts a list of `(txid, vout)` entries that were spent
  // locally; these are stripped from the remote-merged document too, so
  // the canonical published copy actually loses the spent UTXOs instead
  // of having them merged back in by `mergeUtxos` (which is insert-only).
  const publishStorage = useMutation({
    mutationFn: async (args: {
      next: SPStorageDocument;
      spent?: ReadonlyArray<{ txid: string; vout: number }>;
    }) => {
      const { next, spent } = args;
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
          // Prune any spent UTXOs from the remote *before* the merge —
          // otherwise insert-only `mergeUtxos` would re-add them.
          const remoteUtxos = spent && spent.length > 0
            ? pruneSpUtxos(remote.utxos, spent)
            : remote.utxos;
          // Merge the spent archive: union both sides' archives, plus the
          // entries we just pruned out of `remote.utxos`. Without this a
          // racing relay copy could resurrect a row in `utxos` that the
          // local prune already classified as spent, or drop archive
          // entries the local copy intentionally retained for history.
          const localArchive = next.spent ?? [];
          const remoteArchive = remote.spent ?? [];
          const archiveByKey = new Map<string, SPStoredUtxo>();
          for (const u of remoteArchive) archiveByKey.set(`${u.txid}:${u.vout}`, u);
          for (const u of localArchive) {
            if (!archiveByKey.has(`${u.txid}:${u.vout}`)) {
              archiveByKey.set(`${u.txid}:${u.vout}`, u);
            }
          }
          // Pull pruned-from-remote rows into the archive too — they're
          // outpoints we know are spent but the remote didn't realise.
          if (spent && spent.length > 0) {
            const spentKeys = new Set(spent.map((s) => `${s.txid}:${s.vout}`));
            for (const u of remote.utxos) {
              const k = `${u.txid}:${u.vout}`;
              if (spentKeys.has(k) && !archiveByKey.has(k)) {
                archiveByKey.set(k, u);
              }
            }
          }
          merged = {
            version: SP_STORAGE_VERSION,
            scanHeight: Math.max(remote.scanHeight, next.scanHeight),
            utxos: mergeUtxos(remoteUtxos, next.utxos),
            spent: Array.from(archiveByKey.values()),
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
  // Throttle timer for republishing storage during a long scan. Armed once
  // when there's unpublished progress; subsequent `scheduleRepublish` calls
  // while the timer is armed are no-ops. This guarantees a publish at least
  // every `REPUBLISH_THROTTLE_MS` during a continuous scan — unlike a
  // trailing debounce, which keeps resetting and may never fire.
  const republishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when `optimisticRef.current` contains a *match* that hasn't been
  // republished yet. Scan-height advancement alone does NOT set this — we
  // don't want to fire a relay event every 5s during a 10k-block walk over
  // empty blocks. The final flush in `scanRange`'s `finally` publishes
  // unconditionally so the advanced `scanHeight` still gets checkpointed.
  const republishDirtyRef = useRef(false);

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
    republishDirtyRef.current = false;
    publishStorage.mutate({ next: doc });
  }, [publishStorage]);

  const REPUBLISH_THROTTLE_MS = 5000;
  const scheduleRepublish = useCallback(() => {
    // Already armed — let the existing timer fire. This is the difference
    // from a debounce: we don't reset on every call, so a tight scan loop
    // still publishes on the original schedule.
    if (republishTimerRef.current) return;
    // Nothing worth publishing — don't arm.
    if (!republishDirtyRef.current) return;
    republishTimerRef.current = setTimeout(() => {
      republishTimerRef.current = null;
      const doc = optimisticRef.current;
      if (!doc) return;
      if (!republishDirtyRef.current) return;
      republishDirtyRef.current = false;
      publishStorage.mutate({ next: doc });
    }, REPUBLISH_THROTTLE_MS);
  }, [publishStorage]);

  // ── The core scan loop ───────────────────────────────────────
  const scanRange = useCallback<UseHdWalletSpResult['scanRange']>(
    async ({ fromHeight, toHeight, includeSpent = false }) => {
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
      // existing UTXOs (or archive entries) while scanning a sparse range.
      optimisticRef.current = {
        version: SP_STORAGE_VERSION,
        scanHeight: storage.scanHeight,
        utxos: storage.utxos.slice(),
        spent: (storage.spent ?? []).slice(),
      };

      let matchesFound = 0;
      let highestContiguousScanned = fromHeight - 1;

      try {
        for (let h = fromHeight; h <= resolvedTo; h++) {
          if (controller.signal.aborted) break;

          const entries = await fetchBlockEntries(
            indexerUrl,
            h,
            controller.signal,
            includeSpent,
          );
          let blockMatches: SPMatchedUtxo[] = [];
          if (entries.length > 0) {
            blockMatches = await scanBatch(entries, keys.bscan, keys.Bspend, {
              signal: controller.signal,
            });
          }

          // Merge matches into the optimistic doc.
          if (blockMatches.length > 0) {
            // Fetch the real block timestamp from Blockbook so we can stamp
            // every fresh UTXO with `time`. The HD wallet's UI falls back to
            // a synthetic `block-height × 600s` estimate when this is
            // missing, but that estimate drifts noticeably (often days) on
            // recent blocks because real average block time is shorter than
            // 600s, leading to "X days ago" labels that flip into the
            // future. A single Blockbook lookup per matched block is cheap
            // and fixes it.
            let blockTime: number | undefined;
            if (blockbookUrl) {
              try {
                blockTime = await fetchBlockTime(blockbookUrl, h, controller.signal);
              } catch (err) {
                // Best-effort: don't fail the whole scan because Blockbook
                // is unreachable. The synthetic fallback still renders.
                console.warn(`Failed to fetch block time for height ${h}:`, err);
              }
            }

            // Partition matches into "still unspent" (active set) and
            // "already spent at scan time" (archive). The archive entries
            // are essential for the tx-history classifier to attribute the
            // spending tx as a wallet send — without them a deep rescan is
            // useless for history recovery.
            const freshActive: SPStoredUtxo[] = [];
            const freshArchive: SPStoredUtxo[] = [];
            for (const m of blockMatches) {
              const stored = matchedUtxoToStored(m);
              const stamped =
                blockTime !== undefined ? { ...stored, time: blockTime } : stored;
              if (m.spent) freshArchive.push(stamped);
              else freshActive.push(stamped);
            }

            const opt = optimisticRef.current!;
            optimisticRef.current = {
              version: SP_STORAGE_VERSION,
              scanHeight: opt.scanHeight,
              utxos: mergeUtxos(opt.utxos, freshActive),
              spent: mergeUtxos(opt.spent ?? [], freshArchive),
            };
            matchesFound += blockMatches.length;
            // New matches landed — arm the throttle so they reach relays
            // within `REPUBLISH_THROTTLE_MS` even if the user closes the
            // tab before the scan finishes.
            republishDirtyRef.current = true;
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

          // Throttled relay republish — fires at most once per
          // `REPUBLISH_THROTTLE_MS`, and only when new matches have landed
          // since the last publish. Guarantees the user loses at most one
          // throttle window of progress if they close the tab mid-scan,
          // without flooding their signer on empty-block walks.
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
    [enabled, keys, storage, tipHeight, indexerUrl, blockbookUrl, scheduleRepublish, flushRepublish],
  );

  const scanRecent = useCallback<UseHdWalletSpResult['scanRecent']>(async () => {
    if (!enabled) return;
    const tip = tipHeight ?? (await fetchTipHeight(indexerUrl));
    const from = Math.max(0, tip - DEFAULT_RECENT_SCAN_BLOCKS + 1);
    await scanRange({ fromHeight: from, toHeight: tip });
  }, [enabled, indexerUrl, tipHeight, scanRange]);

  const balance = useMemo(() => (storage ? spStorageBalance(storage) : 0), [storage]);

  // Keep a stable ref to the latest storage so callbacks called from outside
  // the React render cycle (e.g. the send dialog's mutation success handler)
  // see the freshest UTXO set without forcing the callback to re-create.
  const storageRef = useRef<SPStorageDocument | undefined>(storage);
  storageRef.current = storage;

  // ── Prune spent SP UTXOs after a successful broadcast ────────
  //
  // The send flow consumes one or more SP UTXOs but Blockbook's xpub scan
  // can't observe them — they sit in the NIP-78 doc forever unless we
  // remove them explicitly. Without this, `balance` would keep counting
  // the spent UTXOs and the coin selector would offer them again on the
  // next send (producing a "missing/spent input" broadcast failure), all
  // while Blockbook's view of the BIP-86 change credits to total balance,
  // so the wallet appears to *gain* money after a spend.
  const pruneSpentUtxos = useCallback<UseHdWalletSpResult['pruneSpentUtxos']>(
    (spent) => {
      if (!spent.length) return;
      // Cancel any pending throttled republish — its document snapshot
      // doesn't know about the prune. We're about to publish a strictly
      // newer doc below, so the throttle's pending payload would be stale.
      if (republishTimerRef.current) {
        clearTimeout(republishTimerRef.current);
        republishTimerRef.current = null;
      }
      republishDirtyRef.current = false;
      const base = storageRef.current ?? optimisticRef.current;
      if (!base) return;
      // Archive (don't delete) the pruned entries so the transaction-history
      // UI can still show their original receive row, and the send-vs-
      // receive classifier in `buildHdTransactions` can attribute any
      // future Blockbook tx that referenced one of these outpoints as a
      // wallet send.
      const next: SPStorageDocument = archiveSpentUtxos(base, spent);
      optimisticRef.current = next;
      setOptimisticVersion((v) => v + 1);
      // Also write the pruned doc directly into the doc-query cache so
      // the `storage` memo doesn't briefly fall back to the unpruned
      // relay copy while the publish round-trip is in flight (the
      // optimistic-preference heuristic uses `utxos.length` to decide
      // freshness, and a prune *shrinks* the list).
      const eventId = queryClient.getQueryData<{ id?: string } | null>([
        'hdwallet-sp-event',
        pubkey,
        dTag,
      ])?.id;
      if (eventId) {
        queryClient.setQueryData(['hdwallet-sp-doc', eventId], next);
      }
      publishStorage.mutate({ next, spent });
    },
    [publishStorage, queryClient, pubkey, dTag],
  );

  // ── Manual reconcile of spent SP UTXOs against Blockbook ─────
  //
  // The send flow's prune (above) only catches UTXOs the *current* session
  // spends. Anything spent before this code shipped — or spent on another
  // device — sits in the encrypted NIP-78 doc forever, inflating the
  // displayed balance and offering already-spent inputs to the next send.
  //
  // This action lets the user manually walk the stored set, ask Blockbook
  // for each output's spent status, and drop the spent ones. Manual rather
  // than on-load because we don't want to fire ≤50 WS calls on every wallet
  // page mount; the scan dialog already exists as a "fix-up" UI surface.
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileProgress, setReconcileProgress] = useState<
    UseHdWalletSpResult['reconcileProgress']
  >();
  const [reconcileError, setReconcileError] = useState<Error | undefined>();
  const reconcileAbortRef = useRef<AbortController | null>(null);

  const reconcileSpentUtxos = useCallback<
    UseHdWalletSpResult['reconcileSpentUtxos']
  >(async () => {
    if (!enabled || !blockbookUrl) return 0;
    const current = storageRef.current;
    if (!current || current.utxos.length === 0) return 0;

    // Cap fan-out to MAX_RECONCILE_UTXOS distinct txids. We iterate the
    // stored UTXO list (insertion order) and keep candidates until we hit
    // the cap; remaining UTXOs are reconciled on the next click.
    const distinctTxids = new Set<string>();
    const candidates: Array<{ txid: string; vout: number }> = [];
    for (const u of current.utxos) {
      if (!distinctTxids.has(u.txid) && distinctTxids.size >= MAX_RECONCILE_UTXOS) {
        continue;
      }
      distinctTxids.add(u.txid);
      candidates.push({ txid: u.txid, vout: u.vout });
    }
    if (candidates.length === 0) return 0;

    // Abort any prior in-flight reconcile (e.g. user double-clicked).
    reconcileAbortRef.current?.abort();
    const controller = new AbortController();
    reconcileAbortRef.current = controller;

    setReconcileError(undefined);
    setIsReconciling(true);
    setReconcileProgress({ total: candidates.length, checked: 0, prunedSoFar: 0 });

    try {
      const spentMap = await fetchUtxoSpentStatus(
        blockbookUrl,
        candidates,
        controller.signal,
      );
      if (controller.signal.aborted) return 0;

      const spent: Array<{ txid: string; vout: number }> = [];
      for (const c of candidates) {
        if (spentMap.get(`${c.txid}:${c.vout}`) === true) spent.push(c);
      }
      setReconcileProgress({
        total: candidates.length,
        checked: candidates.length,
        prunedSoFar: spent.length,
      });

      if (spent.length > 0) {
        pruneSpentUtxos(spent);
      }
      return spent.length;
    } catch (err) {
      if (controller.signal.aborted) return 0;
      const e = err instanceof Error ? err : new Error(String(err));
      setReconcileError(e);
      throw e;
    } finally {
      setIsReconciling(false);
      if (reconcileAbortRef.current === controller) {
        reconcileAbortRef.current = null;
      }
    }
  }, [enabled, blockbookUrl, pruneSpentUtxos]);

  // ── Backfill missing block timestamps ────────────────────────
  //
  // Older docs (written before SP UTXOs carried `time`) and any UTXOs that
  // were stamped while Blockbook was unreachable arrive here without a
  // timestamp, so the UI is forced to use the synthetic
  // `block-height × 600s` estimate. That estimate drifts ~12 days into the
  // future at current heights and renders as e.g. "-11d ago".
  //
  // Fix it once per session: on the first storage load that contains any
  // un-stamped UTXOs, fetch their block timestamps from Blockbook,
  // de-duplicated by height, and re-publish the document.
  //
  // Bounded to avoid hammering Blockbook on a wallet with hundreds of
  // historical UTXOs — remaining entries get backfilled on subsequent
  // sessions.
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (!blockbookUrl) return;
    if (!storage) return;
    if (backfillRanRef.current) return;
    if (isScanning) return; // Don't race with an in-flight scan.

    const missing = storage.utxos.filter((u) => u.time === undefined);
    if (missing.length === 0) {
      backfillRanRef.current = true;
      return;
    }

    backfillRanRef.current = true;
    const controller = new AbortController();
    const MAX_HEIGHTS = 50;

    (async () => {
      const heights = Array.from(new Set(missing.map((u) => u.height))).slice(0, MAX_HEIGHTS);
      const heightTimes = new Map<number, number>();
      for (const h of heights) {
        if (controller.signal.aborted) return;
        try {
          const t = await fetchBlockTime(blockbookUrl, h, controller.signal);
          heightTimes.set(h, t);
        } catch (err) {
          // Skip this height; it will retry on a future session.
          console.warn(`Failed to backfill block time for height ${h}:`, err);
        }
      }
      if (heightTimes.size === 0) return;
      if (controller.signal.aborted) return;

      const next: SPStorageDocument = {
        version: SP_STORAGE_VERSION,
        scanHeight: storage.scanHeight,
        utxos: storage.utxos.map((u) => {
          if (u.time !== undefined) return u;
          const t = heightTimes.get(u.height);
          return t !== undefined ? { ...u, time: t } : u;
        }),
      };

      // Mirror the scan-loop pattern: update the optimistic copy and
      // republish so other devices pick up the backfilled timestamps.
      optimisticRef.current = next;
      setOptimisticVersion((v) => v + 1);
      publishStorage.mutate({ next });
    })();

    return () => controller.abort();
    // We deliberately depend only on `storage` and the static URLs — running
    // once per fresh load is the goal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, blockbookUrl, storage]);

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
    pruneSpentUtxos,
    isReconciling,
    reconcileProgress,
    reconcileError,
    reconcileSpentUtxos,
  };
}
