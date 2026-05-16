import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useOrganizers } from './useOrganizers';
import { ADMIN_PUBKEYS } from '@/lib/admins';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Activist Action (kind 36639) — see `NIP.md`.
 *
 * Ported from Pathos with two adjustments:
 *  - Discovery `t` tag is canonically `agora-action`. Read aliases include
 *    `pathos-challenge` and `agora-challenge` so existing data is visible.
 *  - Country `i` tag is canonically `iso3166:XX`. Legacy `geo:XX` (length 6)
 *    is accepted as a read alias.
 */

export interface Action {
  event: NostrEvent;
  id: string;
  title: string;
  description: string;
  type: 'photo' | 'art' | 'info' | 'action';
  bounty: number;
  countryCode: string;
  /** Unix timestamp — when action becomes active. Defaults to created_at. */
  startTime?: number;
  /** Unix timestamp — when action expires. Defaults to start + 48h. */
  deadline?: number;
  /** Cover image URL. */
  image?: string;
  /** Raw image tag value from the event (for diagnostics/UI messaging). */
  imageRaw?: string;
  /** Human-readable image validation error, when the tag is present but unusable. */
  imageError?: string;
  pubkey: string;
  createdAt: number;
}

export function parseAction(event: NostrEvent): Action | null {
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const typeTag = event.tags.find(([name]) => name === 'challenge-type')?.[1];
  const bountyTag = event.tags.find(([name]) => name === 'bounty')?.[1];

  // Country code from #i tag (iso3166:XX or legacy geo:XX) or location tag fallback.
  const countryCode = (() => {
    const iTag = event.tags.find(([name]) => name === 'i')?.[1];
    const locationTag = event.tags.find(([name]) => name === 'location')?.[1];

    if (iTag) {
      if (iTag.startsWith('iso3166:')) {
        return iTag.slice(8).toUpperCase();
      }
      // Legacy: geo:XX (only the country-code form, length 6 e.g. "geo:US")
      if (iTag.startsWith('geo:') && iTag.length === 6) {
        return iTag.slice(4).toUpperCase();
      }
    }
    if (locationTag) {
      return locationTag.toUpperCase();
    }
    return undefined;
  })();

  const startTag = event.tags.find(([name]) => name === 'start')?.[1];
  const deadlineTag = event.tags.find(([name]) => name === 'deadline')?.[1];
  const imageTag = event.tags.find(([name]) => name === 'image')?.[1];
  const sanitizedImage = sanitizeUrl(imageTag);
  const imageError = imageTag && !sanitizedImage
    ? 'Invalid image URL in event (only https URLs are allowed).'
    : undefined;

  if (!dTag || !title || !typeTag || !bountyTag || !countryCode) {
    return null;
  }

  const type = typeTag as Action['type'];
  if (!['photo', 'art', 'info', 'action'].includes(type)) {
    return null;
  }

  // Start time: use the tag if valid, otherwise fall back to creation time.
  let startTimestamp: number;
  if (startTag) {
    const parsed = parseInt(startTag, 10);
    startTimestamp = !isNaN(parsed) && parsed > 0 ? parsed : event.created_at;
  } else {
    startTimestamp = event.created_at;
  }

  // Deadline: use the tag if valid, otherwise fall back to start + 48h.
  let deadlineTimestamp: number | undefined;
  if (deadlineTag) {
    const parsed = parseInt(deadlineTag, 10);
    deadlineTimestamp =
      !isNaN(parsed) && parsed > 0 ? parsed : startTimestamp + 48 * 60 * 60;
  } else {
    deadlineTimestamp = startTimestamp + 48 * 60 * 60;
  }

  return {
    event,
    id: dTag,
    title,
    description: event.content,
    type,
    bounty: parseInt(bountyTag, 10) || 0,
    countryCode,
    startTime: startTimestamp,
    deadline: deadlineTimestamp,
    // Event tags are untrusted input — keep only valid https URLs.
    image: sanitizedImage,
    imageRaw: imageTag,
    imageError,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

interface UseActionsOptions {
  /** Optional ISO 3166-1 alpha-2 country code. When omitted, queries globally. */
  countryCode?: string;
  /** Maximum number of events to request from relays. */
  limit?: number;
}

/**
 * Returns activist actions (kind 36639), sorted into:
 *   current actions first (highest bounty, then newest),
 *   then upcoming (soonest start first),
 *   then past (most recently expired first).
 *
 * Only events authored by platform admins or per-country organizers are
 * surfaced — anyone else publishing kind 36639 is ignored client-side.
 */
export function useActions({ countryCode, limit = 50 }: UseActionsOptions = {}) {
  const { nostr } = useNostr();
  const { organizers, isLoading: organizersLoading } = useOrganizers();

  const allowedCreators = new Set([
    ...organizers.map((org) => org.pubkey),
    ...ADMIN_PUBKEYS,
  ]);

  return useQuery({
    queryKey: ['agora-actions', countryCode, limit, organizers.length],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const queries: NostrFilter[] = countryCode
        ? [{
            kinds: [36639],
            '#t': ['agora-action', 'pathos-challenge', 'agora-challenge'],
            '#i': [
              `iso3166:${countryCode.toUpperCase()}`,
              `geo:${countryCode.toUpperCase()}`,
            ],
            limit,
          }]
        : [{
            kinds: [36639],
            '#t': ['agora-action', 'pathos-challenge', 'agora-challenge'],
            limit,
          }];

      const allEvents = await nostr.query(queries, { signal });

      const parsed = allEvents
        .map(parseAction)
        .filter((c): c is Action => c !== null)
        .filter((c) => allowedCreators.has(c.pubkey))
        .filter((c) => !countryCode || c.countryCode === countryCode.toUpperCase());

      // Deduplicate by addressable coordinate (pubkey:d-tag), keeping the
      // newest event per coordinate (replaceable-event semantics).
      const byAddrKey = new Map<string, Action>();
      for (const action of parsed) {
        const addrKey = `${action.pubkey}:${action.id}`;
        const existing = byAddrKey.get(addrKey);
        if (!existing || action.createdAt > existing.createdAt) {
          byAddrKey.set(addrKey, action);
        }
      }

      const actions = Array.from(byAddrKey.values());

      const now = Date.now() / 1000;
      const upcoming: Action[] = [];
      const current: Action[] = [];
      const past: Action[] = [];

      actions.forEach((c) => {
        const startTime = c.startTime ?? c.createdAt;
        if (startTime > now) {
          upcoming.push(c);
        } else if (!c.deadline || c.deadline > now) {
          current.push(c);
        } else {
          past.push(c);
        }
      });

      upcoming.sort((a, b) => {
        const aStart = a.startTime ?? a.createdAt;
        const bStart = b.startTime ?? b.createdAt;
        return aStart - bStart;
      });
      current.sort((a, b) => {
        if (b.bounty !== a.bounty) return b.bounty - a.bounty;
        return b.createdAt - a.createdAt;
      });
      past.sort((a, b) => (b.deadline ?? 0) - (a.deadline ?? 0));

      return [...current, ...upcoming, ...past];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: !organizersLoading,
  });
}

/**
 * Fetches a single action by its addressable coordinate. Author filtering is
 * required so the d-tag identifier alone cannot be used by an attacker to
 * surface a spoofed action.
 */
export function useAction(pubkey: string | undefined, identifier: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['agora-action', pubkey, identifier],
    queryFn: async (c) => {
      if (!pubkey || !identifier) return null;
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const events = await nostr.query(
        [{
          kinds: [36639],
          authors: [pubkey],
          '#d': [identifier],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      return parseAction(events[0]);
    },
    enabled: !!pubkey && !!identifier,
    staleTime: 300_000,
  });
}
