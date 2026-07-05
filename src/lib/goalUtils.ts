import type { NostrEvent } from '@nostrify/nostrify';

import { parseATagCoordinate } from '@/lib/nostrEvents';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Kind constant ─────────────────────────────────────────────────────────────

/**
 * NIP-75 fundraising goal (kind 9041, regular event).
 *
 * DEAD CODE (Grin-only federation): kind 9041 is a Lightning money-rail kind
 * now dropped at feed ingest / NoteCard render by grinOnlyPolicy.ts, so
 * parseGoalEvent / formatSats no longer surface in the UI. Kept (not deleted)
 * to keep the revert diff small — removal ripples through GoalCard,
 * useGoalDisplay, and several call sites.
 */
const GOAL_KIND = 9041;

function normalizeRelayUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

// ── Parsed goal ───────────────────────────────────────────────────────────────

export interface ParsedGoal {
  /** Human-readable title (the event `content`). */
  title: string;
  /** Target amount in millisatoshis. */
  amountMsat: number;
  /** Target amount in satoshis (convenience). */
  amountSats: number;
  /** Relay URLs for tallying donations. */
  relays: string[];
  /** Optional deadline timestamp (unix seconds). */
  closedAt?: number;
  /** Optional sanitized image URL. */
  image?: string;
  /** Optional short summary. */
  summary?: string;
  /** If the goal links to a community, the `a` tag coordinate. */
  communityATag?: string;
  /** The pubkey receiving donations (event author). */
  beneficiary: string;
}

/**
 * Parse a kind 9041 fundraising goal event into structured data.
 * Returns `null` if the event is invalid or missing required tags.
 */
export function parseGoalEvent(event: NostrEvent): ParsedGoal | null {
  if (event.kind !== GOAL_KIND) return null;

  const title = event.content.trim();
  if (!title) return null;

  // Required: amount tag (millisats)
  const amountStr = event.tags.find(([n]) => n === 'amount')?.[1];
  if (!amountStr) return null;
  const amountMsat = parseInt(amountStr, 10);
  if (isNaN(amountMsat) || amountMsat <= 0) return null;

  // Relays tag — preferred but not required. When empty, the goal progress
  // hook falls back to the user's configured relays.
  const relaysTag = event.tags.find(([n]) => n === 'relays');
  const relays = relaysTag
    ? [...new Set(relaysTag.slice(1).map(normalizeRelayUrl).filter((v): v is string => !!v))]
    : [];

  // Optional tags
  const closedAtStr = event.tags.find(([n]) => n === 'closed_at')?.[1];
  const closedAt = closedAtStr ? parseInt(closedAtStr, 10) : undefined;

  const rawImage = event.tags.find(([n]) => n === 'image')?.[1];
  const image = sanitizeUrl(rawImage);

  const summary = event.tags.find(([n]) => n === 'summary')?.[1] || undefined;

  // Check for community link (a tag pointing to kind 34550)
  const communityATag = event.tags
    .find(([n, v]) => n === 'a' && v?.startsWith('34550:'))?.[1];

  return {
    title,
    amountMsat,
    amountSats: Math.floor(amountMsat / 1000),
    relays,
    closedAt: closedAt && !isNaN(closedAt) ? closedAt : undefined,
    image: image || undefined,
    summary,
    communityATag,
    beneficiary: event.pubkey,
  };
}

/** Check whether a goal's deadline has passed. */
export function isGoalExpired(goal: ParsedGoal): boolean {
  if (!goal.closedAt) return false;
  return Math.floor(Date.now() / 1000) > goal.closedAt;
}

/** Format satoshis with locale-aware separators. */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Parse a community `a` tag coordinate (`34550:<pubkey>:<d-tag>`) into its
 * constituent parts. Returns `undefined` if the format is invalid or the kind
 * is not 34550.
 */
export function parseCommunityATag(aTag: string): { kind: number; pubkey: string; identifier: string } | undefined {
  const addr = parseATagCoordinate(aTag);
  if (!addr || addr.kind !== 34550) return undefined;
  return addr;
}
