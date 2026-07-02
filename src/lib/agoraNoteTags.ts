/**
 * The single-letter `t` tag that marks an event as first-class Agora content.
 *
 * Every event Agora creates carries `["t", "agora"]` so the Agora activity
 * feed can filter strictly server-side via the relay-indexed `#t` filter
 * (multi-letter tags like `client` are not indexed by relays, so NIP-89
 * cannot serve this purpose).
 *
 * Tagged kinds: 1 (notes, replies, quotes), 1111 (comments via usePostComment),
 * 9041 (fundraising goals), 30223 (campaigns), 31922 / 31923
 * (calendar events), 34550 (communities), 36639 (pledges).
 *
 * Country-rooted world posts (kind 1111 / 1068 with `#k=iso3166` or `geo`)
 * are surfaced regardless of this tag — the world layer is intentionally
 * cross-client.
 *
 * Untagged kinds (intentional): 0, 3, 6, 7, 8, 16, 62, 1311, 30009,
 * 10000-series, 30078, encrypted DMs. Reactions, reposts, follows, profile
 * metadata, lists, settings, badges, and chat are user-state or response
 * events — not first-class Agora content.
 *
 * See `NIP.md` (§ Agora Content Marker) for the canonical protocol doc.
 */
export const AGORA_DEFAULT_NOTE_TAGS: string[][] = [['t', 'agora']];

/**
 * Append `["t", "agora"]` to a tag array if it is not already present.
 *
 * Use at every Agora publish site so the feed can strictly filter by
 * `#t=agora`. Dedupes user-supplied `t` tags (e.g. campaigns let users
 * enter free-text hashtags — typing "agora" must not yield two tags).
 */
export function withAgoraTag(tags: string[][]): string[][] {
  const hasAgora = tags.some(
    ([name, value]) => name === 't' && value?.toLowerCase() === 'agora',
  );
  return hasAgora ? tags : [...tags, ['t', 'agora']];
}

/**
 * Returns `true` when an event carries Agora's `["t", "agora"]` marker
 * (case-insensitive on the value).
 *
 * Use to client-side filter discovery surfaces — e.g. the moderator
 * "Pending review" list on `/communities` only surfaces orgs minted
 * through Agora's create flow, so reviewers aren't drowning in every
 * kind 34550 community on the network.
 */
export function hasAgoraTag(tags: string[][]): boolean {
  return tags.some(
    ([name, value]) => name === 't' && value?.toLowerCase() === 'agora',
  );
}
