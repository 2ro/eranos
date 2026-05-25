import { hex } from '@scure/base';
import { schnorr } from '@noble/curves/secp256k1.js';
import * as btc from '@scure/btc-signer';
import { nip19 } from 'nostr-tools';

import { esploraFetch } from './esplora';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard Bitcoin dust limit in satoshis. */
const DUST_LIMIT = 546;
/** Minimum non-dust output value in satoshis (BIP-141 / P2TR relay policy). */
export const BITCOIN_DUST_LIMIT = DUST_LIMIT;

/** Estimated vBytes per P2TR input. */
const VBYTES_PER_INPUT = 57.5;

/** Estimated vBytes per P2TR output. */
const VBYTES_PER_OUTPUT = 43;

/** Estimated vBytes for transaction overhead (version, locktime, etc.). */
const VBYTES_OVERHEAD = 10.5;

/** Mainnet network constant for @scure/btc-signer. */
const NETWORK = btc.NETWORK;

// ---------------------------------------------------------------------------
// Pubkey validation
// ---------------------------------------------------------------------------

/**
 * Strict 32-byte hex validator. Rejects anything that isn't exactly 64
 * lowercase-or-uppercase hex characters.
 */
function isValidPubkeyHex(hexStr: string): boolean {
  return typeof hexStr === 'string' && /^[0-9a-fA-F]{64}$/.test(hexStr);
}

/**
 * Check that a 32-byte x-only key is actually a valid secp256k1 point.
 *
 * BIP-340 specifies that an x-only pubkey is valid iff `lift_x(P) ≠ ∞`. Noble's
 * `schnorr.utils.lift_x` throws when the x-coordinate is not on the curve, so
 * we use it as a curve-membership check.
 */
