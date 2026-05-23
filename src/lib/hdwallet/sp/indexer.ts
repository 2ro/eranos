import { hexToBytes } from './crypto';
import type { ScanTweakEntry } from './scanner';

// ---------------------------------------------------------------------------
// BIP-352 tweak-data indexer client — BlindBit Oracle v2 backend
// ---------------------------------------------------------------------------
//
// The HD wallet's silent-payment scan path (BIP-352 §"Scanning", NIP-SP §5.1)
// expects an external indexer that exposes only PUBLIC per-tx tweak data, so
// the wallet completes the ECDH locally with `bscan` (which MUST NOT leave
// the device).
//
// Endpoints consumed:
//
//   GET /info                   → { network, height, ... }
//   GET /tweaks/:blockheight    → string[]  (33-byte compressed tweaks, hex)
//   GET /utxos/:blockheight     → Array<{ txid, vout, value, scriptpubkey, spent, ... }>
//
// Why we need BOTH /tweaks and /utxos per block:
// BlindBit's /tweaks payload is intentionally minimal — just the list of
// public tweaks for the block, no txid↔tweak mapping and no outputs. We pair
// each tweak with the block's full SP-eligible UTXO set (`/utxos/:height`)
// and let the BIP-352 math match `Pₖ` against the right output; an unrelated
// UTXO has only a ~2⁻²⁵⁶ chance of accidentally matching a derived `Pₖ`.
//
// `spent: true` rows in /utxos are filtered out so a fresh scan doesn't
// briefly add already-spent UTXOs to the wallet's persisted SP set.
//
// The base URL is configurable via `AppConfig.bip352IndexerUrl`. When unset
// the wallet's scan UI is hidden and no calls are made.
// ---------------------------------------------------------------------------

interface BlindBitInfoResponse {
  network?: unknown;
  height?: unknown;
}

interface BlindBitUtxoRow {
  txid?: unknown;
  vout?: unknown;
  value?: unknown;
  scriptpubkey?: unknown;
  spent?: unknown;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function isHexString(v: unknown, lenChars: number): v is string {
  return typeof v === 'string' && v.length === lenChars && /^[0-9a-fA-F]+$/.test(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Extract the 32-byte x-only key from a P2TR scriptPubKey (`OP_1 OP_PUSH32 <xonly>`).
 * Returns null for any other script — BlindBit only indexes Taproot outputs,
 * so a non-P2TR row is treated as malformed and skipped.
 */
function xonlyFromP2trScriptPubKey(spk: string): Uint8Array | null {
  if (spk.length !== 68) return null;
  if (!spk.toLowerCase().startsWith('5120')) return null;
  try {
    return hexToBytes(spk.slice(4));
  } catch {
    return null;
  }
}

interface ParsedUtxo {
  txid: string;
  vout: number;
  xonlyPk: Uint8Array;
  value: number;
  /**
   * True if BlindBit marked this row as already spent at the time of fetch.
   * The default scan path filters these out; the "include spent" path keeps
   * them so historical receives whose UTXOs were later spent can be
   * recovered into the archive (and used by the tx classifier to attribute
   * the spending tx as a send).
   */
  spent: boolean;
}

function parseUtxoRow(raw: BlindBitUtxoRow): ParsedUtxo | null {
  if (!isHexString(raw.txid, 64)) return null;
  if (!isInt(raw.vout)) return null;
  if (!isInt(raw.value)) return null;
  if (typeof raw.scriptpubkey !== 'string') return null;
  const xonly = xonlyFromP2trScriptPubKey(raw.scriptpubkey);
  if (!xonly) return null;
  return {
    txid: (raw.txid as string).toLowerCase(),
    vout: raw.vout,
    xonlyPk: xonly,
    value: raw.value,
    spent: raw.spent === true,
  };
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function requireBase(url: string): string {
  const root = trimBase(url);
  if (!root) throw new Error('BIP-352 indexer base URL must not be empty');
  return root;
}

// ---------------------------------------------------------------------------
// Per-block fetchers
// ---------------------------------------------------------------------------

async function fetchTweaksForBlock(
  root: string,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array[]> {
  const r = await fetch(`${root}/tweaks/${height}`, { signal });
  if (!r.ok) throw new Error(`BIP-352 /tweaks/${height} returned ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) {
    throw new Error(`BIP-352 /tweaks/${height} response is not an array`);
  }
  const out: Uint8Array[] = [];
  for (const v of data) {
    if (!isHexString(v, 66)) continue;
    try {
      out.push(hexToBytes((v as string).toLowerCase()));
    } catch {
      // Skip malformed entries — one bad tweak shouldn't sink the block.
    }
  }
  return out;
}

async function fetchUtxosForBlock(
  root: string,
  height: number,
  signal?: AbortSignal,
  includeSpent = false,
): Promise<ParsedUtxo[]> {
  const r = await fetch(`${root}/utxos/${height}`, { signal });
  if (!r.ok) throw new Error(`BIP-352 /utxos/${height} returned ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) {
    throw new Error(`BIP-352 /utxos/${height} response is not an array`);
  }
  const out: ParsedUtxo[] = [];
  for (const raw of data as BlindBitUtxoRow[]) {
    // Default: filter out already-spent rows so we don't add them to the
    // wallet's active UTXO set just to have a future reconcile pass prune
    // them. The "recover history" flow flips this filter off so the
    // scanner can identify outputs we received and then later spent, and
    // route them into the `spent` archive.
    if (!includeSpent && raw && raw.spent === true) continue;
    const parsed = parseUtxoRow(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the indexer's current tip height via `GET /info`. Cheap call —
 * a single HTTP round-trip and a small JSON response.
 */
export async function fetchTipHeight(baseUrl: string, signal?: AbortSignal): Promise<number> {
  const root = requireBase(baseUrl);
  const r = await fetch(`${root}/info`, { signal });
  if (!r.ok) throw new Error(`BIP-352 /info returned ${r.status}`);
  const data = (await r.json()) as BlindBitInfoResponse;
  const h = data.height;
  if (!isInt(h)) throw new Error('BIP-352 /info response missing valid `height`');
  return h;
}

/**
 * Fetch the `ScanTweakEntry[]` for ONE block: one entry per tweak, each
 * sharing the block's full SP-eligible UTXO set as candidate outputs.
 *
 * The scanner matches each tweak's derived `Pₖ` against the pooled outputs
 * and records the matched UTXO's own txid (per-output) — so attribution is
 * correct even though the `/tweaks/:height` endpoint loses the tweak ↔ txid
 * mapping.
 *
 * Optimisations:
 *   - When `/tweaks/:height` is empty we skip the `/utxos/:height` call.
 *     Empty blocks are common in mainnet history; this halves the request
 *     count on average.
 *   - All entries share one `outputs` array (read-only) so we don't duplicate
 *     per-output bytes across N tweaks in the same block.
 */
export async function fetchBlockEntries(
  baseUrl: string,
  height: number,
  signal?: AbortSignal,
  includeSpent = false,
): Promise<ScanTweakEntry[]> {
  const root = requireBase(baseUrl);
  const tweaks = await fetchTweaksForBlock(root, height, signal);
  if (tweaks.length === 0) return [];
  if (signal?.aborted) return [];
  const utxos = await fetchUtxosForBlock(root, height, signal, includeSpent);
  if (utxos.length === 0) return [];

  const sharedOutputs: ScanTweakEntry['outputs'] = utxos;
  return tweaks.map((tweak) => ({
    height,
    tweak,
    outputs: sharedOutputs,
  }));
}
