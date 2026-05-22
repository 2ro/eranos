import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';

export interface ProfileOrganization {
  community: ParsedCommunity;
  event: NostrEvent;
  /** This pubkey is the founder (author of the kind 34550 event). */
  isFounder: boolean;
  /** This pubkey is listed in a `p` tag with role `moderator`. */
  isModerator: boolean;
}

function organizationRank(entry: ProfileOrganization): number {
  if (entry.isFounder) return 0;
  return 1;
}

/**
 * Organizations any given pubkey is publicly associated with — orgs they
 * founded and orgs they moderate.
 *
 * Distinct from {@link useUserOrganizations}, which augments the logged-in
 * user's view with their private NIP-51 community bookmarks (kind 10004).
 * Bookmarks are personal state that a third party can't see without the
 * owner's keys, so for someone else's profile we surface only the public
 * founder + moderator signals.
 */
export function useProfileOrganizations(pubkey: string | undefined) {
  const { nostr } = useNostr();

  const query = useQuery<ProfileOrganization[]>({
    queryKey: ['profile-organizations', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const [foundedEvents, pTaggedEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [COMMUNITY_DEFINITION_KIND], authors: [pubkey], limit: 50 }],
          { signal: combinedSignal },
        ),
        nostr.query(
          [{ kinds: [COMMUNITY_DEFINITION_KIND], '#p': [pubkey], limit: 100 }],
          { signal: combinedSignal },
        ),
      ]);

      const entries: ProfileOrganization[] = [];
      for (const event of dedupeAddressableLatest([...foundedEvents, ...pTaggedEvents])) {
        const community = parseCommunityEvent(event);
        if (!community) continue;

        const isFounder = community.founderPubkey === pubkey;
        const isModerator = community.moderatorPubkeys.includes(pubkey);

        if (!isFounder && !isModerator) continue;

        entries.push({ community, event, isFounder, isModerator });
      }

      entries.sort((a, b) => {
        const rankDiff = organizationRank(a) - organizationRank(b);
        if (rankDiff !== 0) return rankDiff;
        return b.event.created_at - a.event.created_at;
      });

      return entries;
    },
    enabled: !!pubkey,
    staleTime: 60_000,
  });

  return useMemo(
    () => ({
      data: query.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
    }),
    [query.data, query.isLoading, query.isError, query.error],
  );
}
