import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNostrPublish } from './useNostrPublish';
import { useCampaignModerators } from './useCampaignModerators';
import {
  AGORA_MODERATION_NAMESPACE,
  EMPTY_MODERATION_DATA,
  LABEL_KIND,
  type ModerationData,
  type ModerationLabel,
  foldModerationLabels,
} from '@/lib/agoraModeration';

/** Pledge kind. Pinned here to keep this hook decoupled from useActions. */
export const PLEDGE_KIND = 36639;

/** Surface-scoped alias so call sites read naturally. */
type PledgeModerationData = ModerationData;

interface UsePledgeModerationOptions {
  /** Restrict moderation lookup to known pledge coordinates. */
  coordinates?: string[];
  /** Allows pages to wait until their coordinate list has loaded. */
  enabled?: boolean;
}

/**
 * Fetches and folds pledge-moderation label events authored by Team
 * Soapbox members. Returns hide / featured rollups per pledge coordinate
 * (`36639:<pubkey>:<d>`).
 *
 * Pledges ride the same `agora.moderation` namespace and the same
 * moderator pack as campaigns and organizations; we just narrow the fold
 * to labels whose `a` tag points at a kind 36639 coordinate. The
 * relay-side query is identical to the other two surfaces — surface
 * separation is purely client-side.
 *
 * **Two-axis model.** Like organizations, pledges don't have an
 * `approved` axis. Every Agora-tagged pledge is publicly visible by
 * default; moderation reduces to `featured` (lift into a curated slot)
 * and `hidden` (suppress from public discovery). The shared fold helper
 * still tracks `approvedCoords` for type symmetry with the campaign
 * hook, but the pledge UI never emits or reads it — moderators SHOULD
 * NOT publish `approved` / `unapproved` labels against kind 36639
 * coordinates.
 *
 * **Display rule** consumers should follow:
 * - Hide enforcement on `/pledges` and any pledge discovery surface:
 *   non-moderators MUST NOT see `hidden` pledges. Moderators MAY see
 *   them via a Show-hidden toggle so they can unhide.
 * - A pledge's detail page remains accessible by direct URL regardless
 *   of moderation state — moderation only governs discovery surfaces.
 * - "My pledges" / author-own surfaces intentionally ignore moderation —
 *   a user's own pledges always render in their own listing.
 * - Hide always wins over featured.
 *
 * The mutation `moderate({ coord, action })` publishes a single kind
 * 1985 event labeling one pledge in the `agora.moderation` namespace.
 * Callers MUST be in the moderator set or the relay-side `authors:`
 * filter on read will silently ignore the new event.
 */
export function usePledgeModeration({ coordinates, enabled = true }: UsePledgeModerationOptions = {}) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: moderators } = useCampaignModerators();

  // Same gating as the other moderation hooks: never fire with an empty
  // `authors:` filter, since that would return labels from any author
  // and break the trust model (see AGENTS.md `nostr-security`).
  const moderatorsKey = moderators ? [...moderators].sort().join(',') : '';
  const coordinatesKey = coordinates ? [...coordinates].sort().join(',') : undefined;

  const moderationQuery = useQuery({
    queryKey: ['pledge-moderation', moderatorsKey, coordinatesKey],
    enabled: enabled && moderators !== undefined,
    queryFn: async ({ signal }): Promise<PledgeModerationData> => {
      if (!moderators || moderators.length === 0) {
        return { ...EMPTY_MODERATION_DATA, moderators: [] };
      }
      if (coordinates && coordinates.length === 0) {
        return { ...EMPTY_MODERATION_DATA, moderators };
      }

      const filter = {
        kinds: [LABEL_KIND],
        authors: moderators,
        '#L': [AGORA_MODERATION_NAMESPACE],
        ...(coordinates ? { '#a': coordinates } : {}),
        limit: coordinates ? Math.max(coordinates.length * 6, 100) : 2000,
      };

      const events = await nostr.query(
        [filter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return foldModerationLabels(events, moderators, PLEDGE_KIND);
    },
    // Moderation labels change on human timescales. A generous staleTime
    // keeps repeat visits to /pledges instant; the `moderate` mutation
    // below explicitly invalidates so local changes are immediate.
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });

  const moderate = useMutation({
    mutationFn: async ({ coord, action }: { coord: string; action: ModerationLabel }) => {
      if (!coord.startsWith(`${PLEDGE_KIND}:`)) {
        throw new Error(`Coordinate must start with ${PLEDGE_KIND}:`);
      }
      // Pledges use a two-axis model — only `featured` / `unfeatured` /
      // `hidden` / `unhidden` are valid here. Reject `approved` /
      // `unapproved` defensively so a stray UI bug can't poison the
      // label stream with axis-mixed events.
      if (action === 'approved' || action === 'unapproved') {
        throw new Error(`Pledges do not support the ${action} label`);
      }
      return publishEvent({
        kind: LABEL_KIND,
        content: '',
        tags: [
          ['L', AGORA_MODERATION_NAMESPACE],
          ['l', action, AGORA_MODERATION_NAMESPACE],
          ['a', coord],
          ['alt', `Pledge moderation: ${action}`],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pledge-moderation'] });
      // Discovery queries that paint /pledges read from these caches;
      // invalidate so the change reflects immediately.
      queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      queryClient.invalidateQueries({ queryKey: ['organization-activity'] });
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
