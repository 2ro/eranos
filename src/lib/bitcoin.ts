import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { nip19 } from 'nostr-tools';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairAPI } from 'ecpair';

const MEMPOOL_API = 'https://mempool.space/api';
export const BITCOIN_DUST_LIMIT = 546;
const VBYTES_PER_INPUT = 57.5;
const VBYTES_PER_OUTPUT = 43;
const VBYTES_OVERHEAD = 10.5;

let _ECPair: ECPairAPI | null = null;
let eccInitialized = false;

function initBitcoinEcc(): void {
  if (eccInitialized) return;
  bitcoin.initEccLib(ecc);
  eccInitialized = true;
}

function getECPair(): ECPairAPI {
  initBitcoinEcc();
  if (!_ECPair) {
    _ECPair = ECPairFactory(ecc);
  }
  return _ECPair;
}

function isValidPubkeyHex(hex: string): boolean {
  return typeof hex === 'string' && /^[0-9a-fA-F]{64}$/.test(hex);
}

export function nostrPubkeyToBitcoinAddress(pubkeyHex: string): string {
  if (!isValidPubkeyHex(pubkeyHex)) return '';

  try {
    initBitcoinEcc();
    const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');
    const { address } = bitcoin.payments.p2tr({
      internalPubkey: pubkeyBuffer,
      network: bitcoin.networks.bitcoin,
    });

    return address || '';
  } catch (error) {
    console.error('Error generating Bitcoin address:', error);
    return '';
  }
}

export function npubToBitcoinAddress(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return nostrPubkeyToBitcoinAddress(decoded.data);
}

export interface AddressData {
  balance: number;
  pendingBalance: number;
  totalBalance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  pendingTxCount: number;
}

export async function fetchAddressData(address: string): Promise<AddressData> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}`);

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

export function satsToBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

export function formatBTC(sats: number): string {
  return satsToBTC(sats).replace(/\.?0+$/, '');
}

export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

export async function fetchBtcPrice(): Promise<number> {
  const response = await fetch(`${MEMPOOL_API}/v1/prices`);

  if (!response.ok) {
    throw new Error('Failed to fetch BTC price');
  }

  const data = await response.json();
  return data.USD;
}

export function btcToSats(btc: number): number {
  return Math.round(btc * 100_000_000);
}

export const LARGE_AMOUNT_USD_THRESHOLD = 100;

export function isLargeAmount(sats: number, btcPrice: number | undefined): boolean {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return false;
  if (!Number.isFinite(sats) || sats <= 0) return false;
  const usd = (sats / 100_000_000) * btcPrice;
  return usd >= LARGE_AMOUNT_USD_THRESHOLD;
}

export function satsToUSD(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Like {@link satsToUSD} but rounded to the nearest whole dollar (no cents).
 * Use for zap goal / campaign progress displays where cents are visual noise.
 */
export function satsToUSDWhole(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function usdToSats(usd: number, btcPrice: number | undefined): number {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return 0;
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round((usd / btcPrice) * 100_000_000);
}

export interface Transaction {
  txid: string;
  amount: number;
  type: 'receive' | 'send';
  confirmed: boolean;
  timestamp?: number;
}

export async function fetchTransactions(address: string): Promise<Transaction[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/txs`);

  if (!response.ok) {
    throw new Error('Failed to fetch transactions');
  }

  const txs = await response.json();

  return txs.map((tx: Record<string, unknown>) => {
    const vin = tx.vin as Array<{ prevout: { scriptpubkey_address?: string; value: number } | null }>;
    const vout = tx.vout as Array<{ scriptpubkey_address?: string; value: number }>;
    const status = tx.status as { confirmed: boolean; block_time?: number };

    const totalIn = vin.reduce((sum, input) => {
      if (input.prevout?.scriptpubkey_address === address) {
        return sum + input.prevout.value;
      }
      return sum;
    }, 0);

    const totalOut = vout.reduce((sum, output) => {
      if (output.scriptpubkey_address === address) {
        return sum + output.value;
      }
      return sum;
    }, 0);

    const net = totalOut - totalIn;

    return {
      txid: tx.txid as string,
      amount: Math.abs(net),
      type: net >= 0 ? 'receive' : 'send',
      confirmed: status.confirmed,
      timestamp: status.block_time,
    } satisfies Transaction;
  });
}

export interface TxInput {
  txid: string;
  vout: number;
  address?: string;
  value: number;
  isCoinbase: boolean;
}

export interface TxOutput {
  address?: string;
  value: number;
  scriptpubkeyType: string;
  spent: boolean;
}

export interface TxDetail {
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
  totalInput: number;
  totalOutput: number;
}

