import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  COMMUNITY_DEFINITION_KIND,
  parseCommunityEvent,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';

export interface ManageableOrganization {
  /** The parsed community definition. */
  community: ParsedCommunity;
  /** The raw kind 34550 event. */
  event: NostrEvent;
  /** Whether the current user is the founder (event author). */
  isFounder: boolean;
  /** Whether the current user is one of the listed moderators. */
  isModerator: boolean;
}

/**
 * Fetch the NIP-72 Organizations the logged-in user is authorized to
 * publish "official" activity under — Organizations they either founded
 * or are listed as a moderator on.
 *
 * Powers the optional "publish under organization" selectors on
 * CreateCampaignPage / CreateActionPage / event creation: only orgs
 * where the user is founder or moderator are offered, so the resulting
 * event's uppercase \`A\` root-scope tag (\`34550:<org-pubkey>:<d>\`) lines
 * up with the trust filter applied by `useOrganizationActivity`.
 *
 * Two relay reads:
 *
 * 1. \`{ kinds: [34550], authors: [user.pubkey] }\` — orgs they founded.
 * 2. \`{ kinds: [34550], #p: [user.pubkey] }\` — orgs that p-tag them.
 *    The hook then verifies each result's \`p\` tag includes \`user.pubkey\`
 *    with role "moderator" before keeping it.
 */
export function useManageableOrganizations() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery<ManageableOrganization[]>({
    queryKey: ['manageable-organizations', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const [foundedEvents, pTaggedEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [COMMUNITY_DEFINITION_KIND], authors: [user.pubkey], limit: 50 }],
          { signal: combinedSignal },
        ),
        nostr.query(
          [{ kinds: [COMMUNITY_DEFINITION_KIND], '#p': [user.pubkey], limit: 100 }],
          { signal: combinedSignal },
        ),
      ]);

      const entries: ManageableOrganization[] = [];
      for (const event of dedupeAddressableLatest([...foundedEvents, ...pTaggedEvents])) {
        const community = parseCommunityEvent(event);
        if (!community) continue;

        const isFounder = community.founderPubkey === user.pubkey;
        const isModerator = community.moderatorPubkeys.includes(user.pubkey);

        // Only surface orgs the user can actually publish "official"
        // activity under — founded OR moderating.
        if (!isFounder && !isModerator) continue;

        entries.push({ community, event, isFounder, isModerator });
      }

      // Founder-first, then by newest definition revision.
      entries.sort((a, b) => {
        if (a.isFounder !== b.isFounder) return a.isFounder ? -1 : 1;
        return b.event.created_at - a.event.created_at;
      });

      return entries;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return useMemo(
    () => ({
      data: query.data,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
    }),
    [query.data, query.isLoading, query.isError, query.error],
  );
}
