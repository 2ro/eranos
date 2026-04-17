import { useNostr } from '@nostrify/react';

/**
 * Hook that returns the main nostr pool for querying feeds and profiles.
 * The pool is configured in NostrProvider with the correct read relays
 * (including testnet relay in testnet mode).
 * 
 * @returns The main nostr pool for querying
 */
export function useFeedRelays() {
  const { nostr } = useNostr();
  return nostr;
}
