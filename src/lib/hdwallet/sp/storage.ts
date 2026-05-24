import { bytesToHex, hexToBytes } from './crypto';
import type { SPMatchedUtxo } from './scanner';

// ---------------------------------------------------------------------------
// Persisted silent-payment UTXO state — Agora NIP-78 codec
// ---------------------------------------------------------------------------
//
// The HD wallet's discovered SP UTXOs are persisted as an addressable
// **NIP-78** event (kind 30078) whose `content` is a NIP-44-encrypted JSON
// document. NIP-78 is "Application-specific data" — the natural home for
// per-user, per-app state that should sync across devices via the user's
// relays.
//
// Why NIP-78 (and not the legacy `useSecureLocalStorage` cursor we use for
// the receive-address pointer):
//
//   - SP scanning is *expensive* — a deep history scan may pull thousands of
//     blocks from a BIP-352 indexer. Storing the result on relays means a
//     fresh install / new device gets balance + history immediately without
//     re-scanning. The local cursor is a UX preference; this is wallet state.
//   - The encrypted payload contains per-output BIP-352 tweaks (`tₖ`),
//     which a hostile relay operator could in principle correlate with
//     on-chain outputs if they leaked. NIP-44 encryption to the user's own
//     pubkey closes that window.
//
// We deliberately do NOT use the Ditto NIP-SP kinds (10352 declaration, 10353
// encrypted UTXO set) here:
//
//   - Kind 10352 publishes the wallet's `(Bscan, Bspend)` so others can send
//     SP payments to the user's npub. Agora's `sp1q…` address is already
//     displayed in the receive UI; publishing 10352 is a separate sender-side
//     concern we don't take on for receive-only.
//   - Kind 10353 is the Ditto-specific encrypted UTXO state and shares the
//     same purpose as this event, but the schemas differ (Ditto stores tweaks
//     and labels in inner *tags*; we store them as JSON for simpler versioning
//     and forward-compatibility, at the cost of slightly larger ciphertext).
//
// Event shape:
//
//   kind:    30078
//   d-tag:   `${appId}/hdwallet/sp-utxos`         // e.g. "agora/hdwallet/sp-utxos"
//   tags:    [['d', ...], ['title', ...], ['client', ...]]
//   content: NIP-44( JSON.stringify(SPStorageDocument) )
// ---------------------------------------------------------------------------

/** Current document schema version. Bump on breaking changes. */
export const SP_STORAGE_VERSION = 1;

/** Stable d-tag suffix appended to `appId` to form the full NIP-78 d-tag. */
const SP_STORAGE_D_TAG_SUFFIX = 'hdwallet/sp-utxos';

/** Build the full d-tag for the given appId, e.g. `"agora/hdwallet/sp-utxos"`. */
export function spStorageDTag(appId: string): string {
  return `${appId}/${SP_STORAGE_D_TAG_SUFFIX}`;
}

/** One persisted silent-payment UTXO entry. */
export interface SPStoredUtxo {
  /** Lowercase 64-char hex transaction id. */
  txid: string;
  /** Output index. */
  vout: number;
  /** Value in satoshis. */
  value: number;
  /** Block height the UTXO was mined at. */
  height: number;
  /** 32-byte BIP-352 tweak `tₖ`, lowercase hex. Needed at spend time. */
  tweak: string;
  /** Per-tx output index within the SP output set (`k = 0, 1, …`). */
  k: number;
  /**
   * Real block timestamp in unix seconds, sourced from Blockbook's `getBlock`.
   * Optional for backward compatibility — pre-2026 docs were written without
   * this field, and the wallet falls back to a synthetic estimate from
   * `height` when it's missing. New writes always populate it; the
   * orchestrator backfills missing entries opportunistically on scan.
   */
  time?: number;
}

