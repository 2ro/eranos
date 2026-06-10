// ---------------------------------------------------------------------------
// BIP-352 block-data cache (IndexedDB)
// ---------------------------------------------------------------------------
//
// Caches per-block tweak + UTXO data from the BlindBit Oracle so that:
//
//   1. Re-scanning a range already covered (e.g. "Last hour" → "Last 24h"
//      the same day) costs zero network round-trips for blocks already seen.
//   2. The "include spent" rescan path is free once a block was fetched with
//      `includeSpent = true` — a superset of the non-spent data.
//
// Safety:
//   - Blocks below the indexer tip are immutable; once mined their tweak +
//     UTXO data never changes.  Caching them forever is correct.
//   - Cache entries are keyed by `(indexerUrl, height)` so switching indexers
//     doesn't serve stale data from a different server.
//   - We only cache blocks whose `includeSpent` flag matches or is a superset
//     of the caller's flag (see `fetchBlockEntriesCached`).
//
// The cache degrades gracefully: any IDB error (quota, private-browsing
// restriction, Lockdown Mode — though IDB works fine there) logs a warning
// and falls through to the network path. The caller never sees an error from
// the cache layer.
// ---------------------------------------------------------------------------

import { fetchBlockEntries } from './indexer';
import type { ScanTweakEntry } from './scanner';

// ---------------------------------------------------------------------------
// IDB plumbing
// ---------------------------------------------------------------------------

const DB_NAME = 'agora-sp-block-cache';
const DB_VERSION = 1;
const STORE_NAME = 'blocks';

/**
 * Stored shape. `includeSpent` is recorded so we know whether the cached
 * rows cover spent outputs (a superset of the unspent-only data).
 */
interface CachedBlock {
  /** `${indexerUrl}|${height}` — IDB primary key. */
  key: string;
  indexerUrl: string;
  height: number;
  /** Whether the cached data includes rows marked as spent. */
  includeSpent: boolean;
  /** The resolved `ScanTweakEntry[]` — serialised via structured clone. */
  entries: ScanTweakEntry[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // If the promise rejects (IDB unavailable / blocked) reset so a future
  // call retries rather than getting the same rejected promise forever.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function cacheGet(
  db: IDBDatabase,
  key: string,
): Promise<CachedBlock | undefined> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as CachedBlock | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function cachePut(db: IDBDatabase, row: CachedBlock): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(row);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // best-effort
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the `ScanTweakEntry[]` for a single block, serving from cache when
 * available and writing network results back to cache.
 *
 * Drop-in replacement for `fetchBlockEntries` — same signature, same return
 * type, same error semantics for network failures. Cache misses and IDB
 * errors are transparent to the caller.
 */
export async function fetchBlockEntriesCached(
  baseUrl: string,
  height: number,
  signal?: AbortSignal,
  includeSpent = false,
): Promise<ScanTweakEntry[]> {
  // Normalise the base URL so trailing slashes don't produce duplicate keys.
  const normUrl = baseUrl.replace(/\/+$/, '');
  const key = `${normUrl}|${height}`;

  // Try the cache first.
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const cached = await cacheGet(db, key);
    if (cached) {
      // A hit is valid when:
      //   - The caller wants unspent-only data  AND  the cache has anything
      //     (even a non-spent fetch covers unspent outputs).
      //   - The caller wants includeSpent data  AND  the cache was populated
      //     with includeSpent = true (superset).
      if (!includeSpent || cached.includeSpent) {
        return cached.entries;
      }
      // Cached data is unspent-only but caller needs includeSpent — fall
      // through to network and overwrite with the richer response.
    }
  } catch {
    // IDB error — fall through to network.
  }

  // Network fetch.
  const entries = await fetchBlockEntries(normUrl, height, signal, includeSpent);

  // Write to cache (best-effort — don't await in the hot path).
  if (db) {
    const row: CachedBlock = {
      key,
      indexerUrl: normUrl,
      height,
      includeSpent,
      entries,
    };
    cachePut(db, row).catch(() => {});
  }

  return entries;
}
