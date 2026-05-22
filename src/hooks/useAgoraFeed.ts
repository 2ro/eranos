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
const COMMUNITY_KIND = 34550;
const POLL_KIND = 1068;
const COMMENT_KIND = 1111;
const NOTE_KIND = 1;
const ONCHAIN_ZAP_KIND = 8333;
const LIGHTNING_ZAP_KIND = 9735;

const AGORA_ENTITY_KINDS = [CAMPAIGN_KIND, PLEDGE_KIND, COMMUNITY_KIND, ONCHAIN_ZAP_KIND];
const COMMENT_ROOT_KINDS = [String(CAMPAIGN_KIND), String(PLEDGE_KIND), String(COMMUNITY_KIND)];
const WORLD_K_TAGS = ['iso3166', 'geo'];
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

function hasAgoraTag(event: NostrEvent): boolean {
  return hasTagValue(event, 't', AGORA_T_TAGS);
}

function isWorldComment(event: NostrEvent): boolean {
  return event.kind === COMMENT_KIND && hasTagValue(event, 'k', WORLD_K_TAGS);
}

function isWorldPoll(event: NostrEvent): boolean {
  return event.kind === POLL_KIND && hasTagValue(event, 'k', WORLD_K_TAGS);
}

/**
 * Strict Agora filter — accepts an event only if it is genuinely Agora-created
 * content (carries the `t:agora` marker) OR is a world-layer event (country-
 * rooted comment / poll), which is intentionally surfaced cross-client.
 *
 * See `src/lib/agoraNoteTags.ts` and `NIP.md` (§ Agora Content Marker).
 */
function isRelevantAgoraEvent(event: NostrEvent): boolean {
  if (shouldHideFeedEvent(event)) return false;

  // World-layer posts are kept regardless of the Agora marker.
  if (isWorldComment(event) || isWorldPoll(event)) return true;

  // Everything else must carry the Agora content marker.
  if (!hasAgoraTag(event)) return false;

  if (event.kind === CAMPAIGN_KIND) return true;
  if (event.kind === COMMUNITY_KIND) return true;
  if (event.kind === PLEDGE_KIND) return true;

  if (event.kind === COMMENT_KIND) {
    // Comment must reference an Agora entity root (campaign / pledge / community).
    return hasTagValue(event, 'K', COMMENT_ROOT_KINDS)
      || tagValues(event, 'A').some((value) => value.startsWith(`${COMMUNITY_KIND}:`));
  }

  if (event.kind === NOTE_KIND) {
    if (IGNORED_AGORA_NOTE_AUTHORS.has(event.pubkey)) return false;
    return true; // already verified `t:agora` above
  }

  if (event.kind === ONCHAIN_ZAP_KIND || event.kind === LIGHTNING_ZAP_KIND) {
    return hasTagValue(event, 'K', COMMENT_ROOT_KINDS) || tagValues(event, 'a').some(isAgoraAddress);
  }

  return false;
}

