import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from './useNostrPublish';
import { useCampaignModerators } from './useCampaignModerators';
import { CAMPAIGN_KIND } from '@/lib/campaign';

/** NIP-32 label kind. */
const LABEL_KIND = 1985;
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
interface AxisDecision {
  /** Latest label observed on this axis. */
  label: ModerationLabel;
  /** Author of the latest label. */
  pubkey: string;
  /** Created-at of the latest label. */
  createdAt: number;
}

/** Per-campaign rollup of approval + hide + featured state. */
export interface CampaignModerationState {
  approval?: AxisDecision; // `approved` or `unapproved`
  hide?: AxisDecision; // `hidden` or `unhidden`
  featured?: AxisDecision; // `featured` or `unfeatured`
}

export interface CampaignModerationData {
  /** Map of `30223:<pubkey>:<d>` -> rollup. */
  byCoord: Map<string, CampaignModerationState>;
  /** Coordinates where the latest approval label is `approved`. */
  approvedCoords: Set<string>;
  /** Coordinates where the latest hide label is `hidden`. */
  hiddenCoords: Set<string>;
  /** Coordinates where the latest featured label is `featured`. */
  featuredCoords: Set<string>;
  /**
   * Map of `coord` -> `created_at` of the latest `featured` label.
   * Used to sort the home-page featured row newest-first.
   */
  featuredOrder: Map<string, number>;
  /** Pubkeys that were considered moderators when the query ran. */
  moderators: string[];
}

const EMPTY_DATA: CampaignModerationData = {
  byCoord: new Map(),
  approvedCoords: new Set(),
  hiddenCoords: new Set(),
  featuredCoords: new Set(),
  featuredOrder: new Map(),
  moderators: [],
};

/** True if a label value belongs to the approval axis. */
function isApprovalLabel(value: string): value is 'approved' | 'unapproved' {
  return value === 'approved' || value === 'unapproved';
}

/** True if a label value belongs to the hide axis. */
function isHideLabel(value: string): value is 'hidden' | 'unhidden' {
  return value === 'hidden' || value === 'unhidden';
}

/** True if a label value belongs to the featured axis. */
function isFeaturedLabel(value: string): value is 'featured' | 'unfeatured' {
  return value === 'featured' || value === 'unfeatured';
}

/**
 * Fold a flat list of label events into per-coordinate rollups by axis.
 * The newest event per `(coord, axis)` wins. Events not addressing a
 * campaign coordinate or carrying a value outside the namespace are dropped.
 */
function foldLabelEvents(events: NostrEvent[], moderators: string[]): CampaignModerationData {
  const byCoord = new Map<string, CampaignModerationState>();

  for (const event of events) {
    const value = event.tags.find(([n, , ns]) => n === 'l' && ns === AGORA_MODERATION_NAMESPACE)?.[1];
    if (!value) continue;
    const aTag = event.tags.find(([n, v]) => n === 'a' && typeof v === 'string' && v.startsWith(`${CAMPAIGN_KIND}:`))?.[1];
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

/**
 * Fetches and folds campaign-moderation label events authored by Team
 * Soapbox members. Returns approval / hide / featured rollups per campaign
 * coordinate.
 *
 * **Display rule** consumers should follow:
 * - Featured row on `/` iff `featuredCoords.has(coord) && !hiddenCoords.has(coord)`.
 * - Community Campaigns grid on `/` iff `approvedCoords.has(coord) && !hiddenCoords.has(coord) && !featuredCoords.has(coord)` (featured dedupe).
 * - Discover shelf iff `approvedCoords.has(coord) && !hiddenCoords.has(coord)`.
 * - "Pending" (moderator-only sections) iff `!approvedCoords.has(coord) && !hiddenCoords.has(coord)`.
 * - "Hidden" (moderator-only sections) iff `hiddenCoords.has(coord)`.
 * - Featured is independent of Approved at the protocol level; hide always wins.
 *
 * The mutation `moderate({ coord, action })` publishes a single kind 1985
 * event labeling one campaign in the `agora.moderation` namespace. Callers
 * MUST be in the moderator set or the relay-side `authors:` filter on read
 * will silently ignore the new event.
 */
export function useCampaignModeration() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: moderators } = useCampaignModerators();

  // The query is gated on `moderators !== undefined` so we never fire it with
  // an empty `authors:` filter (which would return everything matching the
  // namespace from any author and break our trust model — see AGENTS.md).
  // Once moderators arrives empty, the query runs and immediately resolves
  // to EMPTY_DATA — no rendering can promote a campaign without a moderator.
  const moderatorsKey = moderators ? [...moderators].sort().join(',') : '';

  const moderationQuery = useQuery({
    queryKey: ['campaign-moderation', moderatorsKey],
    enabled: moderators !== undefined,
    queryFn: async ({ signal }): Promise<CampaignModerationData> => {
      if (!moderators || moderators.length === 0) {
        return { ...EMPTY_DATA, moderators: [] };
      }
      const events = await nostr.query(
        [
          {
            kinds: [LABEL_KIND],
            authors: moderators,
            // The capital-L tag is what NIP-32 indexes as the namespace. The
            // lowercase `l` carries the value + namespace as its 2nd/3rd
            // elements. We filter relay-side by namespace, then fold
            // client-side to per-axis decisions.
            '#L': [AGORA_MODERATION_NAMESPACE],
            limit: 2000,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return foldLabelEvents(events, moderators);
    },
    staleTime: 30_000,
  });

  const moderate = useMutation({
    mutationFn: async ({ coord, action }: { coord: string; action: ModerationLabel }) => {
      // Quick parse-check on the coord so we don't sign garbage.
      if (!coord.startsWith(`${CAMPAIGN_KIND}:`)) {
        throw new Error(`Coordinate must start with ${CAMPAIGN_KIND}:`);
      }
      return publishEvent({
        kind: LABEL_KIND,
        content: '',
        tags: [
          ['L', AGORA_MODERATION_NAMESPACE],
          ['l', action, AGORA_MODERATION_NAMESPACE],
          ['a', coord],
          ['alt', `Campaign moderation: ${action}`],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-moderation'] });
    },
  });

  return {
    data: moderationQuery.data ?? EMPTY_DATA,
    isPending: moderationQuery.isPending,
    isLoading: moderationQuery.isLoading,
    isReady: moderationQuery.isSuccess,
    moderate,
  };
}
