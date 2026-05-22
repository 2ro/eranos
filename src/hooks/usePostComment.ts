import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { withAgoraTag } from '@/lib/agoraNoteTags';
import { NKinds, type NostrEvent } from '@nostrify/nostrify';

interface PaginatedFeedPage {
  events: NostrEvent[];
  oldestTimestamp: number | null;
  totalFetched: number;
}

interface PostCommentParams {
  root: NostrEvent | URL | `#${string}`; // The root event to comment on
  reply?: NostrEvent | URL | `#${string}`; // Optional reply to another comment
  content: string;
  tags?: string[][]; // Additional tags (hashtags, mentions, imeta, etc.)
}

/** Post a NIP-22 (kind 1111) comment on an event. */
export function usePostComment() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content, tags: extraTags }: PostCommentParams) => {
      // Extract hint maps from the reply event's existing tags, if available.
      const hints = extractHints(reply);
      const tags: string[][] = [];

      // Root event tags
      tags.push(...makeCommentTags('root', root, hints));

      // Reply event tags
      if (reply) {
        tags.push(...makeCommentTags('reply', reply, hints));
      } else {
        // If this is a top-level comment, use the root event's tags
        tags.push(...makeCommentTags('reply', root, hints));
      }

      // Append any extra tags (hashtags, mentions, imeta, CW, etc.)
      if (extraTags) {
        tags.push(...extraTags);
      }

      const event = await publishEvent({
        kind: 1111,
        content,
        tags: withAgoraTag(tags),
      });

      return event;
    },
    onSuccess: (event, { root }) => {
      const rootKey = root instanceof URL ? root.toString() : typeof root === 'string' ? root : root.id;
      const countryCode = getCountryCode(root);

      // Invalidate and refetch comments
      queryClient.invalidateQueries({
        queryKey: ['nostr', 'comments', rootKey]
      });

      // The home Agora activity feed (useAgoraFeed) surfaces NIP-22 comments
      // whose root is an Agora entity (campaign / pledge / community) or a
      // world-layer iso3166 / geo root. Invalidate it on every comment so
      // the freshly-posted comment shows up there without a page refresh.
      // The key shape is ['agora-feed', authorsKey, ...] — prefix sweep
      // covers every authors variant the user may have mounted.
      queryClient.invalidateQueries({ queryKey: ['agora-feed'] });
      // The mixed home feed (Feed.tsx homeFeedMode === 'agora') flattens
      // useAgoraFeed events; invalidating the underlying source query is
      // enough because the mixed selector recomputes from it.
      queryClient.invalidateQueries({ queryKey: ['mixed-feed'] });

      // Comments attached to a campaign / pledge / community (or to any
      // event that itself carries an organization `A` tag) need to refresh
      // the organization-activity shelf so they show up on the org page.
      if (isEvent(root)) {
        const orgATag = root.tags.find(([n]) => n === 'A')?.[1];
        if (orgATag) {
          queryClient.invalidateQueries({ queryKey: ['organization-activity', orgATag] });
        }
        // Predicate-match the community activity feed too — it's keyed
        // ['community-activity-feed', aTagsKey] where aTagsKey is a
        // comma-joined list of subscribed A tags.
        if (orgATag) {
          queryClient.invalidateQueries({
            predicate: (q) => {
              const [key, aTagsKey] = q.queryKey;
              return key === 'community-activity-feed'
                && typeof aTagsKey === 'string'
                && aTagsKey.split(',').includes(orgATag);
            },
          });
        }
        // Comments on a campaign also need the campaign's per-page comment
        // cache to refresh (it uses ['event-comments', aTag]).
        const rootDTag = root.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const rootATag = `${root.kind}:${root.pubkey}:${rootDTag}`;
        queryClient.invalidateQueries({ queryKey: ['event-comments', rootATag] });
      }

      if (countryCode) {
        queryClient.setQueriesData<InfiniteData<PaginatedFeedPage>>(
          { queryKey: ['agora-feed-paginated', countryCode] },
          (data) => {
            if (!data || data.pages.length === 0) return data;
            if (data.pages.some((page) => page.events.some((item) => item.id === event.id))) return data;

            const [firstPage, ...restPages] = data.pages;
            return {
              ...data,
              pages: [
                {
                  ...firstPage,
                  events: [event, ...firstPage.events],
                  totalFetched: firstPage.totalFetched + 1,
                },
                ...restPages,
              ],
            };
          },
        );

        queryClient.invalidateQueries({ queryKey: ['agora-feed-paginated', countryCode] });
        queryClient.invalidateQueries({ queryKey: ['agora-feed-new-posts', countryCode] });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['agora-feed-paginated', countryCode] });
          queryClient.invalidateQueries({ queryKey: ['agora-feed-new-posts', countryCode] });
        }, 3000);
      }
    },
  });
}

