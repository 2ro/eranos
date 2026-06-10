// ---------------------------------------------------------------------------
// BIP-352 scan-worker client
// ---------------------------------------------------------------------------
//
// Main-thread wrapper around `scan.worker.ts`. Exposes a `scanEntries(entries)`
// method that resolves with the matched UTXOs for one block, running the ECDH
// in the worker so the UI thread stays free.
//
// Graceful degradation: if the worker can't be constructed (no `Worker`
// global, CSP blocks the blob, an environment that doesn't support module
// workers, etc.) or a scan message errors, the client transparently falls
// back to running `scanBatch` on the main thread. Callers get the same result
// either way — only the thread it ran on differs.
// ---------------------------------------------------------------------------

import { scanBatch, type ScanTweakEntry, type SPMatchedUtxo } from './scanner';
import type { ScanWorkerResponse } from './scan.worker';

export interface SpScanWorkerClient {
  /** Scan one block's tweak entries, returning matched UTXOs. */
  scanEntries(entries: ScanTweakEntry[]): Promise<SPMatchedUtxo[]>;
  /** Tear down the worker and reject any in-flight requests. */
  terminate(): void;
}

interface Pending {
  resolve: (matches: SPMatchedUtxo[]) => void;
  reject: (err: Error) => void;
  /** Kept so a worker-level failure can re-run the scan on the main thread. */
  entries: ScanTweakEntry[];
}

/**
 * Construct a scan-worker client for the given SP keys, or `null` if a worker
 * can't be created in this environment. A `null` return is the caller's signal
 * to scan on the main thread (the previous behaviour).
 */
export function createSpScanWorker(
  bscan: Uint8Array,
  Bspend: Uint8Array,
): SpScanWorkerClient | null {
  if (typeof Worker === 'undefined') return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./scan.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    // Worker construction blocked (CSP, unsupported module workers, …).
    return null;
  }

  const pending = new Map<number, Pending>();
  let nextId = 1;
  let dead = false;

  // Run a scan on the main thread — used as the fallback when the worker
  // errors on a specific block, and after the worker has been declared dead.
  const fallbackScan = (entries: ScanTweakEntry[]): Promise<SPMatchedUtxo[]> =>
    scanBatch(entries, bscan, Bspend);

  const failAllToFallback = () => {
    dead = true;
    for (const [, p] of pending) {
      // Re-run each in-flight request on the main thread so callers still
      // get a correct answer rather than a rejection.
      fallbackScan(p.entries).then(p.resolve, p.reject);
    }
    pending.clear();
  };

  worker.onmessage = (ev: MessageEvent<ScanWorkerResponse>) => {
    const msg = ev.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);

    if (msg.type === 'result') {
      p.resolve(msg.matches);
    } else {
      // Worker-reported error for this block — fall back to a main-thread scan
      // rather than failing the whole scan.
      fallbackScan(p.entries).then(p.resolve, p.reject);
    }
  };

  worker.onerror = () => {
    // The worker itself crashed — drain everything to the main-thread path.
    failAllToFallback();
  };

  // Load keys into the worker before any scan messages.
  worker.postMessage({ type: 'init', bscan, Bspend });

  return {
    scanEntries(entries: ScanTweakEntry[]): Promise<SPMatchedUtxo[]> {
      if (dead) return fallbackScan(entries);
      const id = nextId++;
      return new Promise<SPMatchedUtxo[]>((resolve, reject) => {
        pending.set(id, { resolve, reject, entries });
        try {
          worker.postMessage({ type: 'scan', id, entries });
        } catch (e) {
          pending.delete(id);
          // postMessage can throw (e.g. non-cloneable payload — shouldn't
          // happen with Uint8Arrays, but be safe) — fall back.
          fallbackScan(entries).then(resolve, reject);
          void e;
        }
      });
    },
    terminate() {
      dead = true;
      try {
        worker.terminate();
      } catch {
        // ignore
      }
      // Reject any stragglers so awaiting callers don't hang forever.
      for (const [, p] of pending) {
        p.reject(new Error('scan worker terminated'));
      }
      pending.clear();
    },
  };
}
