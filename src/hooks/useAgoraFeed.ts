import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

import { useContentFilters } from '@/hooks/useContentFilters';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { getPaginationCursor, isRepostKind, parseRepostContent, shouldHideFeedEvent, type FeedItem } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';

const AGORA_PAGE_SIZE = 25;
const PLEDGE_KIND = 36639;
const COMMUNITY_KIND = 34550;
const POLL_KIND = 1068;
const COMMENT_KIND = 1111;
const NOTE_KIND = 1;

const AGORA_ENTITY_KINDS = [CAMPAIGN_KIND, PLEDGE_KIND, COMMUNITY_KIND];
const COMMENT_ROOT_KINDS = [String(CAMPAIGN_KIND), String(PLEDGE_KIND), String(COMMUNITY_KIND)];
const WORLD_K_TAGS = ['iso3166', 'geo'];
const AGORA_T_TAGS = ['agora', 'Agora'];
const IGNORED_AGORA_NOTE_AUTHORS = new Set([
  '4fe14ef28934b4093d71d43a8c9e9ec42ab4243febfff38470bfef05f51992ec',
]);

interface AgoraFeedPage {
  events: NostrEvent[];
  items: FeedItem[];
  oldestTimestamp: number | null;
  totalFetched: number;
}

async function buildFeedItems(events: NostrEvent[], nostr: NPool, signal: AbortSignal): Promise<FeedItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const items: FeedItem[] = [];
  const repostMissingIds: string[] = [];
  const repostMap = new Map<string, NostrEvent>();

  for (const event of events) {
    if (!isRepostKind(event.kind)) {
      items.push({ event, sortTimestamp: event.created_at });
      continue;
    }

    const embedded = parseRepostContent(event);
    if (embedded && embedded.created_at <= now) {
      items.push({ event: embedded, repostedBy: event.pubkey, repostEvent: event, sortTimestamp: event.created_at });
      continue;
    }

    const repostedId = event.tags.find(([name]) => name === 'e')?.[1];
    if (repostedId) {
      repostMissingIds.push(repostedId);
      repostMap.set(repostedId, event);
    }
  }

  if (repostMissingIds.length > 0) {
    try {
      const originals = await nostr.query(
        [{ ids: repostMissingIds, limit: repostMissingIds.length }],
        { signal },
      );
      for (const original of originals) {
        const repost = repostMap.get(original.id);
        if (repost && original.created_at <= now && !shouldHideFeedEvent(original)) {
          items.push({ event: original, repostedBy: repost.pubkey, repostEvent: repost, sortTimestamp: repost.created_at });
        }
      }
    } catch {
      // timeout or abort — skip missing reposts
    }
  }

  return items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);
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

  return false;
}

interface UseAgoraFeedOptions {
  /**
   * Restrict the feed to events authored by these pubkeys. Applied as an
   * `authors:` filter on every relay query (server-side filtering). Empty
   * array disables the query — used for "Following" mode when the user
   * follows nobody.
   */
  authors?: string[];
  /**
   * When true, also include events authored by `authors` in any of the
   * user's enabled "feed kinds" (notes, reposts, articles, photos,
   * videos, polls, etc. — see {@link getEnabledFeedKinds}) regardless
   * of the `t:agora` marker. Produces a unified "everything this person
   * has done on the network" feed.
   *
   * Only meaningful in combination with `authors`; setting it without
   * `authors` would flood the feed with all kind-1 notes on every relay
   * and is silently ignored.
   *
   * Used by the profile page to merge the legacy Posts tab into the
   * Activity tab. Off by default so the strict Agora home feed isn't
   * affected.
   */
  includeAuthorNotes?: boolean;
}

