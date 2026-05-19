import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { TEAM_SOAPBOX } from '@/lib/agoraDefaults';

/** A 64-character lowercase hex string. */
const HEX_64_RE = /^[0-9a-f]{64}$/;

/**
 * Returns the hex pubkeys of campaign moderators — the `p` tags of the
 * Team Soapbox follow pack (kind 39089).
 *
 * A campaign appears on `/` and Discover only if a moderator has labeled it
 * `approved` (see {@link useCampaignModeration}). A moderator's `hidden`
 * label always wins over any approval. The pack itself is authored by a
 * single admin pubkey, so we pin `authors` to that pubkey to prevent anyone
 * else from publishing a same-`d` event and self-appointing.
 *
 * **Phase 1 tradeoff:** the pack is fetched live every cold session. We
 * accept the 1-round-trip latency in exchange for not shipping a release
 * every time the moderator roster changes. If perf matters, snapshot the
 * `p` tags into a hardcoded array and short-circuit this hook.
 *
 * @see TEAM_SOAPBOX (src/lib/agoraDefaults.ts) for the pack coordinate.
 * @see NIP.md "Campaign moderation labels" for the namespace this powers.
 */
export function useCampaignModerators() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['campaign-moderators', TEAM_SOAPBOX.pubkey, TEAM_SOAPBOX.identifier],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [TEAM_SOAPBOX.kind],
            // Pinning to the pack author is required: kind 39089 is
            // addressable, so without this anyone could publish a competing
            // event with the same `d` and force themselves into the moderator
            // list. (See AGENTS.md `nostr-security`.)
            authors: [TEAM_SOAPBOX.pubkey],
            '#d': [TEAM_SOAPBOX.identifier],
            limit: 1,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      if (events.length === 0) return [] as string[];

      // The pack is replaceable; relays may serve old revisions alongside the
      // current one. Keep the newest.
      const newest = events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );

      // Filter malformed `p` tags so a typo doesn't blow up downstream
      // relay filters (which reject non-hex `authors:` entries).
      return newest.tags
        .filter(([name, value]) => name === 'p' && typeof value === 'string' && HEX_64_RE.test(value))
        .map(([, pubkey]) => pubkey);
    },
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
}