function getCountryCode(root: NostrEvent | URL | `#${string}`): string | undefined {
  if (root instanceof URL && root.protocol === 'iso3166:') {
    return root.pathname.toUpperCase();
  }

  if (typeof root === 'string' && root.toLowerCase().startsWith('iso3166:')) {
    return root.slice('iso3166:'.length).toUpperCase();
  }

  return undefined;
}

/** Build NIP-22 comment tags for a given scope and target, enriched with hints when available. */
function makeCommentTags(scope: 'root' | 'reply', target: NostrEvent | URL | `#${string}`, hints: Hints): string[][] {
  const tags: string[][] = [];
  const { aHints, eHints, pHints } = hints;

  if (typeof target === 'string') {
    tags.push(['I', target]);
  } else if (target instanceof URL) {
    tags.push(['I', target.toString()]);
  } else if (NKinds.replaceable(target.kind) || NKinds.addressable(target.kind)) {
    const d = target.tags.find(([name]) => name === 'd')?.[1] ?? '';
    const addr = `${target.kind}:${target.pubkey}:${NKinds.addressable(target.kind) ? d : ''}`;
    tags.push(['A', addr, ...aHints.get(addr) ?? []]);
  } else {
    tags.push(['E', target.id, ...eHints.get(target.id) ?? []]);
  }
  if (typeof target === 'string') {
    tags.push(['K', '#']);
  } else if (target instanceof URL) {
    switch (target.protocol) {
      case 'http:':
      case 'https:':
        tags.push(['K', 'web']);
        break;
      default:
        tags.push(['K', target.protocol.replace(/:$/, '')]);
        break;
    }
  } else {
    tags.push(['K', target.kind.toString()]);
    tags.push(['P', target.pubkey, ...pHints.get(target.pubkey) ?? []]);
  }

  // Lowercase all tag names for reply scope
  if (scope === 'reply') {
    return tags.map(([name, ...values]) => [name.toLowerCase(), ...values]);
  }

  // Root scope: uppercase tags
  return tags;
}

interface Hints {
  /** Relay URL hints keyed by pubkey. */
  pHints: Map<string, string[]>;
  /** Relay URL and author hints keyed by event ID. */
  eHints: Map<string, string[]>;
  /** Relay URL hints keyed by addr (`kind:pubkey:d`). */
  aHints: Map<string, string[]>;
}

/** Extract relay/author hint maps from an event's tags (case-insensitive). */
function extractHints(target: NostrEvent | URL | `#${string}` | undefined): Hints {
  const pHints = new Map<string, string[]>();
  const eHints = new Map<string, string[]>();
  const aHints = new Map<string, string[]>();

  if (!isEvent(target)) {
    return { pHints, eHints, aHints };
  }

  for (const [name, value, ...hints] of target.tags) {
    const n = name?.toLowerCase();

    if (n === 'p') {
      try {
        const relayUrl = new URL(hints[0]);
        pHints.set(value, [relayUrl.href]);
      } catch {
        // Not a valid URL, ignore hints for this tag
      }
    } else if (n === 'a') {
      try {
        const relayUrl = new URL(hints[0]);
        aHints.set(value, [relayUrl.href]);
      } catch {
        // Not a valid URL, ignore hints for this tag
      }
    } else if (n === 'e') {
      const author = /^[0-9a-f]{64}$/.test(hints[1]) ? hints[1] : undefined;
      try {
        const relayUrl = new URL(hints[0]);
        eHints.set(value, [relayUrl.href, ...(author ? [author] : [])]);
      } catch {
        if (author) {
          eHints.set(value, ['', author]);
        }
      }
    }
  }

  return { pHints, eHints, aHints };
}

function isEvent(target: NostrEvent | URL | `#${string}` | undefined): target is NostrEvent {
  return !!target && typeof target !== 'string' && !(target instanceof URL);
}
