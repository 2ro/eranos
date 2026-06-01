import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNostrPublish } from './useNostrPublish';
import { useCampaignModerators } from './useCampaignModerators';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import {
  AGORA_MODERATION_NAMESPACE,
  EMPTY_MODERATION_DATA,
  LABEL_KIND,
  type ModerationData,
  type ModerationLabel,
  foldModerationLabels,
} from '@/lib/agoraModeration';

// Re-exports for existing import sites. The namespace constant and the
// `ModerationLabel` type are imported from this module by the campaign
// moderation menu and other surfaces; keep those exports stable so the
// shared-module refactor stays a no-op for callers.
export type { ModerationLabel };

/** Surface-scoped alias so existing callers keep working. */
type CampaignModerationData = ModerationData;

/**
 * Fetches and folds campaign-moderation label events authored by Team
 * Soapbox members. Returns hide / featured rollups per campaign
 * coordinate.
 *
 * **Display rule** consumers should follow:
 * - Featured row on `/` iff `featuredCoords.has(coord) && !hiddenCoords.has(coord)`, ordered by `featuredOrder` descending.
 * - Discover shelf on `/campaigns` iff `!hiddenCoords.has(coord)`.
 * - "Hidden" (moderator-only sections) iff `hiddenCoords.has(coord)`.
 * - Hide always wins over featured.
 *
 * The mutation `moderate({ coord, action, rank? })` publishes a single
 * kind 1985 event labeling one campaign in the `agora.moderation`
 * namespace. Callers MUST be in the moderator set or the relay-side
 * `authors:` filter on read will silently ignore the new event. The
 * optional `rank` writes a `["rank", "<integer>"]` tag for moderator-
 * driven ordering of the featured row — see `useReorderCampaign`.
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
  // to EMPTY_MODERATION_DATA — no rendering can promote a campaign without
  // a moderator.
  const moderatorsKey = moderators ? [...moderators].sort().join(',') : '';

  const moderationQuery = useQuery({
    queryKey: ['campaign-moderation', moderatorsKey],
    enabled: moderators !== undefined,
    queryFn: async ({ signal }): Promise<CampaignModerationData> => {
      if (!moderators || moderators.length === 0) {
        return { ...EMPTY_MODERATION_DATA, moderators: [] };
      }
      // Fan out to the whole read pool rather than pinning a single relay.
      // The `authors: moderators` filter enforces the trust model, so
      // querying more relays only improves coverage — and it keeps this
      // moderation surface off the single-relay critical path that was
      // serializing the home page behind relay.ditto.pub.
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
        { signal },
      );
      return foldModerationLabels(events, moderators, CAMPAIGN_KIND);
    },
    staleTime: 30_000,
  });

  const moderate = useMutation({
    mutationFn: async ({
      coord,
      action,
      rank,
    }: {
      coord: string;
      action: ModerationLabel;
      /**
       * Optional explicit rank for the label, written into a
       * `["rank", "<number>"]` tag on the event. Used by
       * `useReorderCampaign` to position a campaign within the
       * featured row — the moderation fold uses the rank as the
       * sort key (descending), falling back to `created_at` when
       * no rank tag is present.
       *
       * The event itself is always signed with `created_at = now`
       * so the fold's "newest event per (coord, axis)" rule picks
       * up the reorder publish even when the chosen rank is lower
       * than the current label's rank — without that, moving a
       * campaign downward would be silently rejected by the fold.
       *
       * Omit for normal hide / feature actions.
       */
      rank?: number;
    }) => {
      // Quick parse-check on the coord so we don't sign garbage.
      if (!coord.startsWith(`${CAMPAIGN_KIND}:`)) {
        throw new Error(`Coordinate must start with ${CAMPAIGN_KIND}:`);
      }
      const tags: string[][] = [
        ['L', AGORA_MODERATION_NAMESPACE],
        ['l', action, AGORA_MODERATION_NAMESPACE],
        ['a', coord],
        ['alt', `Campaign moderation: ${action}`],
      ];
      if (rank !== undefined && Number.isFinite(rank)) {
        // Store as a plain integer string. The fold parses with
        // `Number(...)` so a non-numeric value would degrade to the
        // `created_at` fallback rather than throwing.
        tags.push(['rank', String(Math.trunc(rank))]);
      }
      return publishEvent({
        kind: LABEL_KIND,
        content: '',
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-moderation'] });
      // Moderation decisions (hide / feature) gate which campaigns
      // surface on the home page and discover shelf — so the list
      // queries need to refetch too, otherwise the moderator's UI
      // still shows the old state until refresh.
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-all'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-all-scores'] });
    },
  });

  return {
    data: moderationQuery.data ?? EMPTY_MODERATION_DATA,
    isPending: moderationQuery.isPending,
    isLoading: moderationQuery.isLoading,
    isReady: moderationQuery.isSuccess,
    moderate,
  };
}
