/**
 * Broadcast-error classification for Bitcoin transactions.
 *
 * Both broadcast paths in the app (`broadcastBlockbookTx` over the
 * Blockbook WebSocket, and `broadcastTransaction` against an Esplora REST
 * `/tx` endpoint) surface `bitcoind`'s `sendrawtransaction` RPC error
 * string verbatim — sometimes wrapped (e.g. `Broadcast failed: <body>` from
 * the Esplora path) and sometimes accompanied by a network-framing string
 * (Blockbook timeout / WebSocket close / abort).
 *
 * Those raw strings are useless to a non-technical donor — "min relay fee
 * not met, 245 < 1000" doesn't tell them what to do. This module maps the
 * canonical bitcoind / mempool reject reasons onto a small enum the UI can
 * use to render an actionable alert with a "bump fee and retry" button.
 *
 * The matcher is intentionally substring-based. bitcoind has shipped
 * dozens of subtly different reject strings over the years (some prefixed
 * with `sendrawtransaction RPC error: …`, some not; some wrapped in JSON,
 * some not) and any node operator can stick their own text on top.
 * Substring matching against the stable "reason code" portions is
 * robust enough without trying to track every framing.
 *
 * When a number pair is parsed out of the canonical
 * `min relay fee not met, <actual> < <minimum>` form we surface both —
 * the UI uses them to display a concrete "current minimum: N sat/vB"
 * hint and, in the HD flow, to seed a custom fee rate.
 */

/**
 * Classified broadcast failure. The UI renders different copy and recovery
 * actions per kind. `network` is for failures that never reached the relay
 * (WebSocket close, timeout, abort); `unknown` is the bucket for anything
 * the classifier doesn't recognize.
 */
export type BroadcastErrorKind =
  | {
    kind: 'feeTooLow';
    /** Parsed minimum-fee figure in sat/vB if the relay surfaced one. */
    minRelayFeeRate?: number;
    /** Parsed actual-fee figure in sat/vB if the relay surfaced one. */
    actualFeeRate?: number;
  }
  | { kind: 'rbfReplacementFeeTooLow' }
  | { kind: 'mempoolFull' }
  | { kind: 'mempoolConflict' }
  | { kind: 'absurdlyHighFee' }
  | { kind: 'tooLongChain' }
  | { kind: 'badInputs' }
  | { kind: 'network' }
  | { kind: 'unknown'; raw: string };

/**
 * The `min relay fee not met, <actual> < <minimum>` form `bitcoind` emits
 * when a tx is below the configured minrelayfee or the live mempool floor.
 * Both numbers are sats-per-1000-vbytes (i.e. sat/kB), but in practice
 * most node operators report them already converted to sat/vB. We pass
 * the values through unchanged and the UI labels them as sat/vB; for
 * mempool.space / Blockstream Esplora this matches user expectations.
 */
const MIN_RELAY_FEE_RE = /min relay fee not met[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*<\s*([0-9]+(?:\.[0-9]+)?)/i;

function parseRawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  try {
    return String(error);
  } catch {
    return '';
  }
}

/**
 * Substring matching is case-insensitive; bitcoind emits lowercase reject
 * reasons but wrapping layers (Esplora's `Broadcast failed:` prefix, our
 * own framing) preserve case as-is.
 */
function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Classify a broadcast error so the UI can render an actionable recovery
 * affordance. Always returns a value; defaults to `{ kind: 'unknown' }`
 * with the original message preserved so callers can fall back to the raw
 * text where useful.
 */