/** The full persisted document, after NIP-44 decrypt + JSON parse. */
export interface SPStorageDocument {
  /** Schema version. Always `SP_STORAGE_VERSION` for newly-written docs. */
  version: number;
  /**
   * The highest *fully-scanned* block height. Forward scans should resume at
   * `scanHeight + 1`. `0` means "never scanned".
   */
  scanHeight: number;
  /** All discovered SP UTXOs the wallet still considers spendable. */
  utxos: SPStoredUtxo[];
  /**
   * SP UTXOs that have been confirmed spent (either by the local send flow
   * or by the manual reconcile pass). Retained here — rather than deleted —
   * so the transaction-history UI can still show the original receive, and
   * the Blockbook-tx classifier can attribute later spends correctly
   * (Blockbook can't tell us an input came from our wallet for SP inputs,
   * because their scriptpubkey isn't under the xpub).
   *
   * Optional for backward compatibility with pre-archive docs; readers
   * should default to `[]`.
   */
  spent?: SPStoredUtxo[];
}

/** Empty document used as the starting state. */
export const EMPTY_SP_STORAGE: SPStorageDocument = {
  version: SP_STORAGE_VERSION,
  scanHeight: 0,
  utxos: [],
  spent: [],
};

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

/**
 * Parse a decrypted JSON string into an `SPStorageDocument`. Returns the
 * empty document on any error rather than throwing, so a corrupted relay
 * payload doesn't break the wallet — a fresh scan recovers state.
 */
export function parseSPStorage(plaintext: string): SPStorageDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    return { ...EMPTY_SP_STORAGE };
  }
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SP_STORAGE };
  const obj = raw as Record<string, unknown>;
  const scanHeight = typeof obj.scanHeight === 'number' && Number.isInteger(obj.scanHeight) && obj.scanHeight >= 0
    ? obj.scanHeight
    : 0;
  const utxos = parseUtxoArray(obj.utxos);
  const spent = parseUtxoArray(obj.spent);
  return { version: SP_STORAGE_VERSION, scanHeight, utxos, spent };
}

/** Shared validator for both the active and archived UTXO lists. */
function parseUtxoArray(raw: unknown): SPStoredUtxo[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: SPStoredUtxo[] = [];
  for (const u of rows) {
    if (!u || typeof u !== 'object') continue;
    const row = u as Record<string, unknown>;
    if (typeof row.txid !== 'string' || !/^[0-9a-f]{64}$/.test(row.txid)) continue;
    if (typeof row.vout !== 'number' || !Number.isInteger(row.vout) || row.vout < 0) continue;
    if (typeof row.value !== 'number' || !Number.isInteger(row.value) || row.value < 0) continue;
    if (typeof row.height !== 'number' || !Number.isInteger(row.height) || row.height < 0) continue;
    if (typeof row.tweak !== 'string' || !/^[0-9a-f]{64}$/.test(row.tweak)) continue;
    if (typeof row.k !== 'number' || !Number.isInteger(row.k) || row.k < 0) continue;
    const time =
      typeof row.time === 'number' && Number.isInteger(row.time) && row.time > 0
        ? row.time
        : undefined;
    out.push({
      txid: row.txid,
      vout: row.vout,
      value: row.value,
      height: row.height,
      tweak: row.tweak,
      k: row.k,
      ...(time !== undefined ? { time } : {}),
    });
  }
  return out;
}

/** Serialise a document for encryption — pretty-printed for slightly better diff-ability. */
export function serializeSPStorage(doc: SPStorageDocument): string {
  return JSON.stringify({
    version: SP_STORAGE_VERSION,
    scanHeight: doc.scanHeight,
    utxos: doc.utxos,
    // Always emit `spent` (as `[]` when empty) so downstream consumers can
    // rely on it being present after a round-trip.
    spent: doc.spent ?? [],
  });
}

// ---------------------------------------------------------------------------
// UTXO helpers (pure-data ops; no I/O)
// ---------------------------------------------------------------------------

/** Convert a freshly-discovered match into the persisted hex form. */
export function matchedUtxoToStored(m: SPMatchedUtxo): SPStoredUtxo {
  return {
    txid: m.txid,
    vout: m.vout,
    value: m.value,
    height: m.height,
    tweak: bytesToHex(m.tweak),
    k: m.k,
  };
}

