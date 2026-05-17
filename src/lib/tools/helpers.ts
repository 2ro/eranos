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

/** Fetch the logged-in user's NIP-51 interests (kind 10015) for a tag name. */
export async function fetchInterests(ctx: ToolContext, tagName: 't' | 'i'): Promise<string[]> {
  if (!ctx.user) return [];
  try {
    const events = await ctx.nostr.query(
      [{ kinds: [10015], authors: [ctx.user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(5000) },
    );
    const latest = events.length > 0
      ? events.reduce((a, b) => (a.created_at > b.created_at ? a : b))
      : undefined;
    return latest?.tags
      .filter(([name]) => name === tagName)
      .map(([, value]) => value?.trim())
      .filter((value): value is string => !!value) ?? [];
  } catch {
    return [];
  }
}

/** Fetch followed community coordinates from the user's NIP-51 communities list (kind 10004). */
export async function fetchCommunityATags(ctx: ToolContext): Promise<string[]> {
  if (!ctx.user) return [];
  try {
    const events = await ctx.nostr.query(
      [{ kinds: [10004], authors: [ctx.user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(5000) },
    );
    const latest = events.length > 0
      ? events.reduce((a, b) => (a.created_at > b.created_at ? a : b))
      : undefined;
    return latest?.tags
      .filter(([name, value]) => name === 'a' && value?.startsWith('34550:'))
      .map(([, value]) => value)
      .filter((value): value is string => !!value) ?? [];
  } catch {
    return [];
  }
}
