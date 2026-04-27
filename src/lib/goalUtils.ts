import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Kind constant ─────────────────────────────────────────────────────────────

/** NIP-75 Zap Goal (regular event). */
export const ZAP_GOAL_KIND = 9041;

// ── Parsed goal ───────────────────────────────────────────────────────────────

export interface ParsedGoal {
  /** Human-readable title (the event `content`). */
  title: string;
  /** Target amount in millisatoshis. */
  amountMsat: number;
  /** Target amount in satoshis (convenience). */
  amountSats: number;
  /** Relay URLs for tallying zaps. */
  relays: string[];
  /** Optional deadline timestamp (unix seconds). */
  closedAt?: number;
  /** Optional sanitized image URL. */
  image?: string;
  /** Optional short summary. */
  summary?: string;
  /** If the goal links to a community, the `a` tag coordinate. */
  communityATag?: string;
  /** The pubkey receiving zaps (event author). */
  beneficiary: string;
}

/**
 * Parse a kind 9041 zap goal event into structured data.
 * Returns `null` if the event is invalid or missing required tags.
 */
export function parseGoalEvent(event: NostrEvent): ParsedGoal | null {
  if (event.kind !== ZAP_GOAL_KIND) return null;

  const title = event.content.trim();
  if (!title) return null;

  // Required: amount tag (millisats)
  const amountStr = event.tags.find(([n]) => n === 'amount')?.[1];
  if (!amountStr) return null;
  const amountMsat = parseInt(amountStr, 10);
  if (isNaN(amountMsat) || amountMsat <= 0) return null;

  // Required: relays tag
  const relaysTag = event.tags.find(([n]) => n === 'relays');
  const relays = relaysTag ? relaysTag.slice(1).filter(Boolean) : [];
  if (relays.length === 0) return null;

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

/** Check whether a goal has been fully funded (current >= target). */
export function isGoalFunded(currentMsat: number, goal: ParsedGoal): boolean {
  return currentMsat >= goal.amountMsat;
}

/** Format satoshis with locale-aware separators. */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Parse a community `a` tag coordinate (`34550:<pubkey>:<d-tag>`) into its
 * constituent parts. Returns `undefined` if the format is invalid.
 */
export function parseCommunityATag(aTag: string): { kind: number; pubkey: string; identifier: string } | undefined {
  const parts = aTag.split(':');
  if (parts.length < 3) return undefined;
  const kind = parseInt(parts[0], 10);
  if (kind !== 34550) return undefined;
  const pubkey = parts[1];
  if (!pubkey) return undefined;
  const identifier = parts.slice(2).join(':');
  return { kind, pubkey, identifier };
}
