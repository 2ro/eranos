import type { AddressData, Transaction, UTXO } from '@/lib/bitcoin';
import {
  accountToBip86Descriptor,
  CHANGE_CHAIN,
  type DerivedAddress,
  deriveAddress,
  type HdAccount,
  RECEIVE_CHAIN,
} from './derivation';
import {
  type BlockbookTx,
  type BlockbookUtxo,
  type BlockbookXpubAddress,
  type BlockbookXpubResponse,
  fetchXpubSnapshot,
  fetchXpubUtxos,
} from './blockbook';
import type { HdSpendableUtxo } from './transaction';

// ---------------------------------------------------------------------------
// HD wallet scan — Blockbook backend
// ---------------------------------------------------------------------------
//
// Blockbook indexes the entire xpub server-side, so what was a multi-call
// gap-limit walk + per-address polling collapses to a single HTTP call:
//
//     GET /api/v2/xpub/<tr(xpub)>?details=txs&tokens=used
//
// The response carries:
//   - account-level balance (confirmed + mempool)
//   - a `tokens` array of used derived addresses, each with its BIP32 path
//   - a `transactions` array (newest first) for the entire wallet
//
// We translate that into the existing `AccountScanResult` shape so the rest
// of the wallet code (UTXO selector, signer, page UI) doesn't need to know
// where the data came from.
//
// UTXOs are fetched as a second call to `/api/v2/utxo/<descriptor>` because
// Blockbook only inlines them in the xpub response when `details=tokenBalances`
// is set with a specific tokens parameter, and even then they're per-address
// rather than the flat list our coin selector wants. Two HTTP calls total
// per refresh — still a huge improvement over the previous ~50+.
// ---------------------------------------------------------------------------

/** A scanned address with everything the UI / coin selector needs. */
export interface ScannedAddress {
  derived: DerivedAddress;
  data: AddressData;
  utxos: UTXO[];
  /** All transactions touching this address. */
  txs: Transaction[];
}

/** Per-chain scan result. */
export interface ChainScanResult {
  /** Used addresses on this chain (path index ascending). */
  used: ScannedAddress[];
  /** Subset of `used` with non-zero balance or active UTXOs. */
  withBalance: ScannedAddress[];
  /** Index of the first never-used address. */
  firstUnusedIndex: number;
}

/** Combined receive + change scan result. */
export interface AccountScanResult {
  receive: ChainScanResult;
  change: ChainScanResult;
  /** Flat UTXO list across both chains, annotated for the signer. */
  utxos: HdSpendableUtxo[];
  /** Confirmed + mempool balance in sats. */
  totalBalance: number;
  /** Mempool delta in sats (positive = incoming, negative = outgoing). */
  pendingBalance: number;
  /** Map from derived address → metadata. */
  addressMap: Map<string, DerivedAddress>;
}

