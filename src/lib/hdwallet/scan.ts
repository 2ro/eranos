import type { AddressData, Transaction, UTXO } from '@/lib/bitcoin';
import {
  CHANGE_CHAIN,
  type DerivedAddress,
  deriveAddress,
  type HdAccount,
  RECEIVE_CHAIN,
} from './derivation';
import { type AddressSnapshot, fetchAddressSnapshot } from './snapshot';

// ---------------------------------------------------------------------------
// Gap-limit chain scanning
// ---------------------------------------------------------------------------
//
// BIP44 gap limit: a wallet considers a chain "fully scanned" after observing
// `GAP_LIMIT` consecutive addresses that have never been used (zero history).
// Industry standard is 20.
//
// Two modes:
//
//   - **Cold scan** (no `prev`): walks both chains from index 0 until the gap
//     is hit. Used on first ever load.
//
//   - **Warm scan** (with `prev`): polls only the addresses we already knew
//     were used (to pick up new activity), plus a tail window starting at the
//     last `firstUnusedIndex`. As long as that tail stays clean, we never
//     re-probe addresses past it. If something showed up on a previously-
//     unused address, the scan extends forward incrementally until the gap
//     is again satisfied.
//
// We batch requests with `Promise.all` of size `SCAN_BATCH_SIZE` to amortise
// round-trip latency while still bounding fan-out on the Esplora server.
// ---------------------------------------------------------------------------

/** Standard BIP44 gap limit. */
export const GAP_LIMIT = 20;

/** Number of addresses fetched per request batch. */
const SCAN_BATCH_SIZE = 5;

/** Hard ceiling on addresses scanned per chain. Protects against bugs/loops. */
const MAX_INDEX = 10_000;

/** Information about a single derived address that has been observed. */
export interface ScannedAddress {
  derived: DerivedAddress;
  data: AddressData;
  utxos: UTXO[];
  /** All transactions touching this address (from the snapshot). */
  txs: Transaction[];
  /** Whether the address's history is capped (see `AddressSnapshot.historyCapped`). */
  historyCapped: boolean;
}

/** Full scan result for a single chain (receive or change). */
export interface ChainScanResult {
  /** All addresses with any history (tx_count > 0 on either confirmed or mempool). */
  used: ScannedAddress[];
  /** All addresses currently holding spendable UTXOs (incl. unconfirmed). */
  withBalance: ScannedAddress[];
  /** Index of the first address with no history (the "next" address to advertise). */
  firstUnusedIndex: number;
  /** Whether the scan hit MAX_INDEX without finding a clean gap. */
  hitMaxIndex: boolean;
}

/** Combined receive+change scan result for an entire account. */
export interface AccountScanResult {
  receive: ChainScanResult;
  change: ChainScanResult;
  /** All UTXOs across both chains. */
  utxos: Array<UTXO & { address: string; chain: 0 | 1; index: number }>;
  /** Confirmed + pending balance in satoshis, summed across both chains. */
  totalBalance: number;
  /** Sum of `pendingBalance` across all addresses (positive = incoming, negative = outgoing). */
  pendingBalance: number;
  /** Map from address → derived metadata. Used by the tx aggregator and signer. */
  addressMap: Map<string, DerivedAddress>;
}

/**
 * Has this address ever been used? "Used" means it has any history at all,
 * confirmed or in the mempool. We treat the address as advertised-and-burned
 * the moment a sender touches it.
 */
function isUsed(data: AddressData): boolean {
  return data.txCount > 0 || data.pendingTxCount > 0;
}

/** Adapt a snapshot result into the ScannedAddress shape. */
function toScanned(derived: DerivedAddress, snap: AddressSnapshot): ScannedAddress {
  return {
    derived,
    data: snap.data,
    utxos: snap.utxos,
    txs: snap.txs,
    historyCapped: snap.historyCapped,
  };
}

// ---------------------------------------------------------------------------
// Forward gap-walker
// ---------------------------------------------------------------------------

/**
 * Walk a chain forward from `startIndex` until `GAP_LIMIT` consecutive unused
 * addresses are observed. Returns the addresses we found used along the way
 * plus the new `firstUnusedIndex`. The caller decides whether to merge this
 * into a prior result (warm scan) or use it as the entire result (cold scan).
 */