/**
 * Merge a batch of newly-discovered UTXOs into the persisted set, de-duplicated
 * by `(txid, vout)`. New entries overwrite existing ones with the same key —
 * useful if a re-scan corrects a previously-mis-recorded height/value. The
 * one exception: if the new entry has no `time` but the existing one does,
 * the existing `time` is preserved (a re-scan without a Blockbook lookup
 * shouldn't undo a previously-backfilled real timestamp).
 */
export function mergeUtxos(
  existing: ReadonlyArray<SPStoredUtxo>,
  fresh: ReadonlyArray<SPStoredUtxo>,
): SPStoredUtxo[] {
  const key = (u: SPStoredUtxo) => `${u.txid}:${u.vout}`;
  const map = new Map<string, SPStoredUtxo>();
  for (const u of existing) map.set(key(u), u);
  for (const u of fresh) {
    const k = key(u);
    const prior = map.get(k);
    if (prior && prior.time !== undefined && u.time === undefined) {
      map.set(k, { ...u, time: prior.time });
    } else {
      map.set(k, u);
    }
  }
  return Array.from(map.values());
}

/** Total satoshi balance across all stored UTXOs. */
export function spStorageBalance(doc: SPStorageDocument): number {
  let total = 0;
  for (const u of doc.utxos) total += u.value;
  return total;
}

/**
 * Remove the given `(txid, vout)` entries from a UTXO list. Used after a
 * successful spend to drop the SP UTXOs the wallet just consumed — without
 * this, `spStorageBalance` would still count them, the coin selector would
 * still treat them as spendable, and the wallet's overall balance would
 * appear to *increase* after the spend (because the BIP-86 change output
 * lands in Blockbook's xpub balance while the consumed SP entries remain
 * locally tracked). Matching the published-document semantics here keeps
 * other devices in sync via the next NIP-78 republish.
 */
export function pruneSpUtxos(
  existing: ReadonlyArray<SPStoredUtxo>,
  spent: ReadonlyArray<{ txid: string; vout: number }>,
): SPStoredUtxo[] {
  if (spent.length === 0) return existing.slice();
  const spentKeys = new Set(spent.map((s) => `${s.txid}:${s.vout}`));
  return existing.filter((u) => !spentKeys.has(`${u.txid}:${u.vout}`));
}

/**
 * Move the given `(txid, vout)` entries from a document's active `utxos`
 * list to its `spent` archive, deduplicated against any existing archive
 * entries.
 *
 * The archive is what powers the receive-history row for outputs we no
 * longer hold AND the send-vs-receive classifier in
 * `buildHdTransactions` (a Blockbook tx whose input is one of our
 * archived SP UTXOs is a send, not a receive of change).
 *
 * Entries listed in `spent` that aren't in `existing.utxos` are silently
 * skipped — the active set wins as the source of truth for what to move.
 */
export function archiveSpentUtxos(
  doc: SPStorageDocument,
  spent: ReadonlyArray<{ txid: string; vout: number }>,
): SPStorageDocument {
  if (spent.length === 0) return doc;
  const spentKeys = new Set(spent.map((s) => `${s.txid}:${s.vout}`));
  const remaining: SPStoredUtxo[] = [];
  const toArchive: SPStoredUtxo[] = [];
  for (const u of doc.utxos) {
    if (spentKeys.has(`${u.txid}:${u.vout}`)) {
      toArchive.push(u);
    } else {
      remaining.push(u);
    }
  }
  if (toArchive.length === 0) return doc;

  // Deduplicate the archive by `(txid, vout)`, keeping the existing entry
  // when both exist (preserves any timestamps backfilled previously).
  const existingArchive = doc.spent ?? [];
  const archiveByKey = new Map<string, SPStoredUtxo>();
  for (const u of existingArchive) archiveByKey.set(`${u.txid}:${u.vout}`, u);
  for (const u of toArchive) {
    const k = `${u.txid}:${u.vout}`;
    if (!archiveByKey.has(k)) archiveByKey.set(k, u);
  }

  return {
    version: SP_STORAGE_VERSION,
    scanHeight: doc.scanHeight,
    utxos: remaining,
    spent: Array.from(archiveByKey.values()),
  };
}

// Re-export hex helpers for callers that want to read tweak bytes back.
export { hexToBytes, bytesToHex };
