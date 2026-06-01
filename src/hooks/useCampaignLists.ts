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
 * **Trust model.** Only lists authored by a {@link useCampaignModerators}
 * allowlist member (Team Soapbox follow pack) are surfaced. Without that
 * gate, any pubkey could publish a kind 30003 with our hashtag and appear
 * in the strip — same self-appointment hole we avoid in
 * `useCampaignModeration`.
 *
 * **Flattened waterfall.** The list relay query no longer *waits* for the
 * moderator pack to resolve. Previously the query was `enabled`-gated on
 * the moderators and applied `authors: moderators` server-side, which
 * serialized two single-relay round-trips (each up to an 8s EOSE timeout)
 * on a cold session before any list could render. We now fire the list
 * query immediately on the hashtag filter and apply the moderator
 * allowlist **client-side** in {@link foldCampaignLists}. The two queries
 * run in parallel; the trust gate is identical (a list authored by a
 * non-moderator is dropped before it ever reaches the UI). The moderator
 * pack is cached for 10 minutes, so on warm sessions it's already present
 * and the filter applies with zero added latency.
 *
 * Lists *and* the index are pulled in a single filter via
 * `'#t': [LIST_HASHTAG, LIST_INDEX_HASHTAG]` so there's only one
 * round-trip on first load.
 */
export function useCampaignLists() {
  const { nostr } = useNostr();
  const { data: moderators, isLoading: moderatorsLoading } = useCampaignModerators();

  // Raw lists query — fired independently of the moderator pack so the two
  // round-trips run in parallel. The moderator allowlist is applied at the
  // fold step below, not as a server `authors:` filter.
  const rawQuery = useQuery<NostrEvent[]>({
    queryKey: ['campaign-lists', 'raw'],
    queryFn: async ({ signal }) => {
      // Query the canonical app relay directly. The same reasoning as
      // `useCampaignModerators` applies: a fast empty EOSE from a
      // less-populated relay should not race the moderation surface to
      // "no lists" while the curated relay still holds them.
      const relay = nostr.relay(DITTO_RELAY);
      return relay.query(
        [
          {
            kinds: [CAMPAIGN_LIST_KIND],
            '#t': [CAMPAIGN_LIST_HASHTAG, CAMPAIGN_LIST_INDEX_HASHTAG],
            limit: 500,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    staleTime: 30_000,
  });

  // Fold + trust-gate client-side: drop any list/index event not authored
  // by a moderator before parsing. Recomputed when either the raw events
  // or the moderator allowlist changes.
  const data = useMemo<UseCampaignListsResult>(() => {
    const events = rawQuery.data;
    if (!events || !moderators || moderators.length === 0) {
      return { lists: [], indexEvent: undefined };
    }
    const allowed = new Set(moderators);
    const trusted = events.filter((e) => allowed.has(e.pubkey));
    return foldCampaignLists(trusted);
  }, [rawQuery.data, moderators]);

  return {
    ...rawQuery,
    data,
    isLoading: rawQuery.isLoading || moderatorsLoading,
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
