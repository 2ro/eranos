import { esploraFetch } from '@/lib/esplora';
import type { AddressData, Transaction, UTXO } from '@/lib/bitcoin';

// ---------------------------------------------------------------------------
// Combined per-address fetcher
// ---------------------------------------------------------------------------
//
// Esplora's `/address/:addr/txs` endpoint returns up to 50 mempool + 25
// confirmed transactions in a single response. From that single response we
// can derive:
//
//   - Whether the address is "used"   (txCount > 0 || pendingTxCount > 0)
//   - The address's net balance       (sum signed delta over all returned txs)
//   - The simplified `Transaction[]`  (one per response item)
//
// So we drop the dedicated `/address/:addr` and `/address/:addr/utxo` calls
// for the HD scan — every used address goes from 3 round-trips per refresh
// (balance + utxos + txs) to 1.
//
// Caveat: `/address/:addr/txs` caps confirmed history at 25. For an address
// with more confirmed activity the derived `txCount` is "≥ 25" and the
// derived balance and UTXO set will be incomplete. We surface this via the
// `historyCapped` flag so the caller can fall back to /address/:addr in the
// (rare for HD wallets) case it matters. For our gap-limit scan it doesn't —
// "is this address used?" only needs to know txCount ≥ 1.
//
// UTXOs are reconstructed by simple spent-output bookkeeping: every confirmed
// output to the address is a candidate UTXO; every confirmed input from the
// address consumes one. The remaining set is the current UTXO list. This is
// the same trick Electrum-style clients have used for a decade and is
// equivalent to /utxo for non-capped addresses.
// ---------------------------------------------------------------------------

/** Combined per-address snapshot derived from a single `/txs` response. */
export interface AddressSnapshot {
  /** AddressData with balance + tx counts. May be capped — see `historyCapped`. */
  data: AddressData;
  /** Simplified transactions, one per item in the `/txs` response. */
  txs: Transaction[];
  /** UTXOs derived from the same response. May be incomplete if `historyCapped`. */
  utxos: UTXO[];
  /**
   * True if the `/txs` response returned exactly 25 confirmed transactions —
   * the page-cap. In that case `data.txCount`, `data.balance`,
   * `data.totalReceived`, `data.totalSent`, and `utxos` may be incomplete.
   */
  historyCapped: boolean;
}

/** Raw Esplora `/address/:addr/txs` response item. */
interface EsploraTx {
  txid: string;
  vin: Array<{
    txid?: string;
    vout?: number;
    prevout: { scriptpubkey_address?: string; value: number } | null;
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value: number;
  }>;
  status: { confirmed: boolean; block_time?: number; block_height?: number };
}

/**
 * Fetch a single address's full snapshot from `/address/:addr/txs`. Returns
 * everything we need (balance, tx count, simplified txs, UTXOs) in one round
 * trip.
 *
 * @param address       The Bitcoin address.
 * @param baseUrls      Ordered list of Esplora REST roots (failover handled).
 * @param signal        Optional abort signal.
 */
export async function fetchAddressSnapshot(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<AddressSnapshot> {
  const response = await esploraFetch(baseUrls, `/address/${address}/txs`, { signal });
  if (!response.ok) {
    throw new Error('Failed to fetch address snapshot');
  }
  const raw = (await response.json()) as EsploraTx[];

  // ── Build per-tx aggregates ───────────────────────────────────
  const txs: Transaction[] = [];
  let txCount = 0;
  let pendingTxCount = 0;
  let funded = 0;
  let spent = 0;
  let mempoolFunded = 0;
  let mempoolSpent = 0;
  let confirmedReturned = 0;

  // For UTXO derivation: outputs-to-us indexed by `${txid}:${vout}`, then
  // remove any output spent by a later confirmed input from the same address.
  const candidateOutputs = new Map<string, UTXO>();
  const consumed = new Set<string>();

  for (const tx of raw) {
    const { confirmed, block_time, block_height } = tx.status;
    if (confirmed) {
      txCount++;
      confirmedReturned++;
    } else {
      pendingTxCount++;
    }

    let outToUs = 0;
    let inFromUs = 0;

    // Outputs to us → candidate UTXOs.
    for (let i = 0; i < tx.vout.length; i++) {
      const o = tx.vout[i];
      if (o.scriptpubkey_address !== address) continue;
      outToUs += o.value;
      if (confirmed) {
        candidateOutputs.set(`${tx.txid}:${i}`, {
          txid: tx.txid,
          vout: i,
          value: o.value,
          status: { confirmed: true, block_height, block_time },
        });
      }
    }

    // Inputs from us → consumes previous outputs (only spendable from
    // confirmed inputs; an unconfirmed spend means the output is still
    // theoretically unspent but practically locked).
    for (const i of tx.vin) {
      if (i.prevout?.scriptpubkey_address !== address) continue;
      inFromUs += i.prevout.value;
      if (confirmed && i.txid !== undefined && i.vout !== undefined) {
        consumed.add(`${i.txid}:${i.vout}`);
      }
    }

    const net = outToUs - inFromUs;

    if (confirmed) {
      funded += outToUs;
      spent += inFromUs;
    } else {
      mempoolFunded += outToUs;
      mempoolSpent += inFromUs;
    }

    txs.push({
      txid: tx.txid,
      amount: Math.abs(net),
      type: net >= 0 ? 'receive' : 'send',
      confirmed,
      timestamp: block_time,
    });
  }

  // Esplora returns confirmed txs in batches of 25. If we got exactly 25,
  // assume there may be more and flag the snapshot as capped.
  const historyCapped = confirmedReturned >= 25;

  // ── Derive UTXOs ──────────────────────────────────────────────
  const utxos: UTXO[] = [];
  for (const [key, u] of candidateOutputs) {
    if (!consumed.has(key)) utxos.push(u);
  }

  // ── Build AddressData ────────────────────────────────────────
  const confirmedBalance = funded - spent;
  const pendingBalance = mempoolFunded - mempoolSpent;
  const data: AddressData = {
    balance: confirmedBalance,
    pendingBalance,
    totalBalance: confirmedBalance + pendingBalance,
    totalReceived: funded,
    totalSent: spent,
    txCount,
    pendingTxCount,
  };

  return { data, txs, utxos, historyCapped };
}