function isAgoraAddress(value: string): boolean {
  const kind = value.split(':')[0];
  return kind === String(CAMPAIGN_KIND) || kind === String(PLEDGE_KIND) || kind === String(COMMUNITY_KIND);
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

export interface UseAgoraFeedOptions {
  /**
   * Restrict the feed to events authored by these pubkeys. Applied as an
   * `authors:` filter on every relay query (server-side filtering). Empty
   * array disables the query — used for "Following" mode when the user
   * follows nobody.
   */
  authors?: string[];
  /**
   * When true, also include the author(s)' kind 1 / 6 notes regardless of
   * the `t:agora` marker — i.e. a unified "everything this person has
   * done on the network" feed. Only meaningful in combination with
   * `authors`; setting it without `authors` would flood the feed with all
   * kind-1 notes on every relay and is silently ignored.
   *
   * Used by the profile page to merge the legacy Posts tab into the
   * Activity tab. Off by default so the strict Agora home feed isn't
   * affected.
   */
  includeAuthorNotes?: boolean;
}

/** Strict Agora activity feed: campaigns, pledges, communities, world posts, #Agora notes, and donations. */
export function useAgoraFeed(enabled: boolean, options?: UseAgoraFeedOptions) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { shouldFilterEvent } = useContentFilters();

  const authors = options?.authors;
  const authorsKey = authors ? [...authors].sort().join(',') : '';
  // If `authors` is provided but empty, the feed is intentionally empty
  // (e.g. the user follows nobody) — skip the query entirely.
  const authorsEmpty = authors !== undefined && authors.length === 0;
  const queryEnabled = enabled && !authorsEmpty;
  // Author-scoped kind 1/6 inclusion only makes sense when at least one
  // author is set; ignore the option otherwise (see option doc).
  const includeAuthorNotes = !!options?.includeAuthorNotes && !!authors && authors.length > 0;

  const query = useInfiniteQuery<AgoraFeedPage, Error>({
    queryKey: ['agora-feed', authorsKey, includeAuthorNotes],
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(8_000)]);
      const until = pageParam as number | undefined;
      const authorsFilter = authors && authors.length > 0 ? { authors } : {};

      const filters: NostrFilter[] = [
        // Agora entity kinds — strict `t:agora` required.
        { kinds: AGORA_ENTITY_KINDS, '#t': AGORA_T_TAGS, limit: AGORA_PAGE_SIZE, ...authorsFilter, ...(until && { until }) },
        // Comments on Agora entities — strict `t:agora` required.
        { kinds: [COMMENT_KIND], '#t': AGORA_T_TAGS, '#K': COMMENT_ROOT_KINDS, limit: AGORA_PAGE_SIZE, ...authorsFilter, ...(until && { until }) },
        // World layer — country/geo-rooted comments and polls. Intentionally
        // cross-client; the `#k=iso3166|geo` filter is the entire gate.
        { kinds: [COMMENT_KIND, POLL_KIND], '#k': WORLD_K_TAGS, limit: AGORA_PAGE_SIZE, ...authorsFilter, ...(until && { until }) },
        // `#Agora`-tagged kind 1 notes — accepts any author opting in via the tag.
        { kinds: [NOTE_KIND], '#t': AGORA_T_TAGS, limit: Math.ceil(AGORA_PAGE_SIZE / 2), ...authorsFilter, ...(until && { until }) },
      ];

      // Author-scoped notes — every kind 1 or 6 from this author, no
      // `t:agora` requirement. Powers the unified profile feed where the
      // "Posts" tab has been folded into "Activity".
      if (includeAuthorNotes) {
        filters.push({
          kinds: [NOTE_KIND, 6],
          ...authorsFilter,
          limit: AGORA_PAGE_SIZE,
          ...(until && { until }),
        });
      }

      const raw = await nostr.query(filters, { signal });
      // When author-notes are included, accept any kind 1/6 event authored
      // by one of the requested authors regardless of the strict Agora
      // gate. The strong author scope is the trust anchor.
      const authorSet = new Set(authors ?? []);
      const filtered = raw.filter((event) => {
        if (isRelevantAgoraEvent(event)) return true;
        if (!includeAuthorNotes) return false;
        if (event.kind !== NOTE_KIND && event.kind !== 6) return false;
        if (shouldHideFeedEvent(event)) return false;
        return authorSet.has(event.pubkey);
      });
      const { coordinates, eventIds } = extractDonationTargets(filtered);

      // Donation enrichment: pull lightning + onchain zaps that reference
      // the Agora entities visible on this page. Donation events must also
      // carry the Agora marker to be included (per `isRelevantAgoraEvent`).
      const donationFilters: NostrFilter[] = [];
      if (coordinates.length > 0) {
        donationFilters.push({ kinds: [LIGHTNING_ZAP_KIND, ONCHAIN_ZAP_KIND], '#t': AGORA_T_TAGS, '#a': coordinates, limit: coordinates.length * 10 });
      }
      if (eventIds.length > 0) {
        donationFilters.push({ kinds: [LIGHTNING_ZAP_KIND, ONCHAIN_ZAP_KIND], '#t': AGORA_T_TAGS, '#e': eventIds, limit: eventIds.length * 10 });
      }

      const donationEvents = donationFilters.length > 0
        ? await nostr.query(donationFilters, { signal })
        : [];

      const seen = new Set<string>();
      const combined = [
        ...filtered,
        // Donation enrichment is already scoped by exact #a/#e targets from this page.
        ...donationEvents.filter((event) => !shouldHideFeedEvent(event) && hasAgoraTag(event)),
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
    enabled: queryEnabled,
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
    isLoading: queryEnabled ? query.isPending : false,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !authorsEmpty && query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    pageCount: query.data?.pages.length,
  };
}
