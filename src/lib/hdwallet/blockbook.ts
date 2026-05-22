// ---------------------------------------------------------------------------
// Blockbook WebSocket client (Trezor's Bitcoin indexer)
// ---------------------------------------------------------------------------
//
// Trezor Blockbook exposes both a REST API and a WebSocket API at the same
// host. We use the WebSocket API exclusively because:
//
//   1. CORS — `btc.trezor.io` (and the other public mirrors) do not send
//      `Access-Control-Allow-Origin`, so browsers reject every REST response.
//      WebSocket upgrades are not preflighted and have no same-origin
//      requirement on the response side, so they Just Work from any origin.
//   2. Efficiency — a single persistent connection multiplexes every request
//      we make for a wallet session (snapshot, utxos, fee, broadcast) instead
//      of paying TCP+TLS setup costs per request.
//   3. Parity — Trezor Suite itself uses WebSocket; it is the production
//      transport. The REST API is a thin compatibility layer.
//
// We support exactly one Blockbook base URL (no failover list). If the
// server is down or unreachable, errors are surfaced to the user; there is
// no Esplora fallback for the HD wallet.
//
// **Privacy**: every request to this client carries the full account xpub
// (wrapped as `tr(xpub)` descriptor). Whoever operates the configured
// endpoint can link every wallet address and observe balance/spending
// over time. This is the trade-off for the single-call architecture.
//
// ---------------------------------------------------------------------------
// Wire protocol (Blockbook WebSocket)
// ---------------------------------------------------------------------------
//
// Endpoint:   wss://<host>/websocket
//
// Request:    { "id": "<string>", "method": "<name>", "params": { ... } }
// Response:   { "id": "<echoed>", "data": <payload-or-error> }
//
// On error, `data` is shaped `{ "error": { "message": "<reason>" } }`.
//
// We map: HTTP base URL → WS URL by replacing the scheme (`http`→`ws`,
// `https`→`wss`) and appending `/websocket` if not already present.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// URL transform
// ---------------------------------------------------------------------------

/**
 * Convert a Blockbook HTTP(S) base URL into the matching WebSocket URL.
 *
 *     https://btc.trezor.io         → wss://btc.trezor.io/websocket
 *     https://btc.trezor.io/        → wss://btc.trezor.io/websocket
 *     wss://example.com/websocket   → wss://example.com/websocket   (unchanged)
 */
function toWebsocketUrl(baseUrl: string): string {
  let url = baseUrl.trim();
  if (url.startsWith('https://')) {
    url = 'wss://' + url.slice('https://'.length);
  } else if (url.startsWith('http://')) {
    url = 'ws://' + url.slice('http://'.length);
  }
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.endsWith('/websocket')) url += '/websocket';
  return url;
}

// ---------------------------------------------------------------------------
// Socket pool — one persistent connection per configured base URL
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const IDLE_DISCONNECT_MS = 90_000;
const CONNECT_TIMEOUT_MS = 15_000;

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

