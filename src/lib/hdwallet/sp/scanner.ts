import { bytesEqual, derivePkAtIndex, pointMultiplyCompressed } from './crypto';

// ---------------------------------------------------------------------------
// BIP-352 receiver-side per-transaction scanner
// ---------------------------------------------------------------------------
//
// Consumes per-transaction "tweak data" from an external indexer (see
// `indexer.ts`) and checks each tweak against the wallet's `bscan` / `Bspend`.
// The tweak is the public per-tx point `serP(input_hash · A)` — the indexer
// pre-computes everything that depends only on the transaction's eligible
// inputs, so the wallet completes the ECDH locally with `bscan`. `bscan` MUST
// NEVER leave the device.
//
// This module is pure math: no fetching, no React, no signers, no labels.
// Inputs in, matched UTXOs out. The orchestrator (`useHdWalletSp`) is
// responsible for fetching tweak data, persisting matches, and yielding to
// the UI.
//
// Label support is deliberately omitted: the receive-only wallet never
// produces labeled change (because it never spends), and we don't hand out
// labeled receive addresses. BIP-352's "every receiving wallet should scan
// for the change label" rule only applies to wallets that may have spent
// their own SP UTXOs — when spend support arrives we'll need to add label
// derivation back in.
// ---------------------------------------------------------------------------

/**
 * One unit of scanner work: a public tweak plus the set of candidate Taproot
 * outputs it may have produced.
 *
 * Each output carries its own txid because BlindBit's `GET /tweaks/:height`
 * endpoint does not return a tweak ↔ txid mapping — the wallet pairs every
 * tweak in a block against the block's full SP-eligible UTXO set and lets
 * the BIP-352 math pick the right output.
 */
export interface ScanTweakEntry {
  /** Block height the tweak (and its candidate outputs) belongs to. */
  height: number;
  /** Per-tx public tweak: 33-byte compressed `input_hash · A`. */
  tweak: Uint8Array;
  /**
   * Candidate Taproot outputs. Each output carries its txid so the matched
   * UTXO can be attributed correctly even when the indexer pools outputs
   * from multiple txs against the same tweak.
   *
   * `spent` is the indexer's view of whether the output has been consumed
   * by a later transaction. Default scans ignore spent outputs entirely
   * (the orchestrator filters them out before they reach here). When the
   * caller opts into recovering history, spent outputs are included and
   * the orchestrator routes their matches into the spent archive instead
   * of the active set.
   */
  outputs: ReadonlyArray<{
    txid: string;
    vout: number;
    xonlyPk: Uint8Array;
    value: number;
    spent?: boolean;
  }>;
}

/** A UTXO the scanner determined belongs to us. */
export interface SPMatchedUtxo {
  txid: string;
  vout: number;
  /** Output value in satoshis. */
  value: number;
  /** Block height at which the UTXO was mined. */
  height: number;
  /** Per-output BIP-352 tweak `tₖ` (32 bytes). Needed at spend time. */
  tweak: Uint8Array;
  /** Output index within the transaction's SP output set (k = 0, 1, …). */
  k: number;
  /**
   * True if the matching candidate output was marked spent by the indexer
   * at scan time. The orchestrator uses this to route the match into the
   * archive instead of the active set — preserves history (for the tx
   * list) without offering a spent UTXO to the coin selector.
   */
  spent?: boolean;
}

/**
 * Check one tweak entry's outputs against the user's SP keys and return every
 * matching UTXO. Per BIP-352 the receiver iterates `k = 0, 1, …` until no
 * output matches the current `k`; we track which outputs have already been
 * claimed so each output matches at most one `k`.
 *
 * Never throws on malformed inputs at the wire level — the orchestrator
 * upstream is responsible for that. The only inputs validated here are the
 * key/tweak lengths (anything else is a programmer error).
 */
function scanTransaction(
  entry: ScanTweakEntry,
  bscan: Uint8Array,
  Bspend: Uint8Array,
): SPMatchedUtxo[] {
  if (bscan.length !== 32) throw new Error('bscan must be 32 bytes');
  if (Bspend.length !== 33) throw new Error('Bspend must be 33-byte compressed');
  if (entry.tweak.length !== 33) throw new Error('entry.tweak must be 33-byte compressed');

  // shared = bscan · tweak  ==  bscan · (input_hash · A)  ==  input_hash · a · Bscan
  // — the same shared secret the sender computed.
  let shared: Uint8Array;
  try {
    shared = pointMultiplyCompressed(entry.tweak, bscan);
  } catch {
    return [];
  }

  if (entry.outputs.length === 0) return [];

  const remaining = new Set<number>(entry.outputs.map((_, i) => i));
  const matches: SPMatchedUtxo[] = [];
  const sharedBytes = shared;

  let k = 0;
  while (remaining.size > 0) {
    const { xonlyPk, tweak: tk } = derivePkAtIndex(sharedBytes, Bspend, k);

    let matchedIdx: number | null = null;
    for (const i of remaining) {
      if (bytesEqual(entry.outputs[i].xonlyPk, xonlyPk)) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx === null) break;

    const o = entry.outputs[matchedIdx];
    matches.push({
      txid: o.txid,
      vout: o.vout,
      value: o.value,
      height: entry.height,
      tweak: tk,
      k,
      ...(o.spent ? { spent: true } : {}),
    });
    remaining.delete(matchedIdx);
    k += 1;
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Batch orchestration
// ---------------------------------------------------------------------------

interface ScanBatchOptions {
  /** Yield to the event loop every N processed entries. Default: 64. */
  yieldEvery?: number;
  /** Called after each yield with the highest height fully processed. */
  onProgress?: (height: number) => void;
  /** Abort signal — when triggered, the scanner returns whatever it has so far. */
  signal?: AbortSignal;
}

/**
 * Walk a batch of tweak entries, scanning each against the user's SP keys.
 * Yields to the event loop periodically so a long scan doesn't freeze the UI.
 *
 * Entries SHOULD be sorted by (height, position) so `onProgress` reports
 * monotonic heights. Malformed entries are skipped silently — one bad tweak
 * shouldn't sink an otherwise-good scan window.
 */
export async function scanBatch(
  entries: ReadonlyArray<ScanTweakEntry>,
  bscan: Uint8Array,
  Bspend: Uint8Array,
  opts: ScanBatchOptions = {},
): Promise<SPMatchedUtxo[]> {
  const yieldEvery = opts.yieldEvery ?? 64;
  const matches: SPMatchedUtxo[] = [];
  let lastReportedHeight = -1;
  let processedSinceYield = 0;

  for (const entry of entries) {
    if (opts.signal?.aborted) break;

    try {
      const hit = scanTransaction(entry, bscan, Bspend);
      if (hit.length > 0) matches.push(...hit);
    } catch {
      // Malformed entry — skip rather than abort the whole batch.
    }

    if (entry.height > lastReportedHeight) {
      lastReportedHeight = entry.height;
    }

    processedSinceYield += 1;
    if (processedSinceYield >= yieldEvery) {
      processedSinceYield = 0;
      opts.onProgress?.(lastReportedHeight);
      // Yield to the macrotask queue so React renders + user input can run.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (lastReportedHeight >= 0) {
    opts.onProgress?.(lastReportedHeight);
  }

  return matches;
}
