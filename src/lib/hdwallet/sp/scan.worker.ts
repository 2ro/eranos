/// <reference lib="webworker" />

// ---------------------------------------------------------------------------
// BIP-352 receiver-side ECDH scan — Web Worker
// ---------------------------------------------------------------------------
//
// Moves the CPU-bound part of the silent-payment scan (the secp256k1 ECDH +
// per-output `Pₖ` derivation in `scanBatch`) off the main thread. The
// orchestrator (`useHdWalletSp`) still owns fetching, the optimistic-doc
// merge, Blockbook timestamp lookups, and relay republishing — only the math
// kernel runs here.
//
// Why a worker:
//   - On the main thread the scan had to `setTimeout(0)` every 64 entries to
//     avoid freezing React renders + user input. In a worker the loop runs
//     uninterrupted at full speed and the UI thread stays free regardless.
//   - Fetching (main thread, I/O-bound) and ECDH (worker, CPU-bound) now
//     overlap: while the worker chews on block N's entries, the main thread's
//     sliding-window pipeline keeps fetching N+1…N+concurrency.
//
// Privacy: `bscan` is sent to the worker via `postMessage` (structured clone).
// A Web Worker runs in the same browser origin/sandbox as the page — this is
// NOT the "hand bscan to a remote scan helper" pattern BIP-352 contemplates;
// the key never leaves the device. It lives in the worker's memory for the
// page lifetime and is never transmitted anywhere.
//
// Lockdown Mode: Web Workers (unlike WebAssembly) are available in WKWebView
// and Safari even with Lockdown Mode enabled, and `@noble/curves` is pure JS,
// so this path works there. The client wrapper still falls back to a
// main-thread scan if the worker fails to construct for any reason.
// ---------------------------------------------------------------------------

import { scanBatch, type ScanTweakEntry, type SPMatchedUtxo } from './scanner';

/** Sent once, immediately after the worker is constructed, to load keys. */
interface InitMessage {
  type: 'init';
  bscan: Uint8Array;
  Bspend: Uint8Array;
}

/** A unit of scan work: one block's worth of tweak entries. */
interface ScanMessage {
  type: 'scan';
  /** Correlates the response to this request. */
  id: number;
  entries: ScanTweakEntry[];
}

type RequestMessage = InitMessage | ScanMessage;

/** Successful scan result for one request. */
interface ResultMessage {
  type: 'result';
  id: number;
  matches: SPMatchedUtxo[];
}

/** Scan failed for one request — the client falls back to a main-thread scan. */
interface ErrorMessage {
  type: 'error';
  id: number;
  message: string;
}

export type ScanWorkerResponse = ResultMessage | ErrorMessage;

let keys: { bscan: Uint8Array; Bspend: Uint8Array } | null = null;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<RequestMessage>) => {
  const msg = ev.data;

  if (msg.type === 'init') {
    keys = { bscan: msg.bscan, Bspend: msg.Bspend };
    return;
  }

  if (msg.type === 'scan') {
    if (!keys) {
      const err: ErrorMessage = {
        type: 'error',
        id: msg.id,
        message: 'scan worker received work before init',
      };
      ctx.postMessage(err);
      return;
    }

    // `scanBatch` is async only because of its main-thread yield hack; in the
    // worker there's nothing to yield to, but we keep the same call so the
    // math stays identical. A huge `yieldEvery` makes the internal
    // `setTimeout` effectively never fire within a single block.
    scanBatch(msg.entries, keys.bscan, keys.Bspend, { yieldEvery: Number.MAX_SAFE_INTEGER })
      .then((matches) => {
        const res: ResultMessage = { type: 'result', id: msg.id, matches };
        ctx.postMessage(res);
      })
      .catch((e: unknown) => {
        const err: ErrorMessage = {
          type: 'error',
          id: msg.id,
          message: e instanceof Error ? e.message : String(e),
        };
        ctx.postMessage(err);
      });
  }
};
