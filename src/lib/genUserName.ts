/**
 * Resolve a user's display name from Nostr metadata with consistent fallback logic.
 * Checks display_name first (richer name per NIP-01), then name, then falls back to
 * "Anonymous" when neither is available.
 *
 * Prefer this over manually chaining `metadata?.name || genUserName(pubkey)`.
 */
export function getDisplayName(
  metadata: { display_name?: string; name?: string } | undefined,
  pubkey: string,
): string {
  return metadata?.display_name || metadata?.name || genUserName(pubkey);
}

/**
 * Fallback display name for users without kind-0 metadata.
 *
 * Always returns "Anonymous". The function previously generated a deterministic
 * adjective + animal pseudonym from the pubkey, but the UI now uses a single
 * stable label instead. The signature is preserved so existing call sites keep
 * working unchanged.
 */
export function genUserName(_seed: string | undefined): string {
  return 'Anonymous';
}