class BlockbookSocket {
  private ws?: WebSocket;
  private connectPromise?: Promise<WebSocket>;
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly url: string) {}

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.disconnect('idle');
    }, IDLE_DISCONNECT_MS);
  }

  private disconnect(reason: string) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    const ws = this.ws;
    this.ws = undefined;
    this.connectPromise = undefined;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try { ws.close(1000, reason); } catch { /* ignore */ }
    }
  }

  /** Fail every in-flight request with the given error. */
  private failAll(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      if (p.signal && p.abortHandler) p.signal.removeEventListener('abort', p.abortHandler);
      p.reject(err);
    }
    this.pending.clear();
  }

  private async connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const connectTimer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Blockbook WebSocket connect timed out'));
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        clearTimeout(connectTimer);
        this.ws = ws;
        this.resetIdleTimer();
        resolve(ws);
      }, { once: true });

      ws.addEventListener('error', () => {
        clearTimeout(connectTimer);
        const err = new Error(`Blockbook WebSocket error (${this.url})`);
        this.failAll(err);
        this.disconnect('error');
        reject(err);
      }, { once: true });

      ws.addEventListener('close', (ev) => {
        clearTimeout(connectTimer);
        const err = new Error(
          `Blockbook WebSocket closed${ev.code ? ` (${ev.code})` : ''}${ev.reason ? `: ${ev.reason}` : ''}`,
        );
        this.failAll(err);
        if (this.ws === ws) this.disconnect('close');
      });

      ws.addEventListener('message', (ev) => {
        this.onMessage(ev.data);
      });
    }).finally(() => {
      this.connectPromise = undefined;
    });

    return this.connectPromise;
  }

  private onMessage(raw: unknown) {
    if (typeof raw !== 'string') return;
    let parsed: { id?: string; data?: unknown };
    try {
      parsed = JSON.parse(raw) as { id?: string; data?: unknown };
    } catch {
      return;
    }
    if (!parsed.id) return;
    const pending = this.pending.get(parsed.id);
    if (!pending) return; // late or duplicate response
    this.pending.delete(parsed.id);
    clearTimeout(pending.timer);
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener('abort', pending.abortHandler);
    }
    this.resetIdleTimer();

    const data = parsed.data as { error?: { message?: string } } | undefined;
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      const msg = typeof data.error.message === 'string' ? data.error.message : 'Blockbook error';
      pending.reject(new Error(msg));
      return;
    }
    pending.resolve(parsed.data);
  }

  /** Send a JSON-RPC-style message and await the matching response. */
  async send<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new Error('Request aborted');

    const ws = await this.connect();
    const id = String(this.nextId++);
    const req = JSON.stringify({ id, method, params });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
          reject(new Error(`Blockbook ${method} timed out`));
        }
      }, DEFAULT_TIMEOUT_MS);

      const abortHandler = signal
        ? () => {
            if (this.pending.delete(id)) {
              clearTimeout(timer);
              signal.removeEventListener('abort', abortHandler!);
              reject(new Error('Request aborted'));
            }
          }
        : undefined;
      if (signal && abortHandler) signal.addEventListener('abort', abortHandler, { once: true });

      this.pending.set(id, {
        resolve: (data) => resolve(data as T),
        reject,
        timer,
        abortHandler,
        signal,
      });

      try {
        ws.send(req);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

const sockets = new Map<string, BlockbookSocket>();

function getSocket(baseUrl: string): BlockbookSocket {
  const wsUrl = toWebsocketUrl(baseUrl);
  let s = sockets.get(wsUrl);
  if (!s) {
    s = new BlockbookSocket(wsUrl);
    sockets.set(wsUrl, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// getAccountInfo — full xpub snapshot
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

/** Response from the `getAccountInfo` WS method (mirrors REST `/api/v2/xpub`). */
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
 * Fetch the full xpub snapshot from Blockbook in a single WebSocket call.
 *
 * @param baseUrl     Blockbook base URL (HTTP or WSS). The function converts
 *                    `https://host` → `wss://host/websocket` internally.
 * @param descriptor  Output descriptor, e.g. `tr(xpub6...)`.
 * @param signal      Optional abort signal.
 *
 * Params sent:
 *   - `details=txs`     — include the full tx list (default would be `txids`).
 *   - `tokens=used`     — restrict the `tokens` array to addresses with
 *                         at least one tx (Blockbook does the gap-limit walk
 *                         for us).
 *   - `pageSize=1000`   — max page size; covers any practical HD wallet.
 */
export async function fetchXpubSnapshot(
  baseUrl: string,
  descriptor: string,
  signal?: AbortSignal,
): Promise<BlockbookXpubResponse> {
  return getSocket(baseUrl).send<BlockbookXpubResponse>(
    'getAccountInfo',
    {
      descriptor,
      details: 'txs',
      tokens: 'used',
      pageSize: 1000,
    },
    signal,
  );
}

// ---------------------------------------------------------------------------
// getAccountUtxo
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
  return getSocket(baseUrl).send<BlockbookUtxo[]>('getAccountUtxo', { descriptor }, signal);
}

// ---------------------------------------------------------------------------
// estimateFee — fee rates for the four UI buckets in a single call
// ---------------------------------------------------------------------------

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
 * WS `estimateFee` response: one entry per requested block target, in
 * request order. `feePerUnit` is sat/**kB** for Bitcoin-type chains —
 * the same unit as Bitcoin Core's `estimatesmartfee` after BTC→sat
 * conversion. The TypeScript declaration in `blockbook-api.ts`
 * describes it as "sat/byte", but Blockbook's Go source is explicit
 * (`// fee is in sats/kB` in `api/worker.go`) and confirmed against a
 * live mainnet endpoint where the field is ~3000 at typical mempool
 * conditions. Dividing by 1000 yields the sat/vB value we use
 * everywhere else in the wallet.
 */
interface BlockbookFeeEntry {
  feePerUnit?: string;
  /** Some chains return additional fields we don't use. */
  [key: string]: unknown;
}

function parseFeePerUnit(entry: BlockbookFeeEntry | undefined): number {
  if (!entry || typeof entry.feePerUnit !== 'string') return 1;
  const satsPerKb = parseFloat(entry.feePerUnit);
  if (!Number.isFinite(satsPerKb) || satsPerKb <= 0) return 1;
  // sat/kB → sat/vB. Round up so we never underpay relative to the
  // backend's recommendation (which can cause stuck transactions).
  return Math.max(1, Math.ceil(satsPerKb / 1000));
}

/**
 * Fetch all four fee tiers in one WebSocket call.
 *
 * The WS API accepts a `blocks` array and returns an array of fee entries
 * in the same order — far more efficient than four REST round-trips.
 */
export async function fetchFeeRates(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<BlockbookFeeRates> {
  const blocks = [1, 3, 6, 144];
  const result = await getSocket(baseUrl).send<BlockbookFeeEntry[]>(
    'estimateFee',
    { blocks },
    signal,
  );
  const arr = Array.isArray(result) ? result : [];
  return {
    fastestFee: parseFeePerUnit(arr[0]),
    halfHourFee: parseFeePerUnit(arr[1]),
    hourFee: parseFeePerUnit(arr[2]),
    economyFee: parseFeePerUnit(arr[3]),
  };
}

// ---------------------------------------------------------------------------
// sendTransaction — broadcast
// ---------------------------------------------------------------------------

interface BlockbookSendResponse {
  result: string;
}

/**
 * Broadcast a signed transaction. Returns the txid on success.
 */
export async function broadcastBlockbookTx(
  baseUrl: string,
  txHex: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await getSocket(baseUrl).send<BlockbookSendResponse>(
    'sendTransaction',
    { hex: txHex },
    signal,
  );
  if (!data || typeof data.result !== 'string') {
    throw new Error('Broadcast failed: malformed response');
  }
  return data.result;
}

// ---------------------------------------------------------------------------
// getInfo — health check
// ---------------------------------------------------------------------------

/** Subset of the `getInfo` response we care about. */
export interface BlockbookStatus {
  name?: string;
  shortcut?: string;
  decimals?: number;
  version?: string;
  bestHeight?: number;
  bestHash?: string;
  block0Hash?: string;
  testnet?: boolean;
}

export async function fetchBlockbookStatus(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<BlockbookStatus> {
  return getSocket(baseUrl).send<BlockbookStatus>('getInfo', {}, signal);
}

// ---------------------------------------------------------------------------
// getBlock — block-header timestamp lookup
// ---------------------------------------------------------------------------
//
// Used by the silent-payments orchestrator to stamp persisted SP UTXOs with
// the real block timestamp (instead of a synthetic estimate from block
// height × 600s, which drifts noticeably as cumulative average block time
// diverges from 10 minutes).
//
// We request `pageSize: 1` because we only need the block header — the full
// tx list can be megabytes for a busy block and we throw it away. Blockbook
// still returns `time` at the top level of the response either way.
// ---------------------------------------------------------------------------

interface BlockbookBlockResponse {
  /** Block height. */
  height?: unknown;
  /** Block timestamp in unix seconds. */
  time?: unknown;
}

/**
 * Fetch the unix-seconds timestamp of a block by height.
 *
 * Throws if the response is missing the `time` field — the wallet uses a
 * clamped synthetic estimate as a fallback so a transient lookup failure
 * doesn't break the UI.
 */
export async function fetchBlockTime(
  baseUrl: string,
  height: number,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isInteger(height) || height < 0) {
    throw new Error(`Invalid block height: ${height}`);
  }
  const data = await getSocket(baseUrl).send<BlockbookBlockResponse>(
    'getBlock',
    { id: String(height), page: 1, pageSize: 1 },
    signal,
  );
  const t = data?.time;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) {
    throw new Error(`Blockbook getBlock(${height}) missing valid \`time\``);
  }
  return Math.floor(t);
}

// ---------------------------------------------------------------------------
// getCurrentFiatRates — spot BTC → fiat exchange rate
// ---------------------------------------------------------------------------
//
// Blockbook tracks fiat rates for the coin it serves. The WS API takes a
// list of ISO currency codes and returns a `{ ts, rates: { [ccy]: number } }`
// payload. We use this so /wallet's USD display sources from the same
// server as its balance and tx data — no extra HTTP dependency on
// mempool.space.
// ---------------------------------------------------------------------------

interface BlockbookFiatRatesResponse {
  /** Unix seconds the rate snapshot was published. */
  ts?: number;
  /** ISO currency code → BTC/<ccy> exchange rate (BTC value of one unit). */
  rates?: Record<string, number>;
}

/**
 * Fetch the current BTC price in the requested fiat currency.
 *
 * @param baseUrl   Blockbook base URL (HTTP or WSS form).
 * @param currency  ISO currency code, lower-case (e.g. `'usd'`). Default `'usd'`.
 * @param signal    Optional abort signal.
 * @throws when the response is missing or doesn't include the requested currency.
 */
export async function fetchBlockbookBtcPrice(
  baseUrl: string,
  currency = 'usd',
  signal?: AbortSignal,
): Promise<number> {
  const data = await getSocket(baseUrl).send<BlockbookFiatRatesResponse>(
    'getCurrentFiatRates',
    { currencies: [currency] },
    signal,
  );
  const rate = data?.rates?.[currency];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Blockbook fiat rate for "${currency}" unavailable`);
  }
  return rate;
}
