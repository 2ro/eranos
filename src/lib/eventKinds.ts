/**
 * Helpers for classifying Nostr event kinds by their storage semantics.
 *
 * Kind ranges (per NIP-01):
 *   - 0, 3                — legacy replaceable
 *   - 10000–19999         — replaceable
 *   - 20000–29999         — ephemeral
 *   - 30000–39999         — addressable (parameterized replaceable)
 *
 * For most "is this event replaceable" checks, prefer `isReplaceableLikeKind`,
 * which treats addressable and legacy-replaceable kinds as replaceable too.
 */

/** Returns true for parameterized replaceable (addressable) kinds 30000–39999. */
export function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