/** Aggregated wallet-level transaction row. */
export interface HdTransaction {
  txid: string;
  /** Net wallet-level satoshi change, absolute. */
  amount: number;
  type: 'receive' | 'send';
  confirmed: boolean;
  timestamp?: number;
  /**
   * Which scan path discovered this transaction. Used by the UI to render a
   * "silent payment" indicator on SP receives. `'bip86'` covers both receive
   * and change addresses on the BIP-86 chains; `'silent-payment'` covers
   * UTXOs detected by the BIP-352 scanner. Optional for back-compat with
   * persisted UI state that pre-dates the field.
   */
  source?: 'bip86' | 'silent-payment';
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

/**
 * Parse a BIP32 path like `m/86'/0'/0'/0/3` and return the trailing
 * `chain`/`index` pair. Returns `null` for any path we don't recognise.
 *
 * Blockbook may return paths in either fully-prefixed or shortened form
 * depending on whether we passed an xpub or a descriptor. We only need
 * the final two components to identify a leaf.
 */
function parseChainIndex(path: string): { chain: 0 | 1; index: number } | null {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const chainStr = parts[parts.length - 2];
  const indexStr = parts[parts.length - 1];
  const chain = Number(chainStr);
  const index = Number(indexStr);
  if (chain !== 0 && chain !== 1) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  return { chain: chain as 0 | 1, index };
}

// ---------------------------------------------------------------------------
// Translation: Blockbook → our types
// ---------------------------------------------------------------------------

/**
 * Convert a single Blockbook `tokens[]` entry into a `ScannedAddress` stub.
 *
 * The transactions list lives at the top level of the xpub response and is
 * stitched in by `bucketTransactionsByAddress` below — at this stage we just
 * carry the per-address stats.
 */
function tokenToScannedAddress(
  account: HdAccount,
  token: BlockbookXpubAddress,
): ScannedAddress | null {
  const ci = parseChainIndex(token.path);
  if (!ci) return null;

  // Always re-derive the address locally rather than trusting the server.
  // If Blockbook were compromised it could otherwise feed us an address it
  // controls; the local derivation is the trust root.
  const chainNode = ci.chain === CHANGE_CHAIN ? account.changeNode : account.receiveNode;
  const derived = deriveAddress(chainNode, ci.chain, ci.index);
  if (derived.address !== token.name) {
    // Server-derived address doesn't match what our xpub produces — refuse
    // to use this row. (Almost certainly a misconfigured backend or a bug;
    // never trust an unverified address derived elsewhere.)
    console.warn(
      `Blockbook returned mismatched address for path ${token.path}: ` +
        `expected ${derived.address}, got ${token.name}`,
    );
    return null;
  }

  const confirmed = Number(token.balance);
  // Blockbook doesn't break out mempool balance per token (only on the
  // account-level response). We treat the per-address pending balance as 0
  // here; the account-level `unconfirmedBalance` is what shows in the UI.
  const totalReceived = Number(token.totalReceived);
  const totalSent = Number(token.totalSent);

  const data: AddressData = {
    balance: confirmed,
    pendingBalance: 0,
    totalBalance: confirmed,
    totalReceived,
    totalSent,
    txCount: token.transfers,
    pendingTxCount: 0,
  };

  return { derived, data, utxos: [], txs: [] };
}

/**
 * Convert a Blockbook tx row into a simplified per-address `Transaction`.
 *
 * `address` is the address whose tx-list view we're computing. The net
 * effect is "sats received by `address` minus sats sent by `address`".
 */
function blockbookTxToPerAddress(tx: BlockbookTx, address: string): Transaction {
  let totalOut = 0; // sats this address received
  let totalIn = 0; // sats this address spent

  for (const vout of tx.vout) {
    if (vout.addresses?.includes(address)) {
      totalOut += Number(vout.value) || 0;
    }
  }
  for (const vin of tx.vin) {
    if (vin.addresses?.includes(address)) {
      totalIn += Number(vin.value) || 0;
    }
  }

  const net = totalOut - totalIn;
  const confirmed = tx.confirmations > 0;

  return {
    txid: tx.txid,
    amount: Math.abs(net),
    type: net >= 0 ? 'receive' : 'send',
    confirmed,
    timestamp: tx.blockTime,
  };
}

/** Bucket every tx into the address arrays it touches (within our wallet). */
function bucketTransactionsByAddress(
  transactions: BlockbookTx[],
  scannedByAddress: Map<string, ScannedAddress>,
): void {
  for (const tx of transactions) {
    // Each tx may touch multiple of our addresses (e.g. send-with-change).
    // For each one, push a per-address simplified row.
    const touched = new Set<string>();
    for (const v of tx.vout) {
      for (const a of v.addresses ?? []) {
        if (scannedByAddress.has(a)) touched.add(a);
      }
    }
    for (const v of tx.vin) {
      for (const a of v.addresses ?? []) {
        if (scannedByAddress.has(a)) touched.add(a);
      }
    }
    for (const address of touched) {
      const entry = scannedByAddress.get(address);
      if (!entry) continue;
      entry.txs.push(blockbookTxToPerAddress(tx, address));
    }
  }
}

/**
 * Convert a Blockbook UTXO into our `HdSpendableUtxo` with chain/index
 * recovered from the BIP32 path. Skips entries we can't parse or whose
 * derived address fails the safety check.
 */
function blockbookUtxoToSpendable(
  account: HdAccount,
  u: BlockbookUtxo,
): HdSpendableUtxo | null {
  if (!u.path || !u.address) return null;
  const ci = parseChainIndex(u.path);
  if (!ci) return null;
  const chainNode = ci.chain === CHANGE_CHAIN ? account.changeNode : account.receiveNode;
  const derived = deriveAddress(chainNode, ci.chain, ci.index);
  if (derived.address !== u.address) {
    console.warn(
      `Blockbook UTXO address mismatch: path ${u.path} → ${derived.address}, ` +
        `but UTXO claims ${u.address}`,
    );
    return null;
  }
  const confirmed = u.confirmations > 0;
  return {
    txid: u.txid,
    vout: u.vout,
    value: Number(u.value),
    status: {
      confirmed,
      block_height: u.height,
    },
    address: u.address,
    chain: ci.chain,
    index: ci.index,
  };
}

// ---------------------------------------------------------------------------
// Combined scan
// ---------------------------------------------------------------------------

/**
 * Fetch + parse the full wallet snapshot from Blockbook in two HTTP calls
 * (xpub snapshot + UTXO list).
 *
 * @param account     HD account; supplies the xpub descriptor.
 * @param baseUrl     Blockbook base URL (e.g. `https://btc.trezor.io`).
 * @param signal      Optional abort signal.
 */
export async function scanAccount(
  account: HdAccount,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<AccountScanResult> {
  const descriptor = accountToBip86Descriptor(account);

  // Two independent calls — fan out.
  const [xpubResponse, utxos]: [BlockbookXpubResponse, BlockbookUtxo[]] = await Promise.all([
    fetchXpubSnapshot(baseUrl, descriptor, signal),
    fetchXpubUtxos(baseUrl, descriptor, signal),
  ]);

  // ── Build per-address scan entries from `tokens` ─────────────
  const scannedByAddress = new Map<string, ScannedAddress>();
  const receiveByIndex = new Map<number, ScannedAddress>();
  const changeByIndex = new Map<number, ScannedAddress>();

  for (const token of xpubResponse.tokens ?? []) {
    if (token.type !== 'XPUBAddress') continue;
    const sa = tokenToScannedAddress(account, token);
    if (!sa) continue;
    scannedByAddress.set(sa.derived.address, sa);
    if (sa.derived.chain === RECEIVE_CHAIN) {
      receiveByIndex.set(sa.derived.index, sa);
    } else {
      changeByIndex.set(sa.derived.index, sa);
    }
  }

  // ── Attach per-address tx rows from the top-level `transactions` ──
  bucketTransactionsByAddress(xpubResponse.transactions ?? [], scannedByAddress);

  // ── UTXOs ────────────────────────────────────────────────────
  const spendable: HdSpendableUtxo[] = [];
  for (const u of utxos) {
    const s = blockbookUtxoToSpendable(account, u);
    if (s) {
      spendable.push(s);
      const map = s.chain === RECEIVE_CHAIN ? receiveByIndex : changeByIndex;
      const entry = map.get(s.index);
      if (entry) {
        entry.utxos.push({
          txid: s.txid,
          vout: s.vout,
          value: s.value,
          status: s.status,
        });
      }
    }
  }

  // ── Resolve firstUnusedIndex per chain ───────────────────────
  //
  // Blockbook returns `tokens` for *used* addresses only. The next unused
  // index on a chain is therefore max(usedIndex) + 1, or 0 if none used.
  function nextUnused(byIndex: Map<number, ScannedAddress>): number {
    if (byIndex.size === 0) return 0;
    let max = -1;
    for (const idx of byIndex.keys()) if (idx > max) max = idx;
    return max + 1;
  }

  // ── Build the per-chain result objects ───────────────────────
  function buildChain(byIndex: Map<number, ScannedAddress>): ChainScanResult {
    const used = Array.from(byIndex.values()).sort(
      (a, b) => a.derived.index - b.derived.index,
    );
    const withBalance = used.filter(
      (sa) => sa.utxos.length > 0 || sa.data.totalBalance > 0,
    );
    return { used, withBalance, firstUnusedIndex: nextUnused(byIndex) };
  }

  const receive = buildChain(receiveByIndex);
  const change = buildChain(changeByIndex);

  const addressMap = new Map<string, DerivedAddress>();
  for (const sa of scannedByAddress.values()) addressMap.set(sa.derived.address, sa.derived);

  const totalBalance =
    (Number(xpubResponse.balance) || 0) + (Number(xpubResponse.unconfirmedBalance) || 0);
  const pendingBalance = Number(xpubResponse.unconfirmedBalance) || 0;

  return {
    receive,
    change,
    utxos: spendable,
    totalBalance,
    pendingBalance,
    addressMap,
  };
}

// ---------------------------------------------------------------------------
// Aggregated transaction history (derived; no extra network calls)
// ---------------------------------------------------------------------------

/**
 * Build the wallet-level merged transaction list from per-address tx rows
 * already collected by `scanAccount`. A tx touching multiple owned addresses
 * (e.g. send-with-change) is summed once.
 */
export function buildHdTransactions(result: AccountScanResult): HdTransaction[] {
  const allUsed = [...result.receive.used, ...result.change.used];
  if (allUsed.length === 0) return [];

  const merged = new Map<
    string,
    { txid: string; netSats: number; confirmed: boolean; timestamp?: number }
  >();

  for (const sa of allUsed) {
    for (const tx of sa.txs) {
      const signed = tx.type === 'receive' ? tx.amount : -tx.amount;
      const existing = merged.get(tx.txid);
      if (existing) {
        existing.netSats += signed;
        existing.confirmed = existing.confirmed || tx.confirmed;
        if (tx.timestamp && (!existing.timestamp || tx.timestamp < existing.timestamp)) {
          existing.timestamp = tx.timestamp;
        }
      } else {
        merged.set(tx.txid, {
          txid: tx.txid,
          netSats: signed,
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
    source: 'bip86',
  }));

  out.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return b.timestamp - a.timestamp;
  });

  return out;
}