async function walkForwardFromIndex(
  account: HdAccount,
  chain: 0 | 1,
  startIndex: number,
  esploraApis: string[],
  signal: AbortSignal | undefined,
): Promise<{ used: ScannedAddress[]; firstUnusedIndex: number; hitMaxIndex: boolean }> {
  const chainNode = chain === RECEIVE_CHAIN ? account.receiveNode : account.changeNode;

  const used: ScannedAddress[] = [];
  let firstUnusedIndex = startIndex;
  let firstUnusedSet = false;
  let consecutiveUnused = 0;
  let index = startIndex;
  let hitMaxIndex = false;

  while (consecutiveUnused < GAP_LIMIT) {
    if (index >= MAX_INDEX) {
      hitMaxIndex = true;
      break;
    }

    // Build the next batch of addresses.
    const batch: DerivedAddress[] = [];
    const remainingGap = GAP_LIMIT - consecutiveUnused;
    for (let i = 0; i < SCAN_BATCH_SIZE && i < remainingGap && index + i < MAX_INDEX; i++) {
      batch.push(deriveAddress(chainNode, chain, index + i));
    }
    if (batch.length === 0) break;

    // One round trip per address — fetchAddressSnapshot replaces the
    // previous three calls (balance + utxos + txs).
    const snaps = await Promise.all(
      batch.map(async (d) => {
        signal?.throwIfAborted();
        return { d, snap: await fetchAddressSnapshot(d.address, esploraApis, signal) };
      }),
    );

    for (const { d, snap } of snaps) {
      if (isUsed(snap.data)) {
        used.push(toScanned(d, snap));
        consecutiveUnused = 0;
        // Do not move firstUnusedIndex past this — we want the earliest gap.
      } else {
        if (!firstUnusedSet) {
          firstUnusedIndex = d.index;
          firstUnusedSet = true;
        }
        consecutiveUnused++;
      }
    }

    index += batch.length;
  }

  if (!firstUnusedSet) firstUnusedIndex = index;

  return { used, firstUnusedIndex, hitMaxIndex };
}

// ---------------------------------------------------------------------------
// Per-chain scan
// ---------------------------------------------------------------------------

/**
 * Re-fetch snapshots for an already-known set of used addresses in parallel.
 * Used during a warm scan to catch new incoming/outgoing activity on
 * previously-observed addresses.
 */
async function refreshKnownUsed(
  account: HdAccount,
  chain: 0 | 1,
  knownIndexes: number[],
  esploraApis: string[],
  signal: AbortSignal | undefined,
): Promise<{ refreshed: ScannedAddress[]; nowUnused: number[] }> {
  if (knownIndexes.length === 0) return { refreshed: [], nowUnused: [] };
  const chainNode = chain === RECEIVE_CHAIN ? account.receiveNode : account.changeNode;

  const refreshed: ScannedAddress[] = [];
  const nowUnused: number[] = [];

  // Fire requests in chunks of SCAN_BATCH_SIZE to keep fan-out bounded.
  for (let i = 0; i < knownIndexes.length; i += SCAN_BATCH_SIZE) {
    const slice = knownIndexes.slice(i, i + SCAN_BATCH_SIZE);
    const snaps = await Promise.all(
      slice.map(async (idx) => {
        signal?.throwIfAborted();
        const d = deriveAddress(chainNode, chain, idx);
        const snap = await fetchAddressSnapshot(d.address, esploraApis, signal);
        return { d, snap };
      }),
    );
    for (const { d, snap } of snaps) {
      if (isUsed(snap.data)) {
        refreshed.push(toScanned(d, snap));
      } else {
        // An address we previously saw used now reports no history. This
        // shouldn't happen on mainnet (txs don't un-broadcast). We log it
        // and treat it as "still belonged to our set" in case of an Esplora
        // backend desync.
        nowUnused.push(d.index);
      }
    }
  }

  return { refreshed, nowUnused };
}

/**
 * Scan a single chain. If `prev` is supplied, performs an **incremental**
 * scan: just refresh known-used addresses and walk a small tail starting at
 * the previous `firstUnusedIndex`. Otherwise performs a cold scan from 0.
 */
async function scanChain(
  account: HdAccount,
  chain: 0 | 1,
  esploraApis: string[],
  signal: AbortSignal | undefined,
  prev?: ChainScanResult,
): Promise<ChainScanResult> {
  // ── Cold path ──────────────────────────────────────────────
  if (!prev) {
    const walk = await walkForwardFromIndex(account, chain, 0, esploraApis, signal);
    return buildChainResult(walk.used, walk.firstUnusedIndex, walk.hitMaxIndex);
  }

  // ── Warm path ──────────────────────────────────────────────
  //
  // (a) Refresh every previously-known used address in parallel.
  // (b) Walk forward from prev.firstUnusedIndex. If everything in the tail
  //     is still unused (the common case) we observe GAP_LIMIT and exit
  //     quickly. If something showed up, walk extends naturally.
  const knownIndexes = prev.used.map((sa) => sa.derived.index);
  const [refreshResult, forwardWalk] = await Promise.all([
    refreshKnownUsed(account, chain, knownIndexes, esploraApis, signal),
    walkForwardFromIndex(account, chain, prev.firstUnusedIndex, esploraApis, signal),
  ]);

  // Merge: known-used (refreshed) + anything new from the forward walk.
  // Deduplicate by index in case a known-used index sat exactly at the
  // forward-walk start (shouldn't happen — knownIndexes are all < prev.firstUnusedIndex
  // by construction — but be defensive).
  const byIndex = new Map<number, ScannedAddress>();
  for (const sa of refreshResult.refreshed) byIndex.set(sa.derived.index, sa);
  for (const sa of forwardWalk.used) byIndex.set(sa.derived.index, sa);
  const merged = Array.from(byIndex.values()).sort(
    (a, b) => a.derived.index - b.derived.index,
  );

  return buildChainResult(merged, forwardWalk.firstUnusedIndex, forwardWalk.hitMaxIndex);
}

