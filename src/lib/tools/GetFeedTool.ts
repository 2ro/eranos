import { z } from 'zod';
import { nip19 } from 'nostr-tools';

import { DITTO_RELAYS } from '@/lib/appRelays';
import { getCountryFilterValues, parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { ZAP_GOAL_KIND } from '@/lib/goalUtils';
import { buildTagFilterValues } from '@/lib/tagFilterValues';
import { fetchCommunityATags, fetchContactPubkeys, fetchInterests } from './helpers';

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { Tool, ToolResult, ToolContext } from './Tool';

const WORLD_KINDS = [1111, 1068];
const CHALLENGE_KIND = 36639;
const CHALLENGE_T_ALIASES = ['agora-action', 'pathos-challenge', 'agora-challenge'];

const inputSchema = z.object({
  feed_name: z.string().optional().describe('Name of an existing feed: "following", "network", "follows", "global", "world", or a saved feed label.'),
  kinds: z.array(z.number()).optional().describe('Event kind numbers to filter (e.g. [1] for text notes, [20] for photos, [30023] for articles).'),
  authors: z.array(z.string()).optional().describe('Author filter. Use "$me" for the logged-in user, "$contacts" for their follow list, or hex pubkeys.'),
  search: z.string().optional().describe('Full-text search query (NIP-50).'),
  hashtag: z.string().optional().describe('Filter by hashtag (without the # symbol).'),
  country: z.string().optional().describe('ISO 3166-1 alpha-2 country code (e.g. "VE", "US", "BR"). Queries NIP-73 geographic comments (kind 1111) for that country.'),
  hours: z.number().optional().describe('How many hours back to look. Default 12. Use 0 to disable the time window entirely (useful for "latest post by X" queries where the post could be from any time).'),
  limit: z.number().optional().describe('Maximum number of posts to return. Default 50, max 100.'),
});

type Params = z.infer<typeof inputSchema>;

export const GetFeedTool: Tool<Params> = {
  description: `Read posts from a feed and return their content. Use this when the user asks what people are talking about, wants a summary of recent activity, or asks about a specific topic or country.

You can reference an existing feed by name or build a query on the fly:

**Named feeds:**
- "following" — same source family as the app's Following tab: followed people, communities, hashtags/topics, and countries
- "network" / "follows" — posts from people the user follows only
- "global" — recent posts from everyone
- "world" — same source as the app's World tab: geographic country/geo posts, polls, and Agora actions/challenges
- Any saved feed label the user has created (check the system prompt for available feeds)

**Ad-hoc queries:**
- kinds: event kinds to include (default: [1] for text notes)
- authors: who to include — "$me", "$contacts", or hex pubkeys
- search: full-text NIP-50 search query
- hashtag: filter by hashtag (without #)
- country: ISO 3166-1 alpha-2 country code (e.g. "VE", "US") — queries the country activity feed (kind 1111 geographic comments)

**Time window:**
- hours: how far back to look (default: 12). Set to 0 to disable the time window (for "latest post by X" queries)

When the user asks what's happening in the world, use feed_name "world". When they ask about their Following tab/feed, use feed_name "following". When the user asks about a country (e.g. "what's going on in Venezuela?"), use the country parameter. When they ask about friends/network only, use feed_name "network". When they ask about a topic that is not one of their followed topics, use search or hashtag.

After receiving results, summarize the key topics, conversations, and notable posts for the user.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const feedName = (args.feed_name ?? '').trim().toLowerCase();
    const country = (args.country ?? '').trim().toUpperCase();
    const hours = args.hours === 0 ? 0 : Math.max(1, args.hours ?? 12);
    const limit = Math.min(Math.max(1, args.limit ?? 50), 100);
    const sinceTimestamp = hours > 0 ? Math.floor(Date.now() / 1000) - hours * 3600 : undefined;

    const contactPubkeys = await fetchContactPubkeys(ctx);
    const shouldLoadFollowingSources = feedName === 'following';
    const [followedHashtags, followedCountryInterests, communityATags] = shouldLoadFollowingSources
      ? await Promise.all([
        fetchInterests(ctx, 't'),
        fetchInterests(ctx, 'i'),
        fetchCommunityATags(ctx),
      ])
      : [[], [], []];
    const followedCountries = followedCountryInterests
      .map((identifier) => parseCountryIdentifier(identifier))
      .filter((code): code is string => !!code);

    const resolved = resolveFilter(args, ctx, {
      feedName,
      country,
      limit,
      sinceTimestamp,
      contactPubkeys,
      followedHashtags,
      followedCountries,
      communityATags,
    });
    if ('error' in resolved) {
      return { result: JSON.stringify(resolved) };
    }

    const { filters, needsDittoRelay, feedLabel } = resolved;

    const store = needsDittoRelay ? ctx.nostr.group(DITTO_RELAYS) : ctx.nostr;
    const events = await store.query(
      filters,
      { signal: AbortSignal.timeout(10000) },
    );

    const filtered = feedLabel === 'world' ? filterWorldEvents(events) : events;
    const sorted = filtered.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at).slice(0, limit);

    if (sorted.length === 0) {
      return {
        result: JSON.stringify({
          success: true,
          feed: feedLabel,
          hours,
          post_count: 0,
          data: hours > 0
            ? `No posts found in the "${feedLabel}" feed in the past ${hours} hours.`
            : `No posts found in the "${feedLabel}" feed.`,
        }),
      };
    }

    const text = await formatEvents(sorted, feedLabel, hours, ctx);

    return {
      result: JSON.stringify({
        success: true,
        feed: feedLabel,
        hours,
        post_count: sorted.length,
        data: text,
      }),
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve author variables ($me, $contacts) to concrete pubkeys. */
function resolveAuthors(
  authors: string[],
  userPubkey: string | undefined,
  contactPubkeys: string[],
): string[] {
  return authors.flatMap((a) => {
    if (a === '$me') return userPubkey ? [userPubkey] : [];
    if (a === '$contacts') return contactPubkeys;
    // Treat $follows the same as $contacts (saved feeds may use this form)
    if (a === '$follows') return contactPubkeys;
    return [a];
  });
}

interface ResolveContext {
  feedName: string;
  country: string;
  limit: number;
  sinceTimestamp: number | undefined;
  contactPubkeys: string[];
  followedHashtags: string[];
  followedCountries: string[];
  communityATags: string[];
}

type ResolvedFilter =
  | { filters: NostrFilter[]; needsDittoRelay: boolean; feedLabel: string }
  | { error: string; available_feeds?: string };

/** Build a base filter with optional `since`. */
function baseFilter(sinceTimestamp: number | undefined, limit: number): NostrFilter {
  const f: NostrFilter = { limit };
  if (sinceTimestamp !== undefined) f.since = sinceTimestamp;
  return f;
}

/** Build the Nostr filter from the tool arguments. */
function resolveFilter(
  args: Params, ctx: ToolContext,
  { feedName, country, limit, sinceTimestamp, contactPubkeys, followedHashtags, followedCountries, communityATags }: ResolveContext,
): ResolvedFilter {
  const enabledKinds = getEnabledFeedKinds(ctx.config.feedSettings);

  // Country query — NIP-73 geographic comments
  if (country) {
    // Validate as ISO 3166-1 alpha-2 (2 uppercase letters)
    if (!/^[A-Z]{2}$/.test(country)) {
      return { error: `Invalid country code "${country}". Use a 2-letter ISO 3166-1 alpha-2 code (e.g. "US", "VE", "JP").` };
    }
    return {
      filters: [{ ...baseFilter(sinceTimestamp, limit), kinds: [1111], '#I': [`iso3166:${country}`] } as NostrFilter],
      needsDittoRelay: false,
      feedLabel: `country: ${country}`,
    };
  }

  // Named feed: network/follows — people-only follow graph.
  if (feedName === 'network' || feedName === 'follows') {
    if (!ctx.user) return { error: 'Must be logged in to read the network feed.' };
    const authors = [ctx.user.pubkey, ...contactPubkeys];
    if (authors.length <= 1) return { error: 'The user is not following anyone yet.' };
    return { filters: [{ ...baseFilter(sinceTimestamp, limit), kinds: enabledKinds, authors }], needsDittoRelay: false, feedLabel: 'network' };
  }

  // Named feed: following — people + followed communities + followed hashtags + followed countries.
  if (feedName === 'following') {
    if (!ctx.user) return { error: 'Must be logged in to read the following feed.' };

    const filters: NostrFilter[] = [];
    const authors = [ctx.user.pubkey, ...contactPubkeys];
    if (authors.length > 0) {
      filters.push({ ...baseFilter(sinceTimestamp, limit), kinds: enabledKinds, authors });
    }

    if (communityATags.length > 0) {
      filters.push({ ...baseFilter(sinceTimestamp, limit), kinds: [1111], '#A': communityATags } as NostrFilter);
      filters.push({ ...baseFilter(sinceTimestamp, limit), kinds: [ZAP_GOAL_KIND], '#a': communityATags } as NostrFilter);
    }

    if (followedHashtags.length > 0) {
      const hashtagValues = Array.from(new Set(followedHashtags.flatMap((tag) => buildTagFilterValues(tag, '#t'))));
      const hashtagKinds = enabledKinds.filter((kind) => !isRepostKind(kind));
      if (hashtagValues.length > 0 && hashtagKinds.length > 0) {
        filters.push({ ...baseFilter(sinceTimestamp, limit), kinds: hashtagKinds, '#t': hashtagValues } as NostrFilter);
      }
    }

    if (followedCountries.length > 0) {
      const countryValues = followedCountries.flatMap((code) => getCountryFilterValues(code, true));
      filters.push({ ...baseFilter(sinceTimestamp, limit), kinds: [1111, 1068], '#i': countryValues } as NostrFilter);
      filters.push({ ...baseFilter(sinceTimestamp, Math.max(1, Math.floor(limit / 4))), kinds: [CHALLENGE_KIND], '#t': CHALLENGE_T_ALIASES, '#i': countryValues } as NostrFilter);
    }

    if (filters.length === 0) {
      return { error: 'No followed people, hashtags, or countries found for the Following feed.' };
    }

    return { filters, needsDittoRelay: false, feedLabel: 'following' };
  }

  // Named feed: global
  if (feedName === 'global') {
    return { filters: [{ ...baseFilter(sinceTimestamp, limit), kinds: [1] }], needsDittoRelay: false, feedLabel: 'global' };
  }

  // Named feed: world — same initial query source as useWorldFeed.
  if (feedName === 'world') {
    return {
      filters: [
        { ...baseFilter(sinceTimestamp, limit), kinds: WORLD_KINDS, '#k': ['iso3166', 'geo'] } as NostrFilter,
        { ...baseFilter(sinceTimestamp, Math.max(1, Math.floor(limit / 4))), kinds: [CHALLENGE_KIND], '#t': CHALLENGE_T_ALIASES } as NostrFilter,
      ],
      needsDittoRelay: false,
      feedLabel: 'world',
    };
  }

  // Named feed: user saved feed
  if (feedName) {
    const match = ctx.savedFeeds.find((f) => f.label.toLowerCase() === feedName);
    if (!match) {
      const available = ctx.savedFeeds.map((f) => f.label).join(', ');
      return {
        error: `No saved feed named "${args.feed_name}".`,
        available_feeds: available ? `following, network, global, world, ${available}` : 'following, network, global, world',
      };
    }
    try {
      const sf = match.filter as Record<string, unknown>;
      const filter: NostrFilter = baseFilter(sinceTimestamp, limit);
      let needsDittoRelay = false;

      if (Array.isArray(sf.kinds)) filter.kinds = sf.kinds as number[];
      if (typeof sf.search === 'string') {
        filter.search = sf.search;
        // NIP-50 extensions (sort:, protocol:, etc.) require Ditto relay
        if (/sort:|protocol:|media:|language:/.test(sf.search)) needsDittoRelay = true;
      }
      if (Array.isArray(sf.authors)) {
        const resolved = resolveAuthors(sf.authors as string[], ctx.user?.pubkey, contactPubkeys);
        if (resolved.length > 0) filter.authors = resolved;
      }
      // Carry over any tag filters (e.g. #t, #p)
      for (const [key, value] of Object.entries(sf)) {
        if (key.startsWith('#') && Array.isArray(value)) {
          (filter as Record<string, unknown>)[key] = value;
        }
      }

      return { filters: [filter], needsDittoRelay, feedLabel: match.label };
    } catch (err) {
      return { error: `Failed to resolve saved feed "${match.label}": ${err instanceof Error ? err.message : 'Unknown error'}` };
    }
  }

  // Ad-hoc query — build filter directly from tool args
  const filter: NostrFilter = baseFilter(sinceTimestamp, limit);
  let needsDittoRelay = false;

  filter.kinds = args.kinds ?? [1];

  if (args.authors) {
    const resolved = resolveAuthors(args.authors, ctx.user?.pubkey, contactPubkeys);
    if (resolved.length > 0) filter.authors = resolved;
  }

  if (args.search) {
    filter.search = args.search;
    if (/sort:|protocol:|media:|language:/.test(args.search)) needsDittoRelay = true;
  }

  if (args.hashtag?.trim()) {
    (filter as Record<string, unknown>)['#t'] = [args.hashtag.trim().toLowerCase()];
  }

  const feedLabel = args.search ? `search: ${args.search}` : args.hashtag ? `#${args.hashtag}` : 'ad-hoc';
  return { filters: [filter], needsDittoRelay, feedLabel };
}

/** Match the World tab's raw event eligibility before summarizing. */
function filterWorldEvents(events: NostrEvent[]): NostrEvent[] {
  return events.filter((event) => {
    if (event.kind === CHALLENGE_KIND) return true;
    if (event.kind === 1068) return true;
    const kTags = event.tags.filter(([name]) => name === 'k').map(([, v]) => v);
    const KTags = event.tags.filter(([name]) => name === 'K').map(([, v]) => v);
    return kTags.includes('iso3166') || kTags.includes('geo') || KTags.includes(String(CHALLENGE_KIND));
  });
}

/** Format events into a markdown summary with author display names. */
async function formatEvents(
  sorted: NostrEvent[], feedLabel: string, hours: number, ctx: ToolContext,
): Promise<string> {
  const uniquePubkeys = [...new Set(sorted.map((e) => e.pubkey))];
  const profileMap = new Map<string, { name?: string; display_name?: string; nip05?: string }>();

  try {
    const profiles = await ctx.nostr.query(
      [{ kinds: [0], authors: uniquePubkeys }],
      { signal: AbortSignal.timeout(5000) },
    );
    for (const p of profiles) {
      try {
        const meta = JSON.parse(p.content);
        profileMap.set(p.pubkey, {
          name: meta.name,
          display_name: meta.display_name,
          nip05: meta.nip05,
        });
      } catch {
        // Skip invalid metadata
      }
    }
  } catch {
    // Profiles unavailable — continue with pubkey-only display
  }

  const formatTimeAgo = (ts: number): string => {
    const seconds = Math.floor(Date.now() / 1000) - ts;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  let text = hours > 0
    ? `## ${feedLabel} — past ${hours}h (${sorted.length} posts)\n\n`
    : `## ${feedLabel} — all time (${sorted.length} posts)\n\n`;

  for (const event of sorted) {
    const profile = profileMap.get(event.pubkey);
    const displayName = profile?.display_name || profile?.name || nip19.npubEncode(event.pubkey).slice(0, 16) + '...';

    const hashtags = event.tags
      .filter(([t]) => t === 't')
      .map(([, v]) => `#${v}`)
      .join(' ');

    text += `**${displayName}** (${formatTimeAgo(event.created_at)}):\n`;
    text += `${event.content.slice(0, 500)}${event.content.length > 500 ? '...' : ''}\n`;
    if (hashtags) text += `Tags: ${hashtags}\n`;
    text += '\n---\n\n';
  }

  return text;
}
