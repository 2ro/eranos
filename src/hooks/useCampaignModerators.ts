import { useQuery } from '@tanstack/react-query';

import { CAMPAIGN_MODERATORS } from '@/lib/agoraDefaults';

/**
 * Returns the hex pubkeys of campaign moderators — the pubkeys allowed to
 * sign approve / hide labels in the `agora.moderation` namespace (see
 * NIP.md).
 *
 * A campaign appears on `/` and Discover only if a moderator has labeled it
 * `approved` (see {@link useCampaignModeration}). A moderator's `hidden`
 * label always wins over any approval.
 *
 * **Hardcoded snapshot.** This used to fetch the Team Soapbox follow pack
 * (kind 39089) live every cold session, which put a single-relay round-trip
 * — up to an 8s EOSE timeout — on the critical path of every
 * moderation-gated surface (home, Discover, profile campaigns, etc.). The
 * roster changes rarely, so the membership is now snapshotted in
 * {@link CAMPAIGN_MODERATORS} and served synchronously with zero network
 * cost. Update that array (and re-cut a release) when the pack changes.
 *
 * The hook keeps its `useQuery` return shape so existing consumers
 * (`{ data, isLoading, ... }`) continue to work unchanged; the query is a
 * pure synchronous read with no `queryFn` network call.
 *
 * @see CAMPAIGN_MODERATORS (src/lib/agoraDefaults.ts) for the pubkey list.
 * @see NIP.md "Campaign moderation labels" for the namespace this powers.
 */
export function useCampaignModerators() {
  return useQuery({
    queryKey: ['campaign-moderators', 'snapshot'],
    queryFn: () => CAMPAIGN_MODERATORS.slice(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