export function classifyBroadcastError(error: unknown): BroadcastErrorKind {
  const raw = parseRawMessage(error);
  if (!raw) return { kind: 'unknown', raw: '' };

  // Network-framing errors emitted by `broadcastBlockbookTx` before the
  // request ever reaches bitcoind. These never carry a bitcoind reject
  // reason so they have to be matched first or we'd mis-bucket them.
  if (
    includesCI(raw, 'WebSocket error')
    || includesCI(raw, 'WebSocket closed')
    || includesCI(raw, 'WebSocket connect timed out')
    || includesCI(raw, 'timed out')
    || includesCI(raw, 'Request aborted')
    || includesCI(raw, 'NetworkError')
    || includesCI(raw, 'Failed to fetch')
  ) {
    return { kind: 'network' };
  }

  // RBF: a replacement tx must pay a higher *absolute* fee AND a higher
  // fee rate than what it replaces. bitcoind emits this exact string.
  if (includesCI(raw, 'insufficient fee, rejecting replacement')) {
    return { kind: 'rbfReplacementFeeTooLow' };
  }

  // Mempool min fee: the node's mempool is at capacity and the floor for
  // accepting new txs has risen above the static minrelayfee. Different
  // root cause from a flat minrelayfee failure but the user-visible fix is
  // the same (raise the fee), so the UI can collapse them if needed —
  // we still classify separately for copy.
  if (includesCI(raw, 'mempool min fee not met')) {
    return { kind: 'mempoolFull' };
  }

  // Canonical fee-too-low. Try to parse the numeric pair; if the format
  // shifted (different node version, custom wrapping, JSON-escaped), the
  // regex falls back to the bare kind without numbers.
  if (includesCI(raw, 'min relay fee not met') || includesCI(raw, 'min_relay_fee_not_met')) {
    const m = raw.match(MIN_RELAY_FEE_RE);
    if (m) {
      const actual = Number(m[1]);
      const minimum = Number(m[2]);
      return {
        kind: 'feeTooLow',
        actualFeeRate: Number.isFinite(actual) ? actual : undefined,
        minRelayFeeRate: Number.isFinite(minimum) ? minimum : undefined,
      };
    }
    return { kind: 'feeTooLow' };
  }

  // bitcoind: "fee rate ... below ... feefilter" or "min fee not met"
  // catch-all for older / non-Core implementations.
  if (
    includesCI(raw, 'fee rate')
    && (includesCI(raw, 'below') || includesCI(raw, 'too low'))
  ) {
    return { kind: 'feeTooLow' };
  }

  // bitcoind dust check fires for outputs below the dust threshold. The
  // resulting reject string varies (`dust`, `bad-txns-out-of-range`) but
  // the user fix is "increase the amount", not the fee — bucket under
  // `badInputs` so the UI doesn't suggest a fee bump.
  if (
    includesCI(raw, 'dust')
    && !includesCI(raw, 'absurdly')
  ) {
    return { kind: 'badInputs' };
  }

  // Sanity ceiling: bitcoind refuses to broadcast a tx whose fee is wildly
  // above the absurd-fee threshold (default 0.1 BTC). Almost always a coin-
  // selection bug; we surface a distinct kind so the UI doesn't suggest
  // "raise the fee further".
  if (includesCI(raw, 'absurdly-high-fee') || includesCI(raw, 'absurdly high fee')) {
    return { kind: 'absurdlyHighFee' };
  }

  // Long unconfirmed chains (default limit: 25 ancestors / descendants).
  // User can't fix this by adjusting the fee on this tx; they need to wait
  // for an ancestor to confirm or use CPFP elsewhere.
  if (
    includesCI(raw, 'too-long-mempool-chain')
    || includesCI(raw, 'too many unconfirmed')
    || includesCI(raw, 'ancestor')
  ) {
    return { kind: 'tooLongChain' };
  }

  // Double-spend / conflict with an existing mempool entry.
  if (
    includesCI(raw, 'txn-mempool-conflict')
    || includesCI(raw, 'replacement-adds-unconfirmed')
    || includesCI(raw, 'missing inputs')
    || includesCI(raw, 'bad-txns-inputs-missingorspent')
  ) {
    return { kind: 'mempoolConflict' };
  }

  // Generic `bad-txns-*` consensus failures. These are unrecoverable from
  // the dialog (the tx itself is malformed) — surface as `badInputs` so the
  // UI tells the user to start over rather than offering a fee bump.
  if (includesCI(raw, 'bad-txns-')) {
    return { kind: 'badInputs' };
  }

  return { kind: 'unknown', raw };
}

/**
 * Convenience: does this kind indicate that bumping the fee on a fresh
 * broadcast would plausibly succeed? Used by the UI to decide whether to
 * surface the "Use a higher fee" CTA.
 */
export function isFeeRecoverable(kind: BroadcastErrorKind['kind']): boolean {
  return (
    kind === 'feeTooLow'
    || kind === 'rbfReplacementFeeTooLow'
    || kind === 'mempoolFull'
  );
}