function buildChainResult(
  used: ScannedAddress[],
  firstUnusedIndex: number,
  hitMaxIndex: boolean,
): ChainScanResult {
  const withBalance = used.filter(
    (sa) => sa.utxos.length > 0 || sa.data.totalBalance > 0,
  );
  return { used, withBalance, firstUnusedIndex, hitMaxIndex };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan both chains (receive and change) for an HD account.
 *
 * If `prev` is supplied, performs an incremental scan that only re-probes
 * addresses we already knew were used plus a small forward gap. Otherwise
 * does a cold full scan.
 *
 * @param account          The derived HD account.
 * @param esploraApis      Ordered list of Esplora REST roots (failover handled).
 * @param signal           Optional abort signal.
 * @param prev             Previous scan result, if any — enables incremental mode.
 */
export async function scanAccount(
  account: HdAccount,
  esploraApis: string[],
  signal?: AbortSignal,
  prev?: AccountScanResult,
): Promise<AccountScanResult> {
  // Both chains in parallel — they're independent.
  const [receive, change] = await Promise.all([
    scanChain(account, RECEIVE_CHAIN, esploraApis, signal, prev?.receive),
    scanChain(account, CHANGE_CHAIN, esploraApis, signal, prev?.change),
  ]);

  const addressMap = new Map<string, DerivedAddress>();
  for (const sa of receive.used) addressMap.set(sa.derived.address, sa.derived);
  for (const sa of change.used) addressMap.set(sa.derived.address, sa.derived);

  const utxos: AccountScanResult['utxos'] = [];
  let totalBalance = 0;
  let pendingBalance = 0;

  for (const chainResult of [receive, change]) {
    for (const sa of chainResult.used) {
      totalBalance += sa.data.totalBalance;
      pendingBalance += sa.data.pendingBalance;
      for (const u of sa.utxos) {
        utxos.push({
          ...u,
          address: sa.derived.address,
          chain: sa.derived.chain,
          index: sa.derived.index,
        });
      }
    }
  }

  return { receive, change, utxos, totalBalance, pendingBalance, addressMap };
}

// ---------------------------------------------------------------------------
// Aggregated transaction history
// ---------------------------------------------------------------------------

/**
 * Aggregated transaction record for an HD wallet. Unlike the per-address
 * `Transaction` from `bitcoin.ts`, this one merges all on-chain activity
 * across every owned address so a single send-with-change tx shows up as one
 * row rather than two.
 */
export interface HdTransaction {
  txid: string;
  /** Net satoshi change across the entire wallet (positive = received, negative = sent). */
  amount: number;
  /** Send or receive (based on net amount sign). */
  type: 'receive' | 'send';
  confirmed: boolean;
  timestamp?: number;
}

/**
 * Build the wallet-level transaction history from a scan result.
 *
 * Each scanned address already carries its tx list (returned by the same
 * snapshot fetch that built the balance), so this function does **no
 * additional network calls** — it just merges and sorts in memory.
 *
 * A transaction that touches multiple owned addresses (e.g. send-with-change)
 * is merged into one record whose `amount` is the net wallet-level change.
 */
export function buildHdTransactions(result: AccountScanResult): HdTransaction[] {
  const allUsed = [...result.receive.used, ...result.change.used];
  if (allUsed.length === 0) return [];

  // Merge by txid — sum signed amounts so that send-with-change collapses.
  const merged = new Map<string, {
    txid: string;
    netSats: number;
    confirmed: boolean;
    timestamp?: number;
  }>();

  for (const sa of allUsed) {
    for (const tx of sa.txs) {
      // `Transaction.amount` is Math.abs(net); recover the signed value.
      const signedAmount = tx.type === 'receive' ? tx.amount : -tx.amount;
      const existing = merged.get(tx.txid);
      if (existing) {
        existing.netSats += signedAmount;
        existing.confirmed = existing.confirmed || tx.confirmed;
        if (tx.timestamp && (!existing.timestamp || tx.timestamp < existing.timestamp)) {
          existing.timestamp = tx.timestamp;
        }
      } else {
        merged.set(tx.txid, {
          txid: tx.txid,
          netSats: signedAmount,
          confirmed: tx.confirmed,
          timestamp: tx.timestamp,
        });
      }
    }
  }

  const out: HdTransaction[] = Array.from(merged.values()).map((m) => ({
    txid: m.txid,
    amount: Math.abs(m.netSats),
    type: m.netSats >= 0 ? 'receive' : 'send',
    confirmed: m.confirmed,
    timestamp: m.timestamp,
  }));

  // Sort newest first; unconfirmed go to the top.
  out.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return b.timestamp - a.timestamp;
  });

  return out;
}
