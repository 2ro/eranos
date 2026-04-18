import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from './useNostrPublish';
import { ADMIN_PUBKEYS } from '@/lib/admins';
import { useOrganizers } from './useOrganizers';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * D-tag prefix for the canonical Agora per-country pinned-post lists
 * (kind 30078). The full d-tag is `agora-pinned-{COUNTRY_CODE}`. We also
 * read the legacy `pathos-pinned-{COUNTRY_CODE}` d-tag during the
 * transition so existing pins continue to apply.
 */
const PINNED_D_TAG_PREFIX = 'agora-pinned-';
const LEGACY_PINNED_D_TAG_PREFIX = 'pathos-pinned-';

function pinnedDTag(countryCode: string): string {
  return `${PINNED_D_TAG_PREFIX}${countryCode.toUpperCase()}`;
}

function legacyPinnedDTag(countryCode: string): string {
  return `${LEGACY_PINNED_D_TAG_PREFIX}${countryCode.toUpperCase()}`;
}

/** Pick the most recent event from a list (canonical-state selector). */
function pickCanonicalEvent(events: NostrEvent[]): NostrEvent | null {
  if (events.length === 0) return null;
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

/** Parse a pinned-list event's content as `{ pinnedEvents: string[] }`. */
function parsePinnedIds(event: NostrEvent | null): string[] {
  if (!event) return [];
  try {
    const data = JSON.parse(event.content) as { pinnedEvents?: unknown };
    if (Array.isArray(data.pinnedEvents)) {
      return data.pinnedEvents.filter((id): id is string => typeof id === 'string');
    }
  } catch (error) {
    console.warn('Failed to parse pinned posts event:', error);
  }
  return [];
}

/**
 * Hook to manage per-country pinned posts.
 *
 * Storage model: one addressable kind 30078 event per authorized author and
 * per country, d-tag `agora-pinned-{COUNTRY_CODE}`, content is JSON
 * `{ pinnedEvents: string[] }`. Authors trusted are admins (`ADMIN_PUBKEYS`)
 * union the country's appointed organizers (per `useOrganizers`).
 *
 * Most-recent-event-wins: any authorized author can republish the canonical
 * list, and the newest event across all authorized authors and across both
 * the agora and legacy d-tags is the canonical state.
 */
export function usePinnedPosts(countryCode?: string) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { getOrganizersByCountry, isLoading: organizersLoading } = useOrganizers();

  const organizerPubkeys = countryCode
    ? getOrganizersByCountry(countryCode).map((org) => org.pubkey)
    : [];

  // Combine admin and country-organizer pubkeys for the trusted-authors filter.
  const authorizedPubkeys = [...ADMIN_PUBKEYS, ...organizerPubkeys];

  const { data: pinnedData, isLoading } = useQuery({
    queryKey: ['pinned-posts', countryCode, organizerPubkeys.join(',')],
    queryFn: async (c) => {
      if (!countryCode) return { eventIds: [] as string[], sourceEvent: null as NostrEvent | null };
      if (authorizedPubkeys.length === 0) {
        return { eventIds: [] as string[], sourceEvent: null as NostrEvent | null };
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [
          {
            kinds: [30078],
            authors: authorizedPubkeys,
            '#d': [pinnedDTag(countryCode), legacyPinnedDTag(countryCode)],
            limit: 50,
          },
        ],
        { signal },
      );

      const canonical = pickCanonicalEvent(events);
      const eventIds = parsePinnedIds(canonical);

      return { eventIds, sourceEvent: canonical };
    },
    enabled: !!countryCode && !organizersLoading && authorizedPubkeys.length > 0,
    staleTime: 30_000,
  });

  const pinnedEventIds = pinnedData?.eventIds ?? [];

  // Fetch the actual pinned events.
  const { data: pinnedPosts = [], isLoading: isLoadingPosts } = useQuery({
    queryKey: ['pinned-posts-events', countryCode, pinnedEventIds],
    queryFn: async (c) => {
      if (pinnedEventIds.length === 0) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ ids: pinnedEventIds, limit: pinnedEventIds.length }],
        { signal },
      );

      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: pinnedEventIds.length > 0,
    staleTime: 30_000,
  });

  /**
   * Re-fetch the canonical pinned list, apply a transform, and publish a new
   * `agora-pinned-{CC}` event. Per AGENTS.md we always read fresh from relays
   * before mutating to avoid republishing stale state.
   */
  async function publishUpdatedPins(
    cc: string,
    transform: (current: string[]) => string[],
  ): Promise<NostrEvent> {
    const upperCC = cc.toUpperCase();

    const fresh = await nostr.query(
      [
        {
          kinds: [30078],
          authors: authorizedPubkeys,
          '#d': [pinnedDTag(upperCC), legacyPinnedDTag(upperCC)],
          limit: 50,
        },
      ],
      { signal: AbortSignal.timeout(10_000) },
    );
    const prev = pickCanonicalEvent(fresh);
    const current = parsePinnedIds(prev);
    const next = transform(current);

    return createEvent({
      kind: 30078,
      content: JSON.stringify({ pinnedEvents: next }),
      tags: [
        ['d', pinnedDTag(upperCC)],
        ['alt', `Pinned posts for ${upperCC} feed`],
      ],
      prev: prev ?? undefined,
    });
  }

  const pinPost = useMutation({
    mutationFn: async ({ eventId, countryCode: cc }: { eventId: string; countryCode: string }) => {
      await publishUpdatedPins(cc, (current) => [...new Set([...current, eventId])]);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-posts', variables.countryCode] });
    },
  });

  const unpinPost = useMutation({
    mutationFn: async ({ eventId, countryCode: cc }: { eventId: string; countryCode: string }) => {
      await publishUpdatedPins(cc, (current) => current.filter((id) => id !== eventId));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-posts', variables.countryCode] });
    },
  });

  /** Whether a given event id is currently pinned in this country's feed. */
  const isPinned = (eventId: string) => pinnedEventIds.includes(eventId);

  return {
    pinnedPosts,
    pinnedEventIds,
    isLoading: isLoading || isLoadingPosts || organizersLoading,
    pinPost,
    unpinPost,
    isPinned,
  };
}
