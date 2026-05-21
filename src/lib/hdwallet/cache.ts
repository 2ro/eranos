import type { AccountScanResult, ChainScanResult } from './scan';

// ---------------------------------------------------------------------------
// Persisted scan skeleton
// ---------------------------------------------------------------------------
//
// We never persist the full ScannedAddress[] — that would grow with tx
// history and blow up localStorage. Instead we persist the minimum needed to
// rehydrate an incremental scan:
//
//   - The next-unused index for each chain.
//   - The set of indexes we already know are used.
//
// Given those, `scanAccount(account, esploraApis, signal, prev)` can refresh
// just the known-used addresses and confirm the gap past firstUnusedIndex.
// All the rich per-address data (balance, UTXOs, txs) is repopulated by the
// scan itself — no round trip wasted.
//
// Schema is versioned so future shape changes invalidate the old cache
// instead of crashing the loader.
// ---------------------------------------------------------------------------

/** Schema version. Bump whenever the shape changes. */
const SCHEMA_VERSION = 1;

/** Minimum scan state for a single chain. */
export interface PersistedChainScan {
  /** Sorted, deduplicated indexes of every used address on this chain. */
  usedIndexes: number[];
  /** First-unused index on this chain, used as the warm-scan start. */
  firstUnusedIndex: number;
}

/** Minimum scan state for an entire account (both chains). */
export interface PersistedScan {
  version: number;
  receive: PersistedChainScan;
  change: PersistedChainScan;
}

/** Returns localStorage / Keychain key for the given user pubkey. */
export function scanCacheKey(pubkey: string): string {
  return `hdwallet:scan:${pubkey}`;
}

/** Reduce a `ChainScanResult` to its persisted skeleton. */
function chainResultToPersisted(r: ChainScanResult): PersistedChainScan {
  return {
    usedIndexes: r.used.map((sa) => sa.derived.index).sort((a, b) => a - b),
    firstUnusedIndex: r.firstUnusedIndex,
  };
}

/** Reduce a full `AccountScanResult` to its persisted skeleton. */
export function toPersistedScan(result: AccountScanResult): PersistedScan {
  return {
    version: SCHEMA_VERSION,
    receive: chainResultToPersisted(result.receive),
    change: chainResultToPersisted(result.change),
  };
}

/**
 * Convert a persisted skeleton into a sparse `AccountScanResult` suitable to
 * pass back into `scanAccount(..., prev)`. The returned object carries the
 * `firstUnusedIndex` and a `used` list with **stub** scanned-address entries
 * (only `derived.index` is meaningful — the scan code only reads
 * `prev.receive.used.map(sa => sa.derived.index)` and `prev.*.firstUnusedIndex`,
 * never the rest).
 *
 * The stub shape keeps the type signature aligned with `AccountScanResult`
 * without forcing callers to thread a separate "skeleton" type into the scan
 * function.
 */
export function fromPersistedScan(p: PersistedScan): AccountScanResult | undefined {
  if (p.version !== SCHEMA_VERSION) return undefined;

  const stubChain = (c: PersistedChainScan, chain: 0 | 1): ChainScanResult => ({
    used: c.usedIndexes.map((idx) => ({
      // Minimal stub — only the index is needed by the warm-scan path.
      derived: {
        address: '',
        internalPubkeyHex: '',
        chain,
        index: idx,
        path: '',
      },
      data: {
        balance: 0,
        pendingBalance: 0,
        totalBalance: 0,
        totalReceived: 0,
        totalSent: 0,
        txCount: 0,
        pendingTxCount: 0,
      },
      utxos: [],
      txs: [],
      historyCapped: false,
    })),
    withBalance: [],
    firstUnusedIndex: c.firstUnusedIndex,
    hitMaxIndex: false,
  });

  return {
    receive: stubChain(p.receive, 0),
    change: stubChain(p.change, 1),
    utxos: [],
    totalBalance: 0,
    pendingBalance: 0,
    addressMap: new Map(),
  };
}
