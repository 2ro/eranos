import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDebounce } from '@/hooks/useDebounce';

const PEOPLE_LIST_KINDS = [39089, 30000];
const DEPRECATED_FOLLOW_SET_DTAGS = new Set(['mute', 'pin', 'bookmark', 'communities']);

export interface PeopleListSearchResult {
  event: NostrEvent;
  title: string;
  description: string;
  image?: string;
  pubkeys: string[];
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function parsePeopleList(event: NostrEvent): PeopleListSearchResult | undefined {
  if (event.kind === 30000) {
    const dTag = getTag(event, 'd') ?? '';
    if (DEPRECATED_FOLLOW_SET_DTAGS.has(dTag)) return undefined;
  }

  const title = (getTag(event, 'title') || getTag(event, 'name') || '').trim();
  if (!title) return undefined;

  const pubkeys = event.tags.filter(([name, pubkey]) => name === 'p' && !!pubkey).map(([, pubkey]) => pubkey);
  if (pubkeys.length === 0) return undefined;

  return {
    event,
    title,
    description: getTag(event, 'description') || getTag(event, 'summary') || '',
    image: getTag(event, 'image') || getTag(event, 'thumb') || getTag(event, 'banner'),
    pubkeys,
  };
}

function getAddressKey(event: NostrEvent): string {
  return `${event.kind}:${event.pubkey}:${getTag(event, 'd') ?? ''}`;
}

/** Search NIP-51 starter packs and follow sets by title. */
export function useSearchPeopleLists(query: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const debouncedQuery = useDebounce(query, 300);

  const trimmedQuery = debouncedQuery.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const result = useQuery<PeopleListSearchResult[]>({
    queryKey: ['search-people-lists', user?.pubkey, trimmedQuery],
    queryFn: async ({ signal }) => {
      if (!trimmedQuery) return [];

      const filters = [
        { kinds: PEOPLE_LIST_KINDS, limit: 200 },
        { kinds: PEOPLE_LIST_KINDS, search: trimmedQuery, limit: 50 },
        ...(user ? [{ kinds: PEOPLE_LIST_KINDS, authors: [user.pubkey], limit: 50 }] : []),
      ];

      const events = await nostr.query(
        filters,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const latestByAddress = new Map<string, NostrEvent>();
      for (const event of events) {
        const key = getAddressKey(event);
        const existing = latestByAddress.get(key);
        if (!existing || event.created_at > existing.created_at) latestByAddress.set(key, event);
      }

      const matches = Array.from(latestByAddress.values())
        .map(parsePeopleList)
        .filter((pack): pack is PeopleListSearchResult => !!pack)
        .filter((pack) => pack.title.toLowerCase().includes(lowerQuery));

      matches.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aExact = aTitle === lowerQuery ? 1 : 0;
        const bExact = bTitle === lowerQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.pubkeys.length - a.pubkeys.length;
      });

      return matches.slice(0, 5);
    },
    enabled: trimmedQuery.length >= 2,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  return useMemo(() => result, [result]);
}