function isOnCurve(xonly: Uint8Array): boolean {
  try {
    schnorr.utils.lift_x(BigInt('0x' + hex.encode(xonly)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a Nostr public key (32-byte hex) to a Bitcoin Taproot (P2TR) address.
 *
 * Both Nostr and Bitcoin Taproot use secp256k1 with 32-byte x-only public keys
 * (Schnorr / BIP-340), so the key can be used directly as a Taproot internal
 * public key with no mathematical conversion.
 *
 * Returns an empty string if the input is malformed or not a valid x-only key
 * on the secp256k1 curve.
 */
export function nostrPubkeyToBitcoinAddress(pubkeyHex: string): string {
  if (!isValidPubkeyHex(pubkeyHex)) return '';

  try {
    const internalPubkey = hex.decode(pubkeyHex.toLowerCase());
    if (!isOnCurve(internalPubkey)) return '';

    const { address } = btc.p2tr(internalPubkey, undefined, NETWORK);
    return address || '';
  } catch (error) {
    console.error('Error generating Bitcoin address:', error);
    return '';
  }
}

/**
 * Convert a bech32 `npub1...` identifier to a Bitcoin Taproot (P2TR) address.
 * Decodes the npub to a hex pubkey, then delegates to {@link nostrPubkeyToBitcoinAddress}.
 */
export function npubToBitcoinAddress(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return nostrPubkeyToBitcoinAddress(decoded.data);
}

// ---------------------------------------------------------------------------
// Balance / Address data (wallet page)
// ---------------------------------------------------------------------------

/** Balance data returned by the Esplora API. */
export interface AddressData {
  /** Confirmed on-chain balance in satoshis. */
  balance: number;
  /** Unconfirmed mempool balance in satoshis. */
  pendingBalance: number;
  /** Sum of confirmed + pending balance. */
  totalBalance: number;
  /** Total satoshis ever received (confirmed). */
  totalReceived: number;
  /** Total satoshis ever sent (confirmed). */
  totalSent: number;
  /** Confirmed transaction count. */
  txCount: number;
  /** Pending (mempool) transaction count. */
  pendingTxCount: number;
}

/**
 * Fetch balance and transaction stats for a Bitcoin address from an
 * Esplora-compatible REST API (e.g. mempool.space, Blockstream).
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchAddressData(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<AddressData> {
  const response = await esploraFetch(baseUrls, `/address/${address}`, { signal });

  if (!response.ok) {
    throw new Error('Failed to fetch balance');
  }

  const data = await response.json();

  const confirmedBalance = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
  const pendingBalance = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;

  return {
    balance: confirmedBalance,
    pendingBalance,
    totalBalance: confirmedBalance + pendingBalance,
    totalReceived: data.chain_stats.funded_txo_sum,
    totalSent: data.chain_stats.spent_txo_sum,
    txCount: data.chain_stats.tx_count,
    pendingTxCount: data.mempool_stats.tx_count,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Convert satoshis to a BTC string with up to 8 decimal places. */
function satsToBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

/**
 * Convert satoshis to a BTC string with trailing zeros stripped.
 * E.g. `formatBTC(100_000_000)` → `"1"`, `formatBTC(1_234_560)` → `"0.0123456"`.
 */
export function formatBTC(sats: number): string {
  return satsToBTC(sats).replace(/\.?0+$/, '');
}

/** Format a satoshi amount with locale-aware thousand separators. */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Fetch the current BTC price in USD from a mempool.space-compatible API.
 *
 * Note: the `/v1/prices` endpoint is a mempool.space extension to the
 * standard Esplora REST surface. Backends like Blockstream's Esplora do
 * not expose it — those endpoints return `404` and the failover client
 * silently advances to the next URL (without penalising the endpoint).
 *
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchBtcPrice(baseUrls: string[], signal?: AbortSignal): Promise<number> {
  const response = await esploraFetch(baseUrls, `/v1/prices`, {
    // /v1/prices is a mempool.space extension — 404 means "endpoint doesn't
    // speak this path", not "the endpoint is dead". Soft-failover to the
    // next URL without putting this one in cool-down.
    skipStatuses: [404],
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch BTC price');
  }

  const data = await response.json();
  return data.USD;
}

/**
 * USD threshold above which Bitcoin send/zap flows require explicit
 * confirmation (two-tap). Chosen to catch meaningful dollar amounts without
 * nagging on everyday $5–$25 zaps.
 */
export const LARGE_AMOUNT_USD_THRESHOLD = 100;

/**
 * Whether a given satoshi amount crosses the "large amount" threshold at the
 * current BTC/USD price. Returns false when `btcPrice` is unavailable, so the
 * UI does not arm confirmation without a known USD value.
 */
export function isLargeAmount(sats: number, btcPrice: number | undefined): boolean {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return false;
  if (!Number.isFinite(sats) || sats <= 0) return false;
  const usd = (sats / 100_000_000) * btcPrice;
  return usd >= LARGE_AMOUNT_USD_THRESHOLD;
}

/** Convert satoshis to USD given a BTC price. */
export function satsToUSD(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Convert satoshis to a whole-dollar USD string (no cents). */
export function satsToUSDWhole(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Convert USD to satoshis given a BTC price. Returns 0 for invalid input. */
export function usdToSats(usd: number, btcPrice: number | undefined): number {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return 0;
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round((usd / btcPrice) * 100_000_000);
}

// ---------------------------------------------------------------------------
// Wallet-page transaction list (simplified per-address view)
// ---------------------------------------------------------------------------

/** A simplified transaction relevant to a specific address. */
export interface Transaction {
  /** Transaction ID (hex). */
  txid: string;
  /** Net satoshi change for the address (positive = received, negative = sent). */
  amount: number;
  /** Whether this is a receive or send relative to the address. */
  type: 'receive' | 'send';
  /** Whether the transaction is confirmed. */
  confirmed: boolean;
  /** Unix timestamp of the block (undefined if unconfirmed). */
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Full transaction detail (NIP-73 /i/bitcoin:tx:... page)
// ---------------------------------------------------------------------------

/** A single input in a full transaction. */
interface TxInput {
  txid: string;
  vout: number;
  address?: string;
  value: number;
  isCoinbase: boolean;
}

/** A single output in a full transaction. */
interface TxOutput {
  address?: string;
  value: number;
  scriptpubkeyType: string;
  /** True if the output has been spent. */
  spent: boolean;
}

/** Full transaction detail returned by the Esplora API. */
interface TxDetail {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  /** Total value of all inputs (sats). */
  totalInput: number;
  /** Total value of all outputs (sats). */
  totalOutput: number;
}

/**
 * Fetch full transaction details from an Esplora-compatible API.
 *
 * @param txid       The transaction ID (hex).
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchTxDetail(
  txid: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<TxDetail> {
  const response = await esploraFetch(baseUrls, `/tx/${txid}`, { signal });
  if (!response.ok) throw new Error('Failed to fetch transaction');

  const tx = await response.json();

  const vin = tx.vin as Array<{
    txid: string;
    vout: number;
    prevout: { scriptpubkey_address?: string; value: number } | null;
    is_coinbase: boolean;
  }>;
  const vout = tx.vout as Array<{
    scriptpubkey_address?: string;
    value: number;
    scriptpubkey_type: string;
  }>;
  const status = tx.status as { confirmed: boolean; block_height?: number; block_hash?: string; block_time?: number };

  const inputs: TxInput[] = vin.map((input) => ({
    txid: input.txid,
    vout: input.vout,
    address: input.prevout?.scriptpubkey_address,
    value: input.prevout?.value ?? 0,
    isCoinbase: input.is_coinbase,
  }));

  const outputs: TxOutput[] = vout.map((output) => ({
    address: output.scriptpubkey_address,
    value: output.value,
    scriptpubkeyType: output.scriptpubkey_type,
    spent: false, // Esplora /tx endpoint doesn't include spending info
  }));

  const totalInput = inputs.reduce((sum, i) => sum + i.value, 0);
  const totalOutput = outputs.reduce((sum, o) => sum + o.value, 0);

  return {
    txid: tx.txid as string,
    version: tx.version as number,
    locktime: tx.locktime as number,
    size: tx.size as number,
    weight: tx.weight as number,
    fee: tx.fee as number,
    confirmed: status.confirmed,
    blockHeight: status.block_height,
    blockHash: status.block_hash,
    blockTime: status.block_time,
    inputs,
    outputs,
    totalInput,
    totalOutput,
  };
}

// ---------------------------------------------------------------------------
// Address transaction history (campaign ledger, /i/bitcoin:address:... page)
// ---------------------------------------------------------------------------

/**
 * A transaction in an address's history, summarised for ledger-style display.
 *
 * `netSats` is the address-relative net flow: the sum of outputs paying to
 * the address minus the sum of inputs spending from it. Positive means the
 * address received funds in this tx, negative means it sent.
 */
export interface AddressTransaction {
  /** Transaction ID (hex). */
  txid: string;
  /** Net satoshi change for the address (positive = received, negative = sent). */
  netSats: number;
  /** Total satoshis received by the address in this tx (sum of outputs to it). */
  receivedSats: number;
  /** Total satoshis sent from the address in this tx (sum of inputs from it). */
  sentSats: number;
  /** Network fee paid by this tx (sats). */
  fee: number;
  /** Block height (undefined if unconfirmed). */
  blockHeight?: number;
  /** Block time (unix seconds, undefined if unconfirmed). */
  blockTime?: number;
  /** True if confirmed in a block. */
  confirmed: boolean;
}

/** Shape of a single `vin` / `vout` entry returned by Esplora's `/address/:addr/txs` endpoint. */
interface EsploraTxIO {
  prevout?: { scriptpubkey_address?: string; value: number } | null;
  scriptpubkey_address?: string;
  value: number;
}

/** Shape of a single transaction returned by Esplora's `/address/:addr/txs` endpoint. */
interface EsploraAddressTx {
  txid: string;
  fee: number;
  vin: EsploraTxIO[];
  vout: EsploraTxIO[];
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

/**
 * Summarise a raw Esplora tx (from `/address/:addr/txs[/chain/...]`) into an
 * address-relative ledger row.
 */
function summariseAddressTx(tx: EsploraAddressTx, address: string): AddressTransaction {
  let sentSats = 0;
  for (const input of tx.vin) {
    if (input.prevout?.scriptpubkey_address === address) {
      sentSats += input.prevout.value ?? 0;
    }
  }

  let receivedSats = 0;
  for (const output of tx.vout) {
    if (output.scriptpubkey_address === address) {
      receivedSats += output.value ?? 0;
    }
  }

  return {
    txid: tx.txid,
    netSats: receivedSats - sentSats,
    receivedSats,
    sentSats,
    fee: tx.fee ?? 0,
    blockHeight: tx.status.block_height,
    blockTime: tx.status.block_time,
    confirmed: tx.status.confirmed,
  };
}

/**
 * Fetch transaction history for a Bitcoin address from an Esplora-compatible
 * REST API.
 *
 * Returns confirmed transactions newest first, optionally prefixed by any
 * unconfirmed (mempool) transactions touching the address. Esplora's
 * `/address/:addr/txs` endpoint returns at most 50 confirmed transactions
 * per page (plus all mempool entries on the first call). Pass `lastSeenTxid`
 * to fetch the next page via `/address/:addr/txs/chain/:last_seen_txid`.
 *
 * @param address       The Bitcoin address to look up.
 * @param baseUrls      Ordered list of Esplora REST roots tried with failover.
 * @param lastSeenTxid  When supplied, fetch the page of confirmed txs older
 *                      than this txid. When omitted, returns mempool + the
 *                      newest confirmed page.
 * @param signal        Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchAddressTxs(
  address: string,
  baseUrls: string[],
  lastSeenTxid: string | undefined,
  signal?: AbortSignal,
): Promise<AddressTransaction[]> {
  const path = lastSeenTxid
    ? `/address/${address}/txs/chain/${lastSeenTxid}`
    : `/address/${address}/txs`;
  const response = await esploraFetch(baseUrls, path, { signal });

  if (!response.ok) {
    throw new Error('Failed to fetch address transactions');
  }

  const data: EsploraAddressTx[] = await response.json();
  return data.map((tx) => summariseAddressTx(tx, address));
}

// ---------------------------------------------------------------------------
// Sending: UTXOs, fee estimation, transaction construction, broadcast
// ---------------------------------------------------------------------------

/** An unspent transaction output. */
export interface UTXO {
  txid: string;
  vout: number;
  /** Value in satoshis. */
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

/**
 * Fetch UTXOs for a Bitcoin address from an Esplora-compatible API.
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchUTXOs(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<UTXO[]> {
  const response = await esploraFetch(baseUrls, `/address/${address}/utxo`, { signal });
  if (!response.ok) throw new Error('Failed to fetch UTXOs');
  return response.json();
}

/** Fee rate estimates keyed by confirmation speed. */
export interface FeeRates {
  /** ~10 min / next block (target 1). */
  fastestFee: number;
  /** ~30 min (target 3). */
  halfHourFee: number;
  /** ~1 hour (target 6). */
  hourFee: number;
  /** ~1 day (target 144). */
  economyFee: number;
  /** Minimum relay fee (target 504). */
  minimumFee: number;
}

/**
 * Fetch recommended fee rates (sat/vB) from an Esplora-compatible API.
 *
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function getFeeRates(baseUrls: string[], signal?: AbortSignal): Promise<FeeRates> {
  const response = await esploraFetch(baseUrls, `/fee-estimates`, { signal });
  if (!response.ok) throw new Error('Failed to fetch fee estimates');

  const data = await response.json();

  return {
    fastestFee: Math.ceil(data['1'] || 1),
    halfHourFee: Math.ceil(data['3'] || 1),
    hourFee: Math.ceil(data['6'] || 1),
    economyFee: Math.ceil(data['144'] || 1),
    minimumFee: Math.ceil(data['504'] || 1),
  };
}

/**
 * Estimate the fee for a P2TR transaction in satoshis.
 *
 * @param numInputs  Number of Taproot inputs.
 * @param numOutputs Number of outputs (recipient + optional change).
 * @param feeRate    Fee rate in sat/vB.
 */
export function estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
  const vBytes = numInputs * VBYTES_PER_INPUT + numOutputs * VBYTES_PER_OUTPUT + VBYTES_OVERHEAD;
  return Math.ceil(vBytes * feeRate);
}

/**
 * Validate a Bitcoin address (mainnet). Returns `true` if the address has a
 * valid format and checksum, `false` otherwise.
 */
export function validateBitcoinAddress(address: string): boolean {
  try {
    btc.Address(NETWORK).decode(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Broadcast a signed transaction hex to the Bitcoin network via an
 * Esplora-compatible API. Returns the txid.
 *
 * Broadcast is idempotent at the Bitcoin protocol layer — re-broadcasting a
 * tx that's already in mempool is harmless — so we let the failover client
 * retry across endpoints normally. The first endpoint that accepts the tx
 * wins.
 *
 * @param txHex      The signed transaction hex.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function broadcastTransaction(
  txHex: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await esploraFetch(baseUrls, `/tx`, {
    method: 'POST',
    body: txHex,
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Broadcast failed: ${body}`);
  }

  return response.text();
}

/** Result of building an unsigned PSBT. */
interface UnsignedPsbt {
  /** Hex-encoded unsigned PSBT. */
  psbtHex: string;
  /** Fee in satoshis. */
  fee: number;
}

// ---------------------------------------------------------------------------
// PSBT helpers (private)
// ---------------------------------------------------------------------------

/**
 * Serialise a PSBT-shaped Transaction to hex. We carry hex strings across the
 * signer boundary because the existing public API (and NIP-46 `sign_psbt`)
 * speaks hex.
 */
function txToPsbtHex(tx: btc.Transaction): string {
  return hex.encode(tx.toPSBT());
}

/** Parse a hex-encoded PSBT into a fresh Transaction. */
function psbtFromHex(psbtHex: string): btc.Transaction {
  return btc.Transaction.fromPSBT(hex.decode(psbtHex));
}

/**
 * Build an unsigned Taproot PSBT ready for signing.
 *
 * This function constructs the PSBT with all inputs and outputs but does NOT
 * sign it. The returned hex can be passed to any signer (local nsec, NIP-07
 * extension, or NIP-46 remote signer).
 *
 * @param senderPubkeyHex 32-byte hex x-only public key of the sender.
 * @param toAddress       Recipient Bitcoin address.
 * @param amountSats      Amount to send in satoshis.
 * @param utxos           Available UTXOs (all will be consumed).
 * @param feeRate         Fee rate in sat/vB.
 */
export function buildUnsignedPsbt(
  senderPubkeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  const internalPubkey = hex.decode(senderPubkeyHex);

  // Derive change address (same Taproot address as sender)
  const senderPayment = btc.p2tr(internalPubkey, undefined, NETWORK);
  const changeAddress = senderPayment.address;
  if (!changeAddress) throw new Error('Failed to derive change address');

  // Build PSBT, add all UTXOs as inputs
  const tx = new btc.Transaction();
  let totalInput = 0;

  for (const utxo of utxos) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: senderPayment.script,
        amount: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    totalInput += utxo.value;
  }

  // Estimate fee — first assume 2 outputs (recipient + change). Change at the
  // dust limit exactly is still standard, so use >= (not >) per BIP-141/P2TR
  // relay policy (minimum non-dust output is 546 sats).
  const change2Out = totalInput - amountSats - estimateFee(utxos.length, 2, feeRate);
  const hasChange = change2Out >= DUST_LIMIT;
  const numOutputs = hasChange ? 2 : 1;
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(amountSats + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  // Add outputs
  tx.addOutputAddress(toAddress, BigInt(amountSats), NETWORK);

  if (hasChange) {
    tx.addOutputAddress(changeAddress, BigInt(change), NETWORK);
  }

  return { psbtHex: txToPsbtHex(tx), fee };
}

/** Compare two `Uint8Array`s for value equality. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Sign a PSBT locally using a raw private key (nsec).
 *
 * `@scure/btc-signer.signIdx` accepts the raw 32-byte private scalar and,
 * when the input carries a `tapInternalKey`, internally applies the BIP-341
 * TapTweak and produces a Schnorr key-path signature. (For our use case
 * there is no script tree, so the merkle root is empty.)
 *
 * @param psbtHex       Hex-encoded unsigned PSBT.
 * @param privateKeyHex 32-byte hex private key.
 * @returns Hex-encoded signed PSBT (not finalized).
 */
export function signPsbtLocal(psbtHex: string, privateKeyHex: string): string {
  const tx = psbtFromHex(psbtHex);

  const privKey = hex.decode(privateKeyHex);
  const xonly = schnorr.getPublicKey(privKey);

  // Per the NIP spec: inputs whose `tapInternalKey` does not match the
  // signer's x-only pubkey MUST be left unchanged. This matters for future
  // multi-signer PSBTs; today `buildUnsignedPsbt` only ever adds the user's
  // own UTXOs, so in practice every input matches.
  let signedAny = false;
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const inputInternalKey = input.tapInternalKey;
    if (!inputInternalKey || !bytesEqual(inputInternalKey, xonly)) {
      continue;
    }
    if (tx.signIdx(privKey, i)) {
      signedAny = true;
    }
  }

  if (!signedAny) {
    throw new Error('No inputs in this PSBT are owned by the signer.');
  }

  return txToPsbtHex(tx);
}

/**
 * Finalize a signed PSBT and extract the raw transaction hex.
 *
 * @param psbtHex Hex-encoded signed PSBT.
 * @returns Raw transaction hex ready for broadcast.
 */
export function finalizePsbt(psbtHex: string): string {
  const tx = psbtFromHex(psbtHex);
  tx.finalize();
  return hex.encode(tx.extract());
}

/**
 * Create, sign, and return a raw Bitcoin Taproot transaction.
 *
 * Convenience wrapper that calls {@link buildUnsignedPsbt},
 * {@link signPsbtLocal}, and {@link finalizePsbt} in sequence.
 *
 * @param privateKeyHex 32-byte hex private key (from Nostr nsec).
 * @param toAddress     Recipient Bitcoin address.
 * @param amountSats    Amount to send in satoshis.
 * @param utxos         Available UTXOs (all will be consumed).
 * @param feeRate       Fee rate in sat/vB.
 * @returns The signed transaction hex and the fee paid.
 */
export function createBitcoinTransaction(
  privateKeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): { txHex: string; fee: number } {
  // Derive the x-only pubkey from the private key for buildUnsignedPsbt
  const privKey = hex.decode(privateKeyHex);
  const senderPubkeyHex = hex.encode(schnorr.getPublicKey(privKey));

  const { psbtHex, fee } = buildUnsignedPsbt(senderPubkeyHex, toAddress, amountSats, utxos, feeRate);
  const signedHex = signPsbtLocal(psbtHex, privateKeyHex);
  const txHex = finalizePsbt(signedHex);

  return { txHex, fee };
}
