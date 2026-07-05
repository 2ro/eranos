import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Grin-only content policy.
 *
 * Eranos federates with foreign relays, but the product is a Grin-only
 * fundraising surface: Bitcoin / Lightning money rails are not welcome. This
 * pure module is the single chokepoint that enforces that — modeled on
 * {@link isEventMuted} (a pure predicate, no I/O). It is applied at feed ingest
 * (drop) and at render (guard), and its {@link sanitizeText} is applied to
 * decrypted DM content before it reaches the UI.
 *
 * HARD BOUNDARY — this targets BITCOIN / LIGHTNING money rails ONLY.
 * Grin slatepacks (`BEGINSLATEPACK…ENDSLATEPACK`), Goblin payment messages, and
 * every Grin campaign kind — 33863 campaigns, 36639 pledges, 3414 payment
 * proofs — pass through completely untouched. This module must never know about
 * or act on Grin machinery. See grinOnlyPolicy.test.ts for the boundary tests.
 */

// ── Dropped kinds ─────────────────────────────────────────────────────────────

/**
 * Event kinds dropped outright at ingest / render. These are the Bitcoin /
 * Lightning money-rail kinds:
 * - 9041 — NIP-75 fundraising goal (denominated in Lightning millisats / zaps)
 * - 9734 — NIP-57 zap request
 * - 9735 — NIP-57 zap receipt
 */
const DROPPED_KINDS = new Set<number>([9041, 9734, 9735]);

/**
 * True if the event is a Bitcoin / Lightning money-rail kind that must be
 * dropped from feeds and never rendered. Purely kind-based; does not inspect or
 * touch Grin campaign kinds (33863 / 36639 / 3414), which are always allowed.
 */
export function violatesGrinOnly(event: NostrEvent): boolean {
  return DROPPED_KINDS.has(event.kind);
}

// ── Text sanitization ─────────────────────────────────────────────────────────

/** Placeholder that replaces a redacted Lightning money-rail token in text. */
export const REDACTION_PLACEHOLDER = '[lightning payment removed]';

/**
 * Grin slatepack block. Extracted and protected verbatim before sanitization so
 * that no money-rail pattern can ever alter slatepack payload bytes, regardless
 * of what those bytes happen to spell.
 */
const SLATEPACK_BLOCK = /BEGINSLATEPACK[\s\S]*?ENDSLATEPACK\.?/g;

/** Internal sentinel wrapping a protected slatepack index during sanitization. */
const SLATEPACK_SENTINEL_PREFIX = 'GRINSLATEPACKPROTECTED';
const SLATEPACK_SENTINEL_SUFFIX = 'ENDPROTECTED';

/**
 * Serialized Bitcoin / Lightning money-rail tokens to redact from free text.
 * These match the encoded payment strings themselves — NOT prose that merely
 * mentions the words "bitcoin" or "lightning".
 */
const MONEY_RAIL_PATTERNS: RegExp[] = [
  // lightning: URI scheme (may wrap a bolt11 or lnurl payload)
  /\blightning:(?:\/\/)?[0-9a-z]+/gi,
  // bolt11 invoices: lnbc / lntb / lntbs / lnbcrt prefix + amount/data payload
  /\bln(?:bcrt|tbs|bc|tb)[0-9][0-9a-z]+/gi,
  // LNURL bech32 strings
  /\blnurl1[0-9a-z]+/gi,
];

/**
 * Redact serialized Lightning money-rail tokens (bolt11 invoices, lnurl
 * strings, `lightning:` URIs) from free text, replacing each token with
 * {@link REDACTION_PLACEHOLDER} while keeping the surrounding text intact.
 *
 * Grin slatepack blocks are protected and returned byte-for-byte unchanged.
 * Prose that merely mentions "bitcoin" / "lightning" as words is not touched.
 */
export function sanitizeText(text: string): string {
  if (!text) return text;

  // Protect Grin slatepack blocks: pull them out, sanitize the rest, restore.
  const slatepacks: string[] = [];
  let out = text.replace(SLATEPACK_BLOCK, (match) => {
    slatepacks.push(match);
    return `${SLATEPACK_SENTINEL_PREFIX}${slatepacks.length - 1}${SLATEPACK_SENTINEL_SUFFIX}`;
  });

  for (const pattern of MONEY_RAIL_PATTERNS) {
    out = out.replace(pattern, REDACTION_PLACEHOLDER);
  }

  // Restore protected slatepack blocks verbatim.
  const restore = new RegExp(
    `${SLATEPACK_SENTINEL_PREFIX}(\\d+)${SLATEPACK_SENTINEL_SUFFIX}`,
    'g',
  );
  out = out.replace(restore, (_m, i) => slatepacks[Number(i)]);
  return out;
}

// ── Profile guard ─────────────────────────────────────────────────────────────

/**
 * Strip Lightning address fields (lud06 / lud16) from a kind-0 profile metadata
 * object at the render guard, if they ever appear. Returns the object unchanged
 * when neither field is present (the common case). Never touches any other
 * field, so Grin / Goblin profile fields are preserved.
 */
export function stripLightningProfileFields<T extends Record<string, unknown>>(metadata: T): T {
  if (!metadata || (!('lud06' in metadata) && !('lud16' in metadata))) {
    return metadata;
  }
  const { lud06: _lud06, lud16: _lud16, ...rest } = metadata as Record<string, unknown>;
  return rest as T;
}