/** Strict Agora activity feed: campaigns, pledges, communities, world posts, and #Agora notes. */
export function useAgoraFeed(enabled: boolean, options?: UseAgoraFeedOptions) {
  const { nostr } = useNostr();
  const { muteItems } = useMuteList();
  const { shouldFilterEvent } = useContentFilters();
  const { feedSettings } = useFeedSettings();

  const authors = options?.authors;
  const authorsKey = authors ? [...authors].sort().join(',') : '';
  // If `authors` is provided but empty, the feed is intentionally empty
  // (e.g. the user follows nobody) — skip the query entirely.
  const authorsEmpty = authors !== undefined && authors.length === 0;
  const queryEnabled = enabled && !authorsEmpty;
  // Author-scoped notes inclusion only makes sense when at least one
  // author is set; ignore the option otherwise (see option doc).
  const includeAuthorNotes = !!options?.includeAuthorNotes && !!authors && authors.length > 0;
  // Pull the user's enabled "feed kinds" — same set the legacy Posts tab
  // used. Includes notes (1), reposts (6), articles (30023), photos (20),
  // videos (21/22), polls, etc. — every kind the user opted to see in
  // mixed feeds. Memoize via stable cache-key so changing settings refetch.
  const authorNoteKinds = includeAuthorNotes ? getEnabledFeedKinds(feedSettings) : [];
  // Always include kind 1 / 6 even if the user disabled them in feed
  // settings — a profile feed without notes is broken.
  if (includeAuthorNotes && !authorNoteKinds.includes(1)) authorNoteKinds.push(1);
  if (includeAuthorNotes && !authorNoteKinds.includes(6)) authorNoteKinds.push(6);
  if (includeAuthorNotes && !authorNoteKinds.includes(16)) authorNoteKinds.push(16);
  const authorNoteKindsKey = [...authorNoteKinds].sort((a, b) => a - b).join(',');

  const query = useInfiniteQuery<AgoraFeedPage, Error>({
    queryKey: ['agora-feed', authorsKey, includeAuthorNotes, authorNoteKindsKey],
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

      // Author-scoped notes — every enabled feed kind from this author,
      // no `t:agora` requirement. Powers the unified profile feed where
      // the legacy Posts tab has been folded into Activity. The kind set
      // mirrors the user's feed settings (notes, reposts, articles,
      // photos, videos, polls, etc.) so a profile shows everything the
      // person has done across the network.
      if (includeAuthorNotes && authorNoteKinds.length > 0) {
        filters.push({
          kinds: authorNoteKinds,
          ...authorsFilter,
          limit: AGORA_PAGE_SIZE,
          ...(until && { until }),
        });
      }

      const raw = await nostr.query(filters, { signal });
      // When author-notes are included, accept any event of an enabled
      // feed kind authored by one of the requested authors regardless of
      // the strict Agora gate. The strong author scope is the trust
      // anchor.
      const authorSet = new Set(authors ?? []);
      const authorKindSet = new Set(authorNoteKinds);
      const filtered = raw.filter((event) => {
        if (isRelevantAgoraEvent(event)) return true;
        if (!includeAuthorNotes) return false;
        if (!authorKindSet.has(event.kind)) return false;
        if (shouldHideFeedEvent(event)) return false;
        return authorSet.has(event.pubkey);
      });

      const seen = new Set<string>();
      const combined = filtered
        .filter((event) => {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          if (muteItems.length > 0 && isEventMuted(event, muteItems)) return false;
          if (shouldFilterEvent(event)) return false;
          return true;
        })
        .sort((a, b) => b.created_at - a.created_at);

      const page = combined.slice(0, AGORA_PAGE_SIZE);
      const items = await buildFeedItems(page, nostr, signal);
      const oldestTimestamp = page.length > 0 ? getPaginationCursor(page) : null;

      return {
        events: page,
        items,
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
  const seenItems = new Set<string>();
  const items: FeedItem[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
    for (const item of page.items) {
      const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      items.push(item);
    }
  }

  return {
    events,
    items,
    isLoading: queryEnabled ? query.isPending : false,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !authorsEmpty && query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    pageCount: query.data?.pages.length,
  };
}
