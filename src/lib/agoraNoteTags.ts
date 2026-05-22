/**
 * Silent tag attached to every top-level kind 1 note composed inside Agora.
 *
 * The `t:agora` tag is the indexing strategy for the Agora activity feed —
 * any note posted from anywhere in the app carries this tag so the feed
 * can surface it without minting a new event kind. The tag is added at
 * publish time by {@link ComposeBox}; it is not shown to the user.
 *
 * Replies, quotes, polls, and NIP-22 comments (kind 1111) do NOT get this
 * tag — they inherit their root's context and adding `t:agora` would
 * muddy the feed with off-topic replies.
 */
export const AGORA_DEFAULT_NOTE_TAGS: string[][] = [['t', 'agora']];
