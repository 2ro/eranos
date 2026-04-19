/**
 * Resolve a user's display name from Nostr metadata with consistent fallback logic.
 * Checks display_name first (richer name per NIP-01), then name, then generates a
 * deterministic pseudonym from the pubkey.
 *
 * Prefer this over manually chaining `metadata?.name || genUserName(pubkey)`.
 */
export function getDisplayName(
  metadata: { display_name?: string; name?: string } | undefined,
  pubkey: string,
): string {
  return metadata?.display_name || metadata?.name || genUserName(pubkey);
}

/** Generate a deterministic user display name based on a string seed. */
export function genUserName(seed: string | undefined): string {
  if (!seed) return 'Anonymous';
  // Use a simple hash of the pubkey to generate consistent adjective + noun combinations
  const adjectives = [
    'Swift', 'Bright', 'Calm', 'Bold', 'Wise', 'Kind', 'Quick', 'Brave',
    'Cool', 'Sharp', 'Clear', 'Strong', 'Smart', 'Fast', 'Keen', 'Pure',
    'Noble', 'Gentle', 'Fierce', 'Steady', 'Clever', 'Proud', 'Silent', 'Wild'
  ];
  
  const nouns = [
    'Fox', 'Eagle', 'Wolf', 'Bear', 'Lion', 'Tiger', 'Hawk', 'Owl',
    'Deer', 'Raven', 'Falcon', 'Lynx', 'Otter', 'Whale', 'Shark', 'Dolphin',
    'Phoenix', 'Dragon', 'Panther', 'Jaguar', 'Cheetah', 'Leopard', 'Puma', 'Cobra'
  ];

  // Create a simple hash from the pubkey
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use absolute value to ensure positive index
  const adjIndex = Math.abs(hash) % adjectives.length;
  const nounIndex = Math.abs(hash >> 8) % nouns.length;
  
  return [adjectives[adjIndex], nouns[nounIndex]].join(' ');
}