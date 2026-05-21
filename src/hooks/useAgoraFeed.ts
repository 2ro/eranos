import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useContentFilters } from '@/hooks/useContentFilters';
import { useMuteList } from '@/hooks/useMuteList';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import { getPaginationCursor, shouldHideFeedEvent } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';

const AGORA_PAGE_SIZE = 25;
const PLEDGE_KIND = 36639;
const POLL_KIND = 1068;
const COMMENT_KIND = 1111;
const NOTE_KIND = 1;
const ONCHAIN_ZAP_KIND = 8333;
const LIGHTNING_ZAP_KIND = 9735;

const AGORA_ENTITY_KINDS = [CAMPAIGN_KIND, PLEDGE_KIND, ONCHAIN_ZAP_KIND];
const COMMENT_ROOT_KINDS = [String(CAMPAIGN_KIND), String(PLEDGE_KIND)];
const WORLD_K_TAGS = ['iso3166', 'geo'];
const PLEDGE_T_ALIASES = ['agora-action', 'pathos-challenge', 'agora-challenge'];
const AGORA_T_TAGS = ['agora', 'Agora'];
const IGNORED_AGORA_NOTE_AUTHORS = new Set([
  '4fe14ef28934b4093d71d43a8c9e9ec42ab4243febfff38470bfef05f51992ec',
]);

interface AgoraFeedPage {
  events: NostrEvent[];
  oldestTimestamp: number | null;
  totalFetched: number;
}

function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([tagName]) => tagName === name).map(([, value]) => value).filter(Boolean);
}

function hasTagValue(event: NostrEvent, name: string, values: readonly string[]): boolean {
  const accepted = new Set(values.map((value) => value.toLowerCase()));
  return tagValues(event, name).some((value) => accepted.has(value.toLowerCase()));
}

function isRelevantAgoraEvent(event: NostrEvent): boolean {
  if (shouldHideFeedEvent(event)) return false;

  if (event.kind === CAMPAIGN_KIND) return true;

  if (event.kind === PLEDGE_KIND) {
    return hasTagValue(event, 't', PLEDGE_T_ALIASES);
  }

  if (event.kind === COMMENT_KIND) {
    return hasTagValue(event, 'K', COMMENT_ROOT_KINDS) || hasTagValue(event, 'k', WORLD_K_TAGS);
  }

  if (event.kind === POLL_KIND) {
    return hasTagValue(event, 'k', WORLD_K_TAGS);
  }

  if (event.kind === NOTE_KIND) {
    if (IGNORED_AGORA_NOTE_AUTHORS.has(event.pubkey)) return false;
    return hasTagValue(event, 't', AGORA_T_TAGS);
  }

  if (event.kind === ONCHAIN_ZAP_KIND || event.kind === LIGHTNING_ZAP_KIND) {
    return hasTagValue(event, 'K', COMMENT_ROOT_KINDS) || tagValues(event, 'a').some(isAgoraAddress);
  }

  return false;
}

function isAgoraAddress(value: string): boolean {
  const kind = value.split(':')[0];
  return kind === String(CAMPAIGN_KIND) || kind === String(PLEDGE_KIND);
}

function getAddressableCoordinate(event: NostrEvent): string | undefined {
  if (event.kind < 30000 || event.kind >= 40000) return undefined;
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  if (!d) return undefined;
  return `${event.kind}:${event.pubkey}:${d}`;
}

function extractDonationTargets(events: NostrEvent[]): { coordinates: string[]; eventIds: string[] } {
  const coordinates = new Set<string>();
  const eventIds = new Set<string>();

  for (const event of events) {
    const coord = getAddressableCoordinate(event);
    if (coord && (event.kind === CAMPAIGN_KIND || event.kind === PLEDGE_KIND)) {
      coordinates.add(coord);
    }

    if (event.kind === COMMENT_KIND && hasTagValue(event, 'K', [String(PLEDGE_KIND)])) {
      eventIds.add(event.id);
    }
  }

  return {
    coordinates: Array.from(coordinates).slice(0, 40),
    eventIds: Array.from(eventIds).slice(0, 40),
  };
}

/** Mixed Agora activity feed: campaigns, pledges, world posts, #Agora notes, and donation receipts. */
export function useAgoraFeed(enabled: boolean) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { shouldFilterEvent } = useContentFilters();

  const query = useInfiniteQuery<AgoraFeedPage, Error>({
    queryKey: ['agora-feed'],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(8_000)]);
      const until = pageParam as number | undefined;

      const filters: NostrFilter[] = [
        { kinds: AGORA_ENTITY_KINDS, limit: AGORA_PAGE_SIZE, ...(until && { until }) },
        { kinds: [COMMENT_KIND], '#K': COMMENT_ROOT_KINDS, limit: AGORA_PAGE_SIZE, ...(until && { until }) },
        { kinds: [COMMENT_KIND, POLL_KIND], '#k': WORLD_K_TAGS, limit: AGORA_PAGE_SIZE, ...(until && { until }) },
        { kinds: [NOTE_KIND], '#t': AGORA_T_TAGS, limit: Math.ceil(AGORA_PAGE_SIZE / 2), ...(until && { until }) },
      ];

      const raw = await nostr.query(filters, { signal });
      const filtered = raw.filter(isRelevantAgoraEvent);
      const { coordinates, eventIds } = extractDonationTargets(filtered);

      const donationFilters: NostrFilter[] = [];
      if (coordinates.length > 0) {
        donationFilters.push({ kinds: [LIGHTNING_ZAP_KIND, ONCHAIN_ZAP_KIND], '#a': coordinates, limit: coordinates.length * 10 });
      }
      if (eventIds.length > 0) {
        donationFilters.push({ kinds: [LIGHTNING_ZAP_KIND, ONCHAIN_ZAP_KIND], '#e': eventIds, limit: eventIds.length * 10 });
      }

      const donationEvents = donationFilters.length > 0
        ? await nostr.query(donationFilters, { signal })
        : [];

      const seen = new Set<string>();
      const combined = [
        ...filtered,
        // Donation enrichment is already scoped by exact #a/#e targets from this page.
        ...donationEvents.filter((event) => !shouldHideFeedEvent(event)),
      ]
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
          if (shouldFilterEvent(event)) return false;
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at);

      const page = combined.slice(0, AGORA_PAGE_SIZE);
      const oldestTimestamp = page.length > 0 ? getPaginationCursor(page) : null;

      return {
        events: page,
        oldestTimestamp,
        totalFetched: combined.length,
      };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.totalFetched < AGORA_PAGE_SIZE || !lastPage.oldestTimestamp) return undefined;
      return lastPage.oldestTimestamp - 1;
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const seen = new Set<string>();
  const events: NostrEvent[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }

  return {
    events,
    isLoading: query.isPending,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    pageCount: query.data?.pages.length,
  };
}
