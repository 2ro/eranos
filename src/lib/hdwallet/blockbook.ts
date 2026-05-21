// ---------------------------------------------------------------------------
// Blockbook HTTP client (Trezor's Bitcoin indexer)
// ---------------------------------------------------------------------------
//
// Blockbook exposes an xpub-aware HTTP API:
//
//     GET /api/v2/xpub/<descriptor>?details=txs&tokens=used
//
// returns the entire wallet's balance, derived used-address list, and tx
// history in a single response. This is what Trezor Suite uses and is
// dramatically cheaper than the per-address Esplora dance — one HTTP call
// instead of dozens.
//
// We support exactly one Blockbook base URL (no failover list). If the
// server is down or unreachable, errors are surfaced to the user; there is
// no Esplora fallback for the HD wallet.
//
// **Privacy**: every request to this client carries the full account xpub
// (wrapped as `tr(xpub)` descriptor). Whoever operates the configured
// endpoint can link every wallet address and observe balance/spending
// over time. This is the trade-off for the single-call architecture.
// ---------------------------------------------------------------------------

/** Strip a trailing slash so callers don't have to think about it. */
function normalizeBase(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Wrap fetch with caller-supplied abort signal and a sane default timeout. */
const DEFAULT_TIMEOUT_MS = 20_000;

async function blockbookFetch(
  baseUrl: string,
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<Response> {
  const url = `${normalizeBase(baseUrl)}${path}`;
  const { signal: callerSignal, ...rest } = init;

  // Compose caller-abort + timeout into a single signal.
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), DEFAULT_TIMEOUT_MS);

  let signal: AbortSignal;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutCtrl.signal])
      : timeoutCtrl.signal;
  } else if (callerSignal) {
    if (callerSignal.aborted) timeoutCtrl.abort();
    else callerSignal.addEventListener('abort', () => timeoutCtrl.abort(), { once: true });
    signal = timeoutCtrl.signal;
  } else {
    signal = timeoutCtrl.signal;
  }

  try {
    return await fetch(url, { ...rest, signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    // Blockbook errors are usually `{ "error": "..." }`
    try {
      const parsed = JSON.parse(text) as { error?: string | { message?: string } };
      if (typeof parsed.error === 'string') return parsed.error;
      if (typeof parsed.error?.message === 'string') return parsed.error.message;
    } catch {
      // not JSON, fall through
    }
    return text.slice(0, 200) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

// ---------------------------------------------------------------------------
// /api/v2/xpub/<descriptor>?details=txs
// ---------------------------------------------------------------------------

/** A used-address record returned inside the xpub response under `tokens`. */
export interface BlockbookXpubAddress {
  /** Token type ("XPUBAddress" for Bitcoin xpub-derived addresses). */
  type: string;
  /** The derived Bitcoin address. */
  name: string;
  /** Full BIP32 path, e.g. `m/86'/0'/0'/0/3`. */
  path: string;
  /** Number of transfers (txs) touching this address. */
  transfers: number;
  /** Decimals (8 for Bitcoin). */
  decimals: number;
  /** Confirmed balance as a string of satoshis ("0", "12345", …). */
  balance: string;
  /** Total ever received, sats. */
  totalReceived: string;
  /** Total ever sent, sats. */
  totalSent: string;
}

/**
 * Esplora-style tx row inside the Blockbook xpub `txs` response.
 *
 * Blockbook returns Bitcoin txs with this shape (`Tx` type in the API doc).
 * The fields we actually consume are the txid, status (via `confirmations`),
 * block height/time, and the vin/vout addresses + values used to compute
 * the net effect on the wallet.
 */
export interface BlockbookTx {
  txid: string;
  blockHeight?: number;
  /** -1 for mempool txs. */
  confirmations: number;
  /** Block time (confirmed) or first-seen time (mempool). Unix seconds. */
  blockTime?: number;
  vin: Array<{
    addresses?: string[];
    isAddress?: boolean;
    /** Sats spent by this input, as a string. */
    value?: string;
    txid?: string;
    vout?: number;
  }>;
  vout: Array<{
    addresses?: string[];
    isAddress?: boolean;
    /** Sats sent by this output, as a string. */
    value: string;
    n: number;
  }>;
  /** Net tx value (sats, string). */
  value?: string;
  /** Total input value (sats, string). */
  valueIn?: string;
  /** Fee paid (sats, string). */
  fees?: string;
}

/** Top-level response from `GET /api/v2/xpub/<descriptor>?details=txs`. */
export interface BlockbookXpubResponse {
  page?: number;
  totalPages?: number;
  itemsOnPage?: number;
  /** Echo of the descriptor we sent. */
  address: string;
  /** Confirmed balance (sats, string). */
  balance: string;
  totalReceived: string;
  totalSent: string;
  /** Mempool delta (sats, string). May be negative. */
  unconfirmedBalance: string;
  unconfirmedTxs: number;
  /** Total confirmed tx count across all derived addresses. */
  txs: number;
  /** Count of used derived addresses ("tokens" in Blockbook parlance). */
  usedTokens?: number;
  /** Used derived addresses with per-address stats. Only present when
   *  `details >= tokenBalances`. */
  tokens?: BlockbookXpubAddress[];
  /** Recent transactions (newest first). Present when `details=txs`. */
  transactions?: BlockbookTx[];
}

/**
 * Fetch the full xpub snapshot from Blockbook in a single HTTP call.
 *
 * @param baseUrl     Blockbook base URL (no trailing slash, no path).
 * @param descriptor  Output descriptor, e.g. `tr(xpub6...)`. The function
 *                    handles URL-encoding internally.
 * @param signal      Optional abort signal.
 *
 * Query parameters used:
 *   - `details=txs`     — include the full tx list (default would be `txids`).
 *   - `tokens=used`     — restrict the `tokens` array to addresses with
 *                         at least one tx (we never need fully-derived empty
 *                         ones; Blockbook does the gap-limit walk for us).
 *   - `pageSize=1000`   — max page size; covers any practical HD wallet.
 */
export async function fetchXpubSnapshot(
  baseUrl: string,
  descriptor: string,
  signal?: AbortSignal,
): Promise<BlockbookXpubResponse> {
  const path = `/api/v2/xpub/${encodeURIComponent(descriptor)}?details=txs&tokens=used&pageSize=1000`;
  const response = await blockbookFetch(baseUrl, path, { signal });
  if (!response.ok) {
    throw new Error(`Blockbook xpub fetch failed: ${await readErrorBody(response)}`);
  }
  return response.json() as Promise<BlockbookXpubResponse>;
}

// ---------------------------------------------------------------------------
// /api/v2/utxo/<descriptor>
// ---------------------------------------------------------------------------

/** A UTXO row from Blockbook (xpub endpoint includes `address` + `path`). */
export interface BlockbookUtxo {
  txid: string;
  vout: number;
  /** Value as a string of sats. */
  value: string;
  /** Block height; absent for mempool UTXOs. */
  height?: number;
  /** 0 for mempool, >0 for confirmed. */
  confirmations: number;
  /** Locktime, only set for unconfirmed UTXOs with non-zero locktime. */
  lockTime?: number;
  /** True for coinbase UTXOs within the maturity window. */
  coinbase?: boolean;
  /** Address holding the UTXO (xpub endpoint only). */
  address?: string;
  /** BIP32 path under the xpub, e.g. `m/86'/0'/0'/0/3` (xpub endpoint only). */
  path?: string;
}

/**
 * Fetch all UTXOs spendable by the descriptor.
 *
 * Blockbook returns confirmed + unconfirmed by default. Each entry carries
 * its derivation path, so we can recover the (chain, index) pair needed to
 * sign without re-deriving from the address string.
 */
export async function fetchXpubUtxos(
  baseUrl: string,
  descriptor: string,
  signal?: AbortSignal,
): Promise<BlockbookUtxo[]> {
  const path = `/api/v2/utxo/${encodeURIComponent(descriptor)}`;
  const response = await blockbookFetch(baseUrl, path, { signal });
  if (!response.ok) {
    throw new Error(`Blockbook utxo fetch failed: ${await readErrorBody(response)}`);
  }
  return response.json() as Promise<BlockbookUtxo[]>;
}

// ---------------------------------------------------------------------------
// /api/v2/estimatefee/<blocks> — fee rate for a confirmation target
// ---------------------------------------------------------------------------

/**
 * Blockbook returns fee estimates in **BTC/kB** (a string, e.g.
 * `"0.00012345"`). We convert to sat/vB at the call site since the rest of
 * the wallet code works in sat/vB integers.
 */
interface BlockbookFeeResponse {
  /** BTC/kB as a string. Bitcoin Core's `estimatesmartfee` output. */
  result: string;
}

/**
 * Fetch a fee-rate estimate for the given confirmation target (in blocks).
 * Returns sat/vB rounded up to the nearest integer; never returns < 1.
 */
export async function fetchFeeRate(
  baseUrl: string,
  blocks: number,
  signal?: AbortSignal,
): Promise<number> {
  const path = `/api/v2/estimatefee/${blocks}`;
  const response = await blockbookFetch(baseUrl, path, { signal });
  if (!response.ok) {
    throw new Error(`Blockbook estimatefee failed: ${await readErrorBody(response)}`);
  }
  const data = (await response.json()) as BlockbookFeeResponse;
  const btcPerKb = parseFloat(data.result);
  if (!Number.isFinite(btcPerKb) || btcPerKb <= 0) {
    // Bitcoin Core returns -1 when it doesn't have enough data; fall back
    // to the relay minimum rather than throwing.
    return 1;
  }
  // BTC/kB → sat/vB:
  //   1 BTC = 1e8 sats, 1 kB = 1000 vB
  //   sat/vB = btcPerKb * 1e8 / 1000 = btcPerKb * 1e5
  return Math.max(1, Math.ceil(btcPerKb * 1e5));
}

/** Fee rate estimates for the four UI-exposed speed buckets. */
export interface BlockbookFeeRates {
  /** ~10 min / next block. */
  fastestFee: number;
  /** ~30 min (3 blocks). */
  halfHourFee: number;
  /** ~1 hour (6 blocks). */
  hourFee: number;
  /** ~1 day (144 blocks). */
  economyFee: number;
}

/**
 * Fetch all four fee tiers in one call (one HTTP request per tier, in
 * parallel). Wraps {@link fetchFeeRate}.
 */
export async function fetchFeeRates(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<BlockbookFeeRates> {
  const [fastestFee, halfHourFee, hourFee, economyFee] = await Promise.all([
    fetchFeeRate(baseUrl, 1, signal),
    fetchFeeRate(baseUrl, 3, signal),
    fetchFeeRate(baseUrl, 6, signal),
    fetchFeeRate(baseUrl, 144, signal),
  ]);
  return { fastestFee, halfHourFee, hourFee, economyFee };
}

// ---------------------------------------------------------------------------
// /api/v2/sendtx — broadcast
// ---------------------------------------------------------------------------

/** Successful broadcast response. */
interface BlockbookSendResponse {
  result: string;
}

/**
 * Broadcast a signed transaction. Returns the txid on success.
 *
 * Uses POST with the hex body. The trailing slash on `/api/v2/sendtx/` is
 * mandatory per the Blockbook API documentation.
 */
export async function broadcastBlockbookTx(
  baseUrl: string,
  txHex: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await blockbookFetch(baseUrl, `/api/v2/sendtx/`, {
    method: 'POST',
    body: txHex,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Broadcast failed: ${await readErrorBody(response)}`);
  }
  const data = (await response.json()) as BlockbookSendResponse;
  return data.result;
}

// ---------------------------------------------------------------------------
// /api/status — health check (used to warn the user when the endpoint is
//                misconfigured; not currently called from anywhere)
// ---------------------------------------------------------------------------

/** Subset of the `/api/status` response we care about. */
export interface BlockbookStatus {
  blockbook: {
    coin: string;
    inSync: boolean;
    bestHeight: number;
  };
}

export async function fetchBlockbookStatus(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<BlockbookStatus> {
  const response = await blockbookFetch(baseUrl, `/api/status`, { signal });
  if (!response.ok) {
    throw new Error(`Blockbook status failed: ${await readErrorBody(response)}`);
  }
  return response.json() as Promise<BlockbookStatus>;
}
