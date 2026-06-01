import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  CAMPAIGN_LIST_KIND,
  CAMPAIGN_LIST_HASHTAG,
  CAMPAIGN_LIST_INDEX_HASHTAG,
  type ParsedCampaignList,
  foldCampaignLists,
} from '@/lib/campaignLists';
import { LIST_CURATOR_PUBKEY } from '@/lib/agoraDefaults';
import { DITTO_RELAY } from '@/lib/appRelays';

import type { NostrEvent } from '@nostrify/nostrify';

interface UseCampaignListsResult {
  /** Lists in display order — index-ordered first, then newest fallback. */
  lists: ParsedCampaignList[];
  /** The newest sentinel "order" event, or `undefined` if none yet. */
  indexEvent: NostrEvent | undefined;
}

/**
 * Reads curator-authored campaign lists (kind 30003 with the
 * `agora.campaign-list` hashtag) plus the optional list-of-lists order
 * sentinel (`agora.campaign-lists.index`).
 *
 * **Trust model.** Lists are an editorial surface curated by a single
 * pubkey ({@link LIST_CURATOR_PUBKEY}). The relay query pins `authors:`
 * to that pubkey, so a kind 30003 with our hashtag from anyone else —
 * including a label moderator — never appears. This is deliberately
 * narrower than label moderation (`useCampaignModerators`), where any
 * follow-pack member is trusted to sign approve / hide labels.
 *
 * Because the curator is a hardcoded constant, this query depends on no
 * other query — it fires on first paint with no waterfall.
 *
 * Lists *and* the index are pulled in a single filter via
 * `'#t': [LIST_HASHTAG, LIST_INDEX_HASHTAG]` so there's only one
 * round-trip on first load.
 */
export function useCampaignLists() {
  const { nostr } = useNostr();

  const query = useQuery<UseCampaignListsResult>({
    queryKey: ['campaign-lists', LIST_CURATOR_PUBKEY],
    queryFn: async ({ signal }) => {
      // Query the canonical app relay directly. The same reasoning as
      // `useCampaignModerators` applies: a fast empty EOSE from a
      // less-populated relay should not race the moderation surface to
      // "no lists" while the curated relay still holds them.
      const relay = nostr.relay(DITTO_RELAY);
      const events = await relay.query(
        [
          {
            kinds: [CAMPAIGN_LIST_KIND],
            authors: [LIST_CURATOR_PUBKEY],
            '#t': [CAMPAIGN_LIST_HASHTAG, CAMPAIGN_LIST_INDEX_HASHTAG],
            limit: 500,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return foldCampaignLists(events);
    },
    staleTime: 30_000,
  });

  return query;
}

/** Lookup a single list by slug from the cached collection. */
export function useCampaignList(slug: string | undefined) {
  const all = useCampaignLists();
  const list = useMemo(() => {
    if (!slug || !all.data) return undefined;
    return all.data.lists.find((l) => l.slug === slug);
  }, [slug, all.data]);
  return {
    list,
    isLoading: all.isLoading,
    error: all.error,
  };
}
