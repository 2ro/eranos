import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from './useNostrPublish';
import { nip19 } from 'nostr-tools';
import { ADMIN_PUBKEYS } from '@/lib/admins';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * D-tag for the canonical Agora organizer-list event (kind 30078).
 * Pathos used `pathos-organizers` and we still read it as a fallback during
 * the transition so existing appointments continue to apply.
 */
const ORGANIZERS_D_TAG = 'agora-organizers';
const LEGACY_ORGANIZERS_D_TAG = 'pathos-organizers';

interface Organizer {
  pubkey: string;
  countryCode: string;
}

/**
 * Pick the most recent admin-authored organizer event from the supplied list.
 * Used both at query time and inside mutations (with fresh fetches) so the
 * canonical state is always the single newest event across the agora and
 * legacy d-tags.
 */
function pickCanonicalEvent(events: NostrEvent[]): NostrEvent | null {
  if (events.length === 0) return null;
  return events.reduce((latest, current) =>
    current.created_at > latest.created_at ? current : latest,
  );
}

/** Parse an organizer list event's `p` tags into typed Organizer entries. */
function parseOrganizers(event: NostrEvent | null): Organizer[] {
  if (!event) return [];
  const out: Organizer[] = [];
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1] && tag[3]) {
      out.push({ pubkey: tag[1], countryCode: tag[3].toUpperCase() });
    }
  }
  return out;
}

/**
 * Hook to manage country organizers.
 *
 * Storage model: a single addressable kind 30078 event per admin author with
 * d-tag `agora-organizers`. Each organizer is encoded as a `p` tag of the form
 * `["p", "<pubkey>", "<optional-relay>", "<country-code>"]`. Only events
 * authored by an entry in `ADMIN_PUBKEYS` are trusted (per AGENTS.md author
 * filtering rule for privileged operations).
 *
 * Multiple admins can publish — the most recent event across all admins and
 * across both the agora and legacy pathos d-tags is the canonical state.
 */
export function useOrganizers() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();

  const { data: organizersData, isLoading } = useQuery({
    queryKey: ['organizers'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      // Read both the agora and legacy pathos d-tags in a single query so we
      // can transparently honour pre-rebrand appointments until an admin
      // republishes under the agora d-tag.
      const events = await nostr.query(
        [
          {
            kinds: [30078],
            authors: ADMIN_PUBKEYS,
            '#d': [ORGANIZERS_D_TAG, LEGACY_ORGANIZERS_D_TAG],
            limit: 50,
          },
        ],
        { signal },
      );

      const canonical = pickCanonicalEvent(events);
      const organizers = parseOrganizers(canonical);

      return {
        organizers,
        lastUpdatedBy: canonical?.pubkey ?? '',
        lastUpdatedAt: canonical?.created_at ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const organizers = organizersData?.organizers ?? [];

  /**
   * Build the next list of `p` tags by applying a mutation on top of the
   * freshly-fetched canonical state, then publish a new agora-organizers event.
   * Always re-fetches from relays before mutating to satisfy the AGENTS.md rule
   * against reading from query cache during read-modify-write cycles.
   */
  async function publishUpdatedList(
    transform: (current: Organizer[]) => Organizer[],
  ): Promise<NostrEvent> {
    const fresh = await nostr.query(
      [
        {
          kinds: [30078],
          authors: ADMIN_PUBKEYS,
          '#d': [ORGANIZERS_D_TAG, LEGACY_ORGANIZERS_D_TAG],
          limit: 50,
        },
      ],
      { signal: AbortSignal.timeout(10_000) },
    );
    const prev = pickCanonicalEvent(fresh);
    const current = parseOrganizers(prev);
    const next = transform(current);

    const newPTags: string[][] = next.map((org) => [
      'p',
      org.pubkey,
      '',
      org.countryCode.toUpperCase(),
    ]);

    return createEvent({
      kind: 30078,
      content: '',
      tags: [
        ['d', ORGANIZERS_D_TAG],
        ['alt', 'Eranos organizer appointments'],
        ...newPTags,
      ],
      prev: prev ?? undefined,
    });
  }

  const addOrganizer = useMutation({
    mutationFn: async ({ npub, countryCode }: { npub: string; countryCode: string }) => {
      let pubkey: string;
      try {
        const decoded = nip19.decode(npub) as unknown as { type: 'npub'; data: string };
        pubkey = decoded.data;
      } catch {
        throw new Error('Invalid npub format');
      }

      const upperCC = countryCode.toUpperCase();

      await publishUpdatedList((current) => {
        const exists = current.some(
          (org) => org.pubkey === pubkey && org.countryCode.toUpperCase() === upperCC,
        );
        if (exists) return current;
        return [...current, { pubkey, countryCode: upperCC }];
      });

      return { pubkey, countryCode: upperCC };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizers'] });
    },
  });

  const removeOrganizer = useMutation({
    mutationFn: async ({ npub, countryCode }: { npub: string; countryCode: string }) => {
      let pubkey: string;
      try {
        const decoded = nip19.decode(npub) as unknown as { type: 'npub'; data: string };
        pubkey = decoded.data;
      } catch {
        throw new Error('Invalid npub format');
      }

      const upperCC = countryCode.toUpperCase();

      await publishUpdatedList((current) =>
        current.filter(
          (org) => !(org.pubkey === pubkey && org.countryCode.toUpperCase() === upperCC),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizers'] });
    },
  });

  /** Get organizers for a specific country code (case-insensitive). */
  const getOrganizersByCountry = (countryCode: string) => {
    const upper = countryCode.toUpperCase();
    return organizers.filter((org) => org.countryCode.toUpperCase() === upper);
  };

  /**
   * Check if a pubkey is appointed as an organizer. When `countryCode` is
   * provided, scopes to that country; otherwise returns true if the pubkey
   * organizes any country.
   */
  const isOrganizer = (pubkey: string, countryCode?: string) => {
    if (countryCode) {
      const upper = countryCode.toUpperCase();
      return organizers.some(
        (org) => org.pubkey === pubkey && org.countryCode.toUpperCase() === upper,
      );
    }
    return organizers.some((org) => org.pubkey === pubkey);
  };

  return {
    organizers,
    isLoading,
    addOrganizer,
    removeOrganizer,
    getOrganizersByCountry,
    isOrganizer,
  };
}
