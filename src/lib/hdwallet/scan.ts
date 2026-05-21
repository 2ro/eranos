import {
  type AddressData,
  fetchAddressData,
  fetchTransactions,
  fetchUTXOs,
  type UTXO,
} from '@/lib/bitcoin';
import {
  CHANGE_CHAIN,
  type DerivedAddress,
  deriveAddress,
  type HdAccount,
  RECEIVE_CHAIN,
} from './derivation';

// ---------------------------------------------------------------------------
// Gap-limit chain scanning
// ---------------------------------------------------------------------------
//
// BIP44 gap limit: a wallet considers a chain "fully scanned" after observing
// `GAP_LIMIT` consecutive addresses that have never been used (zero history).
// Industry standard is 20.
//
// We scan in batches of `SCAN_BATCH_SIZE` to amortise round-trip latency
// while still bounding fan-out on the Esplora server.
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

/**
 * Scan a single chain (receive or change) until `GAP_LIMIT` consecutive
 * unused addresses are observed.
 */
async function scanChain(
  account: HdAccount,
  chain: 0 | 1,
  esploraApis: string[],
  signal?: AbortSignal,
): Promise<ChainScanResult> {
  const chainNode = chain === RECEIVE_CHAIN ? account.receiveNode : account.changeNode;

  const used: ScannedAddress[] = [];
  const withBalance: ScannedAddress[] = [];
  let firstUnusedIndex = 0;
  let firstUnusedSet = false;
  let consecutiveUnused = 0;
  let index = 0;
  let hitMaxIndex = false;

  while (consecutiveUnused < GAP_LIMIT) {
    if (index >= MAX_INDEX) {
      hitMaxIndex = true;
      break;
    }

    // Build the next batch of addresses to scan.
    const batch: DerivedAddress[] = [];
    for (let i = 0; i < SCAN_BATCH_SIZE && consecutiveUnused + i < GAP_LIMIT && index + i < MAX_INDEX; i++) {
      batch.push(deriveAddress(chainNode, chain, index + i));
    }
    if (batch.length === 0) break;

    // Fetch address data in parallel. UTXOs are only fetched for addresses
    // that turn out to be used — we avoid speculative UTXO calls for the
    // ~20 "tail" addresses at the end of every scan.
    const dataResults = await Promise.all(
      batch.map(async (d) => {
        signal?.throwIfAborted();
        const data = await fetchAddressData(d.address, esploraApis, signal);
        return { d, data };
      }),
    );

    for (const { d, data } of dataResults) {
      if (isUsed(data)) {
        // Used — reset gap counter, fetch UTXOs for spending.
        signal?.throwIfAborted();
        const utxos = await fetchUTXOs(d.address, esploraApis, signal);
        const sa: ScannedAddress = { derived: d, data, utxos };
        used.push(sa);
        if (utxos.length > 0 || data.totalBalance > 0) withBalance.push(sa);
        consecutiveUnused = 0;
        // Do NOT update firstUnusedIndex here — we want the first index that
        // has never been used, so it stays pointed at the earliest gap.
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

  // Edge case: the chain has zero used addresses. firstUnusedIndex stays 0.
  if (!firstUnusedSet) firstUnusedIndex = 0;

  return { used, withBalance, firstUnusedIndex, hitMaxIndex };
}

/**
 * Scan both chains (receive and change) for an HD account and aggregate the
 * results.
 *
 * @param account          The derived HD account.
 * @param esploraApis   Ordered list of Esplora REST roots tried with failover.
 * @param signal           Optional abort signal.
 */
export async function scanAccount(
  account: HdAccount,
  esploraApis: string[],
  signal?: AbortSignal,
): Promise<AccountScanResult> {
  // Both chains in parallel — they're independent of each other.
  const [receive, change] = await Promise.all([
    scanChain(account, RECEIVE_CHAIN, esploraApis, signal),
    scanChain(account, CHANGE_CHAIN, esploraApis, signal),
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
 * Fetch per-address transaction lists for every used address and combine
 * them by txid. A single transaction that hits multiple owned addresses
 * (e.g. send-with-change) is merged into one record whose `amount` is the
 * net wallet-level change.
 */
export async function fetchHdTransactions(
  result: AccountScanResult,
  esploraApis: string[],
  signal?: AbortSignal,
): Promise<HdTransaction[]> {
  const allUsed = [...result.receive.used, ...result.change.used];
  if (allUsed.length === 0) return [];

  // Fetch each address's tx list in parallel. Each call returns a simplified
  // per-address view from `fetchTransactions` (net positive/negative).
  const perAddress = await Promise.all(
    allUsed.map(async (sa) => {
      signal?.throwIfAborted();
      const txs = await fetchTransactions(sa.derived.address, esploraApis, signal);
      return txs.map((tx) => ({
        ...tx,
        // `fetchTransactions` returns Math.abs(net); recover the signed value.
        signedAmount: tx.type === 'receive' ? tx.amount : -tx.amount,
      }));
    }),
  );

  // Merge by txid — sum signed amounts so that send-with-change collapses.
  const merged = new Map<string, {
    txid: string;
    netSats: number;
    confirmed: boolean;
    timestamp?: number;
  }>();

  for (const list of perAddress) {
    for (const tx of list) {
      const existing = merged.get(tx.txid);
      if (existing) {
        existing.netSats += tx.signedAmount;
        // Once confirmed, stay confirmed.
        existing.confirmed = existing.confirmed || tx.confirmed;
        // Prefer the earliest known timestamp.
        if (tx.timestamp && (!existing.timestamp || tx.timestamp < existing.timestamp)) {
          existing.timestamp = tx.timestamp;
        }
      } else {
        merged.set(tx.txid, {
          txid: tx.txid,
          netSats: tx.signedAmount,
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

  // Sort newest first. Unconfirmed (no timestamp) go to the top.
  out.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return b.timestamp - a.timestamp;
  });

  return out;
}