export async function fetchTxDetail(txid: string): Promise<TxDetail> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}`);
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
    spent: false,
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

export interface AddressDetail {
  address: string;
  balance: number;
  pendingBalance: number;
  totalBalance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  pendingTxCount: number;
  recentTxs: Transaction[];
}

export async function fetchAddressDetail(address: string): Promise<AddressDetail> {
  const [addrData, txs] = await Promise.all([
    fetchAddressData(address),
    fetchTransactions(address),
  ]);

  return {
    address,
    ...addrData,
    recentTxs: txs.slice(0, 25),
  };
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
  if (!response.ok) throw new Error('Failed to fetch UTXOs');
  return response.json();
}

export interface FeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export async function getFeeRates(): Promise<FeeRates> {
  const response = await fetch(`${MEMPOOL_API}/fee-estimates`);
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

export function estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
  const vBytes = numInputs * VBYTES_PER_INPUT + numOutputs * VBYTES_PER_OUTPUT + VBYTES_OVERHEAD;
  return Math.ceil(vBytes * feeRate);
}

export function validateBitcoinAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
    return true;
  } catch {
    return false;
  }
}

export async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx`, {
    method: 'POST',
    body: txHex,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Broadcast failed: ${body}`);
  }

  return response.text();
}

export function maxSendable(totalBalance: number, numInputs: number, feeRate: number): number {
  const fee = estimateFee(numInputs, 1, feeRate);
  return Math.max(0, totalBalance - fee);
}

export interface UnsignedPsbt {
  psbtHex: string;
  fee: number;
}

export interface BitcoinPaymentOutput {
  address: string;
  amountSats: number;
}

export function buildUnsignedPsbt(
  senderPubkeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  if (!validateBitcoinAddress(toAddress)) {
    throw new Error(`Invalid Bitcoin address: ${toAddress}`);
  }
  if (!Number.isInteger(amountSats) || amountSats < BITCOIN_DUST_LIMIT) {
    throw new Error(`Bitcoin outputs must be at least ${BITCOIN_DUST_LIMIT} sats.`);
  }

  const internalPubkey = Buffer.from(senderPubkeyHex, 'hex');
  const { address: changeAddress } = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.bitcoin,
  });
  if (!changeAddress) throw new Error('Failed to derive change address');

  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  let totalInput = 0;

  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2tr({
          internalPubkey,
          network: bitcoin.networks.bitcoin,
        }).output!,
        value: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    totalInput += utxo.value;
  }

  const change2Out = totalInput - amountSats - estimateFee(utxos.length, 2, feeRate);
  const hasChange = change2Out >= BITCOIN_DUST_LIMIT;
  const numOutputs = hasChange ? 2 : 1;
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(amountSats + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  psbt.addOutput({ address: toAddress, value: BigInt(amountSats) });

  if (hasChange) {
    psbt.addOutput({ address: changeAddress, value: BigInt(change) });
  }

  return { psbtHex: psbt.toHex(), fee };
}

export function buildUnsignedMultiOutputPsbt(
  senderPubkeyHex: string,
  outputs: BitcoinPaymentOutput[],
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  if (outputs.length === 0) {
    throw new Error('At least one recipient output is required.');
  }

  for (const output of outputs) {
    if (!validateBitcoinAddress(output.address)) {
      throw new Error(`Invalid Bitcoin address: ${output.address}`);
    }
    if (!Number.isInteger(output.amountSats) || output.amountSats < BITCOIN_DUST_LIMIT) {
      throw new Error(`Bitcoin outputs must be at least ${BITCOIN_DUST_LIMIT} sats.`);
    }
  }

  const internalPubkey = Buffer.from(senderPubkeyHex, 'hex');
  const { address: changeAddress } = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.bitcoin,
  });
  if (!changeAddress) throw new Error('Failed to derive change address');

  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  let totalInput = 0;

  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2tr({
          internalPubkey,
          network: bitcoin.networks.bitcoin,
        }).output!,
        value: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    totalInput += utxo.value;
  }

  const totalOutput = outputs.reduce((sum, output) => sum + output.amountSats, 0);
  const feeWithChange = estimateFee(utxos.length, outputs.length + 1, feeRate);
  const changeWithChange = totalInput - totalOutput - feeWithChange;
  const hasChange = changeWithChange >= BITCOIN_DUST_LIMIT;
  const numOutputs = outputs.length + (hasChange ? 1 : 0);
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - totalOutput - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(totalOutput + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  for (const output of outputs) {
    psbt.addOutput({ address: output.address, value: BigInt(output.amountSats) });
  }

  if (hasChange) {
    psbt.addOutput({ address: changeAddress, value: BigInt(change) });
  }

  return { psbtHex: psbt.toHex(), fee };
}

export function signPsbtLocal(psbtHex: string, privateKeyHex: string): string {
  initBitcoinEcc();
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });

  const keyPair = getECPair().fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  const internalPubkey = toXOnly(keyPair.publicKey);

  const tweakedSigner = keyPair.tweak(
    bitcoin.crypto.taggedHash('TapTweak', internalPubkey),
  );

  let signedAny = false;
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const inputInternalKey = input.tapInternalKey;
    if (!inputInternalKey || !Buffer.from(inputInternalKey).equals(Buffer.from(internalPubkey))) {
      continue;
    }
    psbt.signInput(i, tweakedSigner);
    signedAny = true;
  }

  if (!signedAny) {
    throw new Error('No inputs in this PSBT are owned by the signer.');
  }

  return psbt.toHex();
}

export function finalizePsbt(psbtHex: string): string {
  initBitcoinEcc();
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });
  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
}

export function createBitcoinTransaction(
  privateKeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): { txHex: string; fee: number } {
  const keyPair = getECPair().fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  const internalPubkey = toXOnly(keyPair.publicKey);
  const senderPubkeyHex = Buffer.from(internalPubkey).toString('hex');

  const { psbtHex, fee } = buildUnsignedPsbt(senderPubkeyHex, toAddress, amountSats, utxos, feeRate);
  const signedHex = signPsbtLocal(psbtHex, privateKeyHex);
  const txHex = finalizePsbt(signedHex);

  return { txHex, fee };
}
