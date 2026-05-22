import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Shared building blocks for Agora's moderation labels (NIP-32 kind 1985 in
 * the `agora.moderation` namespace). Both campaigns (kind 33863) and
 * organizations (kind 34550) ride the same label stream and the same
 * moderator pack (Team Soapbox); the only thing that varies between them is
 * the kind prefix on the `a` tag.
 *
 * Centralizing the constants, types, and folding logic here keeps the two
 * per-surface hooks (`useCampaignModeration`, `useOrganizationModeration`)
 * from drifting apart on namespace strings, axis semantics, or the
 * surfacing-rule contract documented in NIP.md.
 */

/** NIP-32 label kind. */
export const LABEL_KIND = 1985;

/** Label namespace for Agora's moderation labels. */
export const AGORA_MODERATION_NAMESPACE = 'agora.moderation';

/** The six possible label values in the moderation namespace. */
export type ModerationLabel =
  | 'approved'
  | 'unapproved'
  | 'hidden'
  | 'unhidden'
  | 'featured'
  | 'unfeatured';

/** A single label event narrowed to its decision axis. */
export interface AxisDecision {
  /** Latest label observed on this axis. */
  label: ModerationLabel;
  /** Author of the latest label. */
  pubkey: string;
  /** Created-at of the latest label. */
  createdAt: number;
}

/** Per-coordinate rollup of approval + hide + featured state. */
export interface ModerationState {
  approval?: AxisDecision; // `approved` or `unapproved`
  hide?: AxisDecision; // `hidden` or `unhidden`
  featured?: AxisDecision; // `featured` or `unfeatured`
}

/**
 * Per-surface rollup. Keys are the addressable coordinates we filtered for
 * (e.g. `33863:<pubkey>:<d>` for campaigns or `34550:<pubkey>:<d>` for
 * organizations).
 */
export interface ModerationData {
  /** Map of `<kind>:<pubkey>:<d>` -> rollup. */
  byCoord: Map<string, ModerationState>;
  /** Coordinates where the latest approval label is `approved`. */
  approvedCoords: Set<string>;
  /** Coordinates where the latest hide label is `hidden`. */
  hiddenCoords: Set<string>;
  /** Coordinates where the latest featured label is `featured`. */
  featuredCoords: Set<string>;
  /**
   * Map of `coord` -> `created_at` of the latest `featured` label. Used to
   * sort featured rows newest-first.
   */
  featuredOrder: Map<string, number>;
  /** Pubkeys that were considered moderators when the query ran. */
  moderators: string[];
}

export const EMPTY_MODERATION_DATA: ModerationData = {
  byCoord: new Map(),
  approvedCoords: new Set(),
  hiddenCoords: new Set(),
  featuredCoords: new Set(),
  featuredOrder: new Map(),
  moderators: [],
};

function isApprovalLabel(value: string): value is 'approved' | 'unapproved' {
  return value === 'approved' || value === 'unapproved';
}

function isHideLabel(value: string): value is 'hidden' | 'unhidden' {
  return value === 'hidden' || value === 'unhidden';
}

function isFeaturedLabel(value: string): value is 'featured' | 'unfeatured' {
  return value === 'featured' || value === 'unfeatured';
}

/**
 * Fold a flat list of label events into per-coordinate rollups by axis.
 * The newest event per `(coord, axis)` wins.
 *
 * Events are filtered to only those carrying an `a` tag that starts with
 * `<coordKind>:` so the campaign and organization label streams never bleed
 * into each other even though they share a namespace and signer set.
 *
 * Events with a value outside the moderation namespace, or with no `l` tag
 * in that namespace, are dropped.
 */
export function foldModerationLabels(
  events: NostrEvent[],
  moderators: string[],
  coordKind: number,
): ModerationData {
  const coordPrefix = `${coordKind}:`;
  const byCoord = new Map<string, ModerationState>();

  for (const event of events) {
    const value = event.tags.find(
      ([n, , ns]) => n === 'l' && ns === AGORA_MODERATION_NAMESPACE,
    )?.[1];
    if (!value) continue;
    const aTag = event.tags.find(
      ([n, v]) => n === 'a' && typeof v === 'string' && v.startsWith(coordPrefix),
    )?.[1];
    if (!aTag) continue;

    const state = byCoord.get(aTag) ?? {};
    if (isApprovalLabel(value)) {
      if (!state.approval || event.created_at > state.approval.createdAt) {
        state.approval = { label: value, pubkey: event.pubkey, createdAt: event.created_at };
      }
    } else if (isHideLabel(value)) {
      if (!state.hide || event.created_at > state.hide.createdAt) {
        state.hide = { label: value, pubkey: event.pubkey, createdAt: event.created_at };
      }
    } else if (isFeaturedLabel(value)) {
      if (!state.featured || event.created_at > state.featured.createdAt) {
        state.featured = { label: value, pubkey: event.pubkey, createdAt: event.created_at };
      }
    }
    byCoord.set(aTag, state);
  }

  const approvedCoords = new Set<string>();
  const hiddenCoords = new Set<string>();
  const featuredCoords = new Set<string>();
  const featuredOrder = new Map<string, number>();
  for (const [coord, state] of byCoord) {
    if (state.approval?.label === 'approved') approvedCoords.add(coord);
    if (state.hide?.label === 'hidden') hiddenCoords.add(coord);
    if (state.featured?.label === 'featured') {
      featuredCoords.add(coord);
      featuredOrder.set(coord, state.featured.createdAt);
    }
  }

  return { byCoord, approvedCoords, hiddenCoords, featuredCoords, featuredOrder, moderators };
}
