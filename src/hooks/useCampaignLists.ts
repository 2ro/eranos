import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCampaignModerators } from './useCampaignModerators';
import {
  CAMPAIGN_LIST_KIND,
  CAMPAIGN_LIST_HASHTAG,
  CAMPAIGN_LIST_INDEX_HASHTAG,
  type ParsedCampaignList,
  foldCampaignLists,
} from '@/lib/campaignLists';
import { DITTO_RELAY } from '@/lib/appRelays';

import type { NostrEvent } from '@nostrify/nostrify';

interface UseCampaignListsResult {
  /** Lists in display order — index-ordered first, then newest fallback. */
  lists: ParsedCampaignList[];
  /** The newest sentinel "order" event, or `undefined` if none yet. */
  indexEvent: NostrEvent | undefined;
}

/**
 * Reads moderator-curated campaign lists (kind 30003 with the
 * `agora.campaign-list` hashtag) plus the optional list-of-lists order
 * sentinel (`agora.campaign-lists.index`).
 *
 * **Trust model.** The query gates `authors:` on
 * {@link useCampaignModerators}'s allowlist (Team Soapbox follow pack
 * members). Without that gate, any pubkey could publish a kind 30003
 * with our hashtag and appear in the strip — same self-appointment hole
 * we avoid in `useCampaignModeration`.
 *
 * Lists *and* the index are pulled in a single filter via
 * `'#t': [LIST_HASHTAG, LIST_INDEX_HASHTAG]` so there's only one
 * round-trip on first load.
 */
export function useCampaignLists() {
  const { nostr } = useNostr();
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();

  const moderatorsKey = useMemo(
    () => (moderators ? [...moderators].sort().join(',') : ''),
    [moderators],
  );

  const query = useQuery<UseCampaignListsResult>({
    queryKey: ['campaign-lists', moderatorsKey],
    enabled: !!moderators && moderators.length > 0,
    queryFn: async ({ signal }) => {
      if (!moderators || moderators.length === 0) {
        return { lists: [], indexEvent: undefined };
      }
      // Query the canonical app relay directly. The same reasoning as
      // `useCampaignModerators` applies: a fast empty EOSE from a
      // less-populated relay should not race the moderation surface to
      // "no lists" while the curated relay still holds them.
      const relay = nostr.relay(DITTO_RELAY);
      const events = await relay.query(
        [
          {
            kinds: [CAMPAIGN_LIST_KIND],
            authors: moderators,
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

  return {
    ...query,
    isLoading: query.isLoading || moderatorsLoading,
  };
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
