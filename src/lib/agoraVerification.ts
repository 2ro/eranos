import type { NostrEvent } from '@nostrify/nostrify';

import { LABEL_KIND } from '@/lib/agoraModeration';

/**
 * Building blocks for Agora's campaign **verification** labels — a NIP-32
 * kind 1985 stream in the `agora.verified` namespace, distinct from the
 * `agora.moderation` namespace used for hide / feature decisions.
 *
 * A verification is a positive trust signal: a trusted labeler (configured
 * in `AppConfig.labelers`) publishes a kind 1985 event with
 * `["L", "agora.verified"]`, `["l", "verified", "agora.verified"]`, and an
 * `["a", "33863:<pubkey>:<d>"]` tag pointing at the campaign it vouches for.
 *
 * Multiple labelers can verify the same campaign; the UI stacks their
 * avatars into a badge. A labeler retracts a verification by issuing a
 * kind 5 deletion of their own label event (NIP-09) — there is no
 * "unverified" value, the label simply ceases to exist.
 *
 * The read path filters by `authors: labelers`, so labels from anyone
 * outside the configured allowlist never reach the fold. This is the same
 * trust model used by the moderation labels (see `agoraModeration.ts`),
 * just with its own namespace and a separate, narrower signer set.
 */

/** NIP-32 label kind, re-exported for verification call sites. */
export { LABEL_KIND };

/** Label namespace for Agora's campaign verification labels. */
export const AGORA_VERIFIED_NAMESPACE = 'agora.verified';

/** The single label value in the verification namespace. */
export const AGORA_VERIFIED_VALUE = 'verified';

/** A single verification observed for one campaign coordinate. */
export interface CampaignVerification {
  /** Hex pubkey of the labeler who issued the verification. */
  pubkey: string;
  /** The labeler's own label event (kind 1985). Needed to delete it. */
  event: NostrEvent;
  /** `created_at` of the label event. */
  createdAt: number;
}

/** Per-coordinate rollup of verifications. */
export interface VerificationData {
  /** Map of `33863:<pubkey>:<d>` -> verifications, ordered oldest-first. */
  byCoord: Map<string, CampaignVerification[]>;
  /** Pubkeys that were considered labelers when the query ran. */
  labelers: string[];
}

export const EMPTY_VERIFICATION_DATA: VerificationData = {
  byCoord: new Map(),
  labelers: [],
};

/**
 * Fold a flat list of `agora.verified` label events into per-coordinate
 * verification rollups.
 *
 * Events are kept only when they carry the `verified` value in the
 * `agora.verified` namespace and an `a` tag whose coordinate starts with
 * `<coordKind>:` — so the verification stream never bleeds across kinds.
 *
 * Each `(coord, labeler)` pair keeps the newest event; a labeler who
 * republishes simply refreshes their own entry rather than stacking twice.
 */
export function foldVerificationLabels(
  events: NostrEvent[],
  labelers: string[],
  coordKind: number,
): VerificationData {
  const coordPrefix = `${coordKind}:`;
  // coord -> (labeler pubkey -> verification)
  const byCoordMap = new Map<string, Map<string, CampaignVerification>>();

  for (const event of events) {
    const value = event.tags.find(
      ([n, , ns]) => n === 'l' && ns === AGORA_VERIFIED_NAMESPACE,
    )?.[1];
    if (value !== AGORA_VERIFIED_VALUE) continue;

    const aTag = event.tags.find(
      ([n, v]) => n === 'a' && typeof v === 'string' && v.startsWith(coordPrefix),
    )?.[1];
    if (!aTag) continue;

    const perLabeler = byCoordMap.get(aTag) ?? new Map<string, CampaignVerification>();
    const existing = perLabeler.get(event.pubkey);
    if (!existing || event.created_at > existing.createdAt) {
      perLabeler.set(event.pubkey, {
        pubkey: event.pubkey,
        event,
        createdAt: event.created_at,
      });
    }
    byCoordMap.set(aTag, perLabeler);
  }

  const byCoord = new Map<string, CampaignVerification[]>();
  for (const [coord, perLabeler] of byCoordMap) {
    const list = [...perLabeler.values()].sort((a, b) => a.createdAt - b.createdAt);
    byCoord.set(coord, list);
  }

  return { byCoord, labelers };
}
