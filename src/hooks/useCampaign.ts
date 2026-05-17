import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { CAMPAIGN_KIND, parseCampaign, type ParsedCampaign } from '@/lib/campaign';

interface UseCampaignArgs {
  /** Campaign author hex pubkey. */
  pubkey: string;
  /** Campaign `d` tag (slug). */
  identifier: string;
  /** Optional relay hints from the naddr. */
  relays?: string[];
}

/**
 * Fetches a single campaign by its `(pubkey, identifier)` addressable
 * coordinate. Returns the freshest version found across relays, or `null`
 * if the campaign doesn't exist or fails validation.
 *
 * `relays` is currently accepted for future use (e.g. routing the request to
 * relay hints from the originating naddr) but is not yet wired into the
 * default pool. The hook still works without it; relay hints just become
 * a no-op for now.
 */
export function useCampaign({ pubkey, identifier, relays: _relays }: UseCampaignArgs) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['campaign', pubkey, identifier],
    queryFn: async (c): Promise<ParsedCampaign | null> => {
      const events = await nostr.query(
        [
          {
            kinds: [CAMPAIGN_KIND],
            authors: [pubkey],
            '#d': [identifier],
            limit: 5,
          },
        ],
        { signal: c.signal },
      );
      if (events.length === 0) return null;
      // Pick the newest version in case multiple relays return different revisions.
      const newest = events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
      return parseCampaign(newest);
    },
    enabled: !!pubkey && !!identifier,
    staleTime: 30_000,
  });
}
