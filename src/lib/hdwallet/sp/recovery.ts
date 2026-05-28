import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { signSchnorr, taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';

import { BITCOIN_DUST_LIMIT, validateBitcoinAddress } from '@/lib/bitcoin';
import { bytesEqual, derivePkAtIndex, pointMultiplyCompressed } from './crypto';
import { deriveSilentPaymentSpendKey, deriveSpUtxoSigningKey } from './spend';
import { SECP_N } from './sender';
import type { ScanTweakEntry } from './scanner';

// ---------------------------------------------------------------------------
// Double-tweak silent-payment recovery
// ---------------------------------------------------------------------------
//
// A historical Agora bug encoded BIP-352 outputs through `btc.p2tr(P_k)`,
// which treats `P_k` as a Taproot *internal* key and applies the BIP-341
// TapTweak a second time. The on-chain output therefore landed at
//
//     Q = taproot_tweak(P_k)        instead of        P_k
//
// where `P_k = (b_spend + t_k)·G` is the real BIP-352 output key. The
// normal scanner derives `P_k` and never finds `Q`, so funds sent by the
// buggy build are invisible (and unspendable through the regular path).
//
// This module re-scans the chain for the *double-tweaked* key `Q`: for each
// indexer tweak it derives the candidate `P_k` (exactly like the receiver
// scanner) and then the once-more-tweaked `taproot_tweak(P_k)`, matching
// that against the block's on-chain output set. Matches can then be swept
// with `taprootTweakPrivKey(b_spend + t_k)` — the key-path secret for `Q`.
//
// The fix (commit history) means new sends are no longer affected; this
// recovery path exists solely to rescue funds stranded by the old build.
// ---------------------------------------------------------------------------

const { Point } = secp256k1;

/** A double-tweaked SP UTXO the recovery scan determined belongs to us. */
export interface DoubleTweakMatch {
  txid: string;
  vout: number;
  /** Output value in satoshis. */
  value: number;
  /** Block height at which the UTXO was mined. */
  height: number;
  /** Per-output BIP-352 tweak `t_k` (32 bytes) — needed to derive the spend key. */
  tweak: Uint8Array;
  /** Output index within the transaction's SP output set (k = 0, 1, …). */
  k: number;
  /**
   * The on-chain x-only output key `Q = taproot_tweak(P_k)` (32 bytes). Kept
   * so the sweep builder can reconstruct the exact scriptPubKey without
   * trusting an indexer.
   */
  outputXOnly: Uint8Array;
}

/**
 * Apply the BIP-341 key-path TapTweak to an x-only key, returning the
 * tweaked x-only output key. This mirrors what the buggy `btc.p2tr(P_k)`
 * did when it (incorrectly) treated `P_k` as an internal key.
 */
function taprootTweakXOnly(xonly: Uint8Array): Uint8Array {
  // `btc.p2tr(internalKey)` with no script tree produces `tweakedPubkey`,
  // the x-only output key. Reuse it rather than re-implementing the tweak.
  const pay = btc.p2tr(xonly, undefined, btc.NETWORK);
  return new Uint8Array(pay.tweakedPubkey);
}

/**
 * Scan one tweak entry's candidate outputs for double-tweaked SP UTXOs.
 *
 * Identical structure to the receiver scanner (`scanTransaction`), except
 * the on-chain key it matches against is `taproot_tweak(P_k)` rather than
 * `P_k`. Walks `k = 0, 1, …` until no output matches the current `k`.
 */
function scanEntryForDoubleTweak(
  entry: ScanTweakEntry,
  bscan: Uint8Array,
  Bspend: Uint8Array,
): DoubleTweakMatch[] {
  if (bscan.length !== 32) throw new Error('bscan must be 32 bytes');
  if (Bspend.length !== 33) throw new Error('Bspend must be 33-byte compressed');
  if (entry.tweak.length !== 33) throw new Error('entry.tweak must be 33-byte compressed');

  let shared: Uint8Array;
  try {
    shared = pointMultiplyCompressed(entry.tweak, bscan);
  } catch {
    return [];
  }

  if (entry.outputs.length === 0) return [];

  const remaining = new Set<number>(entry.outputs.map((_, i) => i));
  const matches: DoubleTweakMatch[] = [];

  let k = 0;
  while (remaining.size > 0) {
    const { xonlyPk, tweak: tk } = derivePkAtIndex(shared, Bspend, k);
    // The buggy build shipped `taproot_tweak(P_k)`, so that's what we hunt.
    let doubleTweaked: Uint8Array;
    try {
      doubleTweaked = taprootTweakXOnly(xonlyPk);
    } catch {
      break;
    }

    let matchedIdx: number | null = null;
    for (const i of remaining) {
      if (bytesEqual(entry.outputs[i].xonlyPk, doubleTweaked)) {
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
      outputXOnly: doubleTweaked,
    });
    remaining.delete(matchedIdx);
    k += 1;
  }

  return matches;
}

interface ScanDoubleTweakOptions {
  /** Yield to the event loop every N processed entries. Default: 64. */
  yieldEvery?: number;
  /** Called after each yield with the highest height fully processed. */
  onProgress?: (height: number) => void;
  /** Abort signal — when triggered, returns whatever it has so far. */
  signal?: AbortSignal;
}

/**
 * Walk a batch of tweak entries, scanning each for double-tweaked SP UTXOs.
 * Mirrors `scanBatch` (yields periodically, skips malformed entries).
 */
export async function scanForDoubleTweakedUtxos(
  entries: ReadonlyArray<ScanTweakEntry>,
  bscan: Uint8Array,
  Bspend: Uint8Array,
  opts: ScanDoubleTweakOptions = {},
): Promise<DoubleTweakMatch[]> {
  const yieldEvery = opts.yieldEvery ?? 64;
  const matches: DoubleTweakMatch[] = [];
  let lastReportedHeight = -1;
  let processedSinceYield = 0;

  for (const entry of entries) {
    if (opts.signal?.aborted) break;

    try {
      const hit = scanEntryForDoubleTweak(entry, bscan, Bspend);
      if (hit.length > 0) matches.push(...hit);
    } catch {
      // Malformed entry — skip rather than abort the whole batch.
    }

    if (entry.height > lastReportedHeight) lastReportedHeight = entry.height;

    processedSinceYield += 1;
    if (processedSinceYield >= yieldEvery) {
      processedSinceYield = 0;
      opts.onProgress?.(lastReportedHeight);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (lastReportedHeight >= 0) opts.onProgress?.(lastReportedHeight);
  return matches;
}

// ---------------------------------------------------------------------------
// Sweep construction for recovered (double-tweaked) UTXOs
// ---------------------------------------------------------------------------

/** Arguments for {@link buildDoubleTweakSweepPsbt}. */
export interface BuildDoubleTweakSweepArgs {
  /** Recovered UTXOs to drain (output of {@link scanForDoubleTweakedUtxos}). */
  matches: ReadonlyArray<DoubleTweakMatch>;
  /** Destination bech32(m) address. Receives `total - fee` sats. */
  destination: string;
  /** Fee rate in sat/vB. */
  feeRate: number;
}

/** Result of {@link buildDoubleTweakSweepPsbt}. */
export interface DoubleTweakSweepPsbt {
  /** Hex-encoded unsigned PSBT, ready for {@link signDoubleTweakSweep}. */
  psbtHex: string;
  fee: number;
  amountSats: number;
  totalInput: number;
}

/** vBytes estimate: 1-input P2TR key-path spend ≈ 57.5 vB; +43 vB per output. */
function estimateSweepFee(numInputs: number, feeRate: number): number {
  const vbytes = 10.5 + numInputs * 57.5 + 43;
  return Math.ceil(vbytes * feeRate);
}

/**
 * Build a single-output PSBT draining every recovered double-tweaked UTXO
 * into `destination`. The inputs' on-chain key is `Q = taproot_tweak(P_k)`,
 * so the scriptPubKey is `OP_1 push32 <Q>`. Signing (in
 * {@link signDoubleTweakSweep}) uses `taprootTweakPrivKey(b_spend + t_k)`.
 */
export function buildDoubleTweakSweepPsbt(
  args: BuildDoubleTweakSweepArgs,
): DoubleTweakSweepPsbt {
  const { matches, destination, feeRate } = args;

  if (!matches.length) throw new Error('Recovery sweep requires at least one input.');
  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error('Fee rate must be positive.');
  }
  if (!validateBitcoinAddress(destination)) {
    throw new Error(`Invalid destination address: ${destination}`);
  }

  // Deduplicate by (txid, vout).
  const seen = new Set<string>();
  const dedup: DoubleTweakMatch[] = [];
  for (const m of matches) {
    const id = `${m.txid}:${m.vout}`;
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(m);
  }

  const totalInput = dedup.reduce((s, m) => s + m.value, 0);
  const fee = estimateSweepFee(dedup.length, feeRate);
  const amountSats = totalInput - fee;
  if (amountSats < BITCOIN_DUST_LIMIT) {
    throw new Error(
      `Recovery sweep amount (${amountSats}) below dust limit after fee. ` +
        `Total: ${totalInput}, fee: ${fee}.`,
    );
  }

  const tx = new btc.Transaction();
  for (const m of dedup) {
    if (m.outputXOnly.length !== 32) {
      throw new Error('Recovered UTXO output key must be 32 bytes.');
    }
    const script = new Uint8Array(34);
    script[0] = 0x51; // OP_1
    script[1] = 0x20; // push 32
    script.set(m.outputXOnly, 2);
    tx.addInput({
      txid: m.txid,
      index: m.vout,
      witnessUtxo: { script, amount: BigInt(m.value) },
    });
  }
  tx.addOutputAddress(destination, BigInt(amountSats), btc.NETWORK);

  return {
    psbtHex: hex.encode(tx.toPSBT()),
    fee,
    amountSats,
    totalInput,
  };
}

function psbtFromHex(psbtHex: string): btc.Transaction {
  return btc.Transaction.fromPSBT(hex.decode(psbtHex));
}

/**
 * Sign every input of a double-tweak recovery sweep and return the raw
 * broadcast-ready transaction hex.
 *
 * Each input is a key-path P2TR spend of `Q = taproot_tweak(P_k)`. The
 * signing scalar is `taprootTweakPrivKey(d_k)` where `d_k = b_spend + t_k`.
 * BIP-340 parity is handled here (negate if `signingKey·G` is odd-Y), the
 * same way {@link signSpUtxoInput} does.
 */
export function signDoubleTweakSweep(
  psbtHex: string,
  matches: ReadonlyArray<DoubleTweakMatch>,
  seed: Uint8Array,
): string {
  const tx = psbtFromHex(psbtHex);

  // Dedup must match `buildDoubleTweakSweepPsbt` so descriptors align 1:1.
  const seen = new Set<string>();
  const dedup: DoubleTweakMatch[] = [];
  for (const m of matches) {
    const id = `${m.txid}:${m.vout}`;
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(m);
  }
  if (tx.inputsLength !== dedup.length) {
    throw new Error(
      `PSBT input count (${tx.inputsLength}) does not match matches (${dedup.length}).`,
    );
  }

  const prevOutScripts: Uint8Array[] = [];
  const prevOutAmounts: bigint[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    if (!inp.witnessUtxo) throw new Error(`PSBT input ${i} missing witnessUtxo`);
    prevOutScripts.push(inp.witnessUtxo.script);
    prevOutAmounts.push(inp.witnessUtxo.amount);
  }

  const bSpend = deriveSilentPaymentSpendKey(seed);
  try {
    for (let i = 0; i < tx.inputsLength; i++) {
      const m = dedup[i];
      // d_k = b_spend + t_k (the key for P_k), then apply the BIP-341
      // TapTweak once more to get the key for Q = taproot_tweak(P_k).
      const dk = deriveSpUtxoSigningKey(bSpend, m.tweak);
      const qKey = new Uint8Array(taprootTweakPrivKey(dk));
      dk.fill(0);
      try {
        signQKeyInput(tx, i, qKey, prevOutScripts, prevOutAmounts);
      } finally {
        qKey.fill(0);
      }
    }
  } finally {
    bSpend.fill(0);
  }

  tx.finalize();
  return hex.encode(tx.extract());
}

/**
 * Sign a single key-path P2TR input with `signingKey`, applying BIP-340
 * odd-Y parity adjustment, and write the result into `tapKeySig`. Mirrors
 * `signSpUtxoInput` but lives here so recovery doesn't depend on the SP
 * spend module's input wiring.
 */
function signQKeyInput(
  tx: btc.Transaction,
  inputIndex: number,
  signingKey: Uint8Array,
  prevOutScripts: Uint8Array[],
  prevOutAmounts: bigint[],
): void {
  let scalar = bytesToNumberBE(signingKey);
  if (scalar === 0n || scalar >= SECP_N) {
    throw new Error('Recovery signing key out of range');
  }
  const pub = Point.BASE.multiply(scalar).toBytes(true);
  if (pub[0] === 0x03) {
    scalar = SECP_N - scalar;
  }
  const adjusted = numberToBytesBE(scalar, 32);
  try {
    const hash = tx.preimageWitnessV1(inputIndex, prevOutScripts, 0x00, prevOutAmounts);
    const sig = new Uint8Array(signSchnorr(hash, adjusted));
    tx.updateInput(inputIndex, { tapKeySig: sig }, true);
  } finally {
    adjusted.fill(0);
  }
}
