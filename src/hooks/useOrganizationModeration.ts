import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNostrPublish } from './useNostrPublish';
import { useCampaignModerators } from './useCampaignModerators';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';
import {
  AGORA_MODERATION_NAMESPACE,
  EMPTY_MODERATION_DATA,
  LABEL_KIND,
  type ModerationData,
  type ModerationLabel,
  foldModerationLabels,
} from '@/lib/agoraModeration';

/** Surface-scoped alias so call sites read naturally. */
export type OrganizationModerationData = ModerationData;

/**
 * Fetches and folds organization-moderation label events authored by Team
 * Soapbox members. Returns hide / featured rollups per community
 * coordinate (`34550:<pubkey>:<d>`).
 *
 * Organizations ride the same `agora.moderation` namespace and the same
 * moderator pack as campaigns; we just narrow the fold to labels whose `a`
 * tag points at a kind 34550 coordinate. The relay-side query is identical
 * to the campaign side (we fetch every namespace-tagged label authored by
 * moderators) — the surface separation is purely client-side.
 *
 * **Two-axis model.** Unlike campaigns, organizations don't have an
 * `approved` axis. Every Agora-tagged organization is publicly visible
 * by default; moderation reduces to `featured` (lift into the curated
 * shelf) and `hidden` (suppress from public discovery). The shared
 * fold helper still tracks `approvedCoords` for type symmetry with the
 * campaign hook, but the org UI never emits or reads it — moderators
 * SHOULD NOT publish `approved` / `unapproved` labels against kind
 * 34550 coordinates.
 *
 * **Display rule** consumers should follow:
 * - Featured shelf on `/communities` iff
 *   `featuredCoords.has(coord) && !hiddenCoords.has(coord)`.
 * - Future "All organizations" / discovery surfaces iff
 *   `!hiddenCoords.has(coord)` for non-moderators; moderators may see hidden
 *   orgs with a dimmed treatment.
 * - "My organizations" intentionally ignores moderation — a user's own
 *   founded / moderated / followed orgs always render regardless of label.
 * - Hide always wins over featured.
 *
 * The mutation `moderate({ coord, action })` publishes a single kind 1985
 * event labeling one organization in the `agora.moderation` namespace.
 * Callers MUST be in the moderator set or the relay-side `authors:` filter
 * on read will silently ignore the new event.
 */
export function useOrganizationModeration() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: moderators } = useCampaignModerators();

  // Same gating as the campaign hook: never fire with an empty `authors:`
  // filter, since that would return labels from any author and break the
  // trust model.
  const moderatorsKey = moderators ? [...moderators].sort().join(',') : '';

  const moderationQuery = useQuery({
    queryKey: ['organization-moderation', moderatorsKey],
    enabled: moderators !== undefined,
    queryFn: async ({ signal }): Promise<OrganizationModerationData> => {
      if (!moderators || moderators.length === 0) {
        return { ...EMPTY_MODERATION_DATA, moderators: [] };
      }
      const events = await nostr.query(
        [
          {
            kinds: [LABEL_KIND],
            authors: moderators,
            '#L': [AGORA_MODERATION_NAMESPACE],
            limit: 2000,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return foldModerationLabels(events, moderators, COMMUNITY_DEFINITION_KIND);
    },
    // Moderation labels change slowly — moderators feature or hide on
    // human timescales, not seconds. A generous staleTime keeps repeat
    // visits to /communities instant (no relay round-trip on remount),
    // and explicit invalidation in the `moderate` mutation below catches
    // local changes immediately. The hour-long gcTime survives tab
    // switches and back-button navigation without refetching.
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });

  const moderate = useMutation({
    mutationFn: async ({ coord, action }: { coord: string; action: ModerationLabel }) => {
      if (!coord.startsWith(`${COMMUNITY_DEFINITION_KIND}:`)) {
        throw new Error(`Coordinate must start with ${COMMUNITY_DEFINITION_KIND}:`);
      }
      // Organizations use a two-axis model — only `featured` / `unfeatured`
      // / `hidden` / `unhidden` are valid here. Reject `approved` /
      // `unapproved` defensively so a stray UI bug can't poison the
      // label stream with axis-mixed events.
      if (action === 'approved' || action === 'unapproved') {
        throw new Error(`Organizations do not support the ${action} label`);
      }
      return publishEvent({
        kind: LABEL_KIND,
        content: '',
        tags: [
          ['L', AGORA_MODERATION_NAMESPACE],
          ['l', action, AGORA_MODERATION_NAMESPACE],
          ['a', coord],
          ['alt', `Organization moderation: ${action}`],
        ],
      });
    },
    onSuccess: () => {
      // Invalidate both the moderation rollup and the derived featured
      // query so the grid reflects the new state immediately.
      queryClient.invalidateQueries({ queryKey: ['organization-moderation'] });
      queryClient.invalidateQueries({ queryKey: ['featured-organizations'] });
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
