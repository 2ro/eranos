import type { ToolContext } from './Tool';

/** Fetch the logged-in user's contact list pubkeys (kind 3 `p` tags). */
export async function fetchContactPubkeys(ctx: ToolContext): Promise<string[]> {
  if (!ctx.user) return [];
  try {
    const contactEvents = await ctx.nostr.query(
      [{ kinds: [3], authors: [ctx.user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(5000) },
    );
    return contactEvents[0]?.tags
      .filter(([t]) => t === 'p')
      .map(([, pk]) => pk) ?? [];
  } catch {
    return [];
  }
}
