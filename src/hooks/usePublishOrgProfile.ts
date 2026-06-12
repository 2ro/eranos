import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import type { OrgProfileDraft } from '@/components/onboarding/VerifierIdentityStep';

/** Safely parse a kind-0 `content` JSON string into a metadata object. */
function parseMetadata(content: string | undefined): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed existing profile shouldn't block writing a fresh one.
  }
  return {};
}

/**
 * Publish the verifier's organization profile as a kind-0 event from the
 * collected {@link OrgProfileDraft}.
 *
 * - **Read-modify-write:** merges onto any existing kind-0 (via
 *   `fetchFreshEvent` + `prev`) so other metadata fields and `published_at`
 *   are preserved.
 * - **Signer guard:** when `expectedPubkey` is provided (the signup flow),
 *   refuses to publish if the active signer doesn't match the freshly
 *   created key — otherwise a failed auto-switch could overwrite a
 *   different account's profile.
 *
 * Throws on failure so callers can surface a non-fatal toast and still let
 * the user continue.
 */
export function usePublishOrgProfile() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { draft: OrgProfileDraft; expectedPubkey?: string }>({
    mutationFn: async ({ draft, expectedPubkey }) => {
      if (!user) throw new Error('Not logged in');
      if (expectedPubkey && user.pubkey !== expectedPubkey) {
        throw new Error('Active account does not match the new key');
      }

      const name = draft.name.trim();
      const website = draft.website.trim();
      const picture = draft.picture.trim();
      const banner = draft.banner.trim();
      const about = draft.about.trim();

      const prev = await fetchFreshEvent(nostr, { kinds: [0], authors: [user.pubkey] });
      const metadata = parseMetadata(prev?.content);

      if (name) {
        metadata.name = name;
        metadata.display_name = name;
      }
      if (website) metadata.website = website;
      if (picture) metadata.picture = picture;
      if (banner) metadata.banner = banner;
      if (about) metadata.about = about;

      await publishEvent({
        kind: 0,
        content: JSON.stringify(metadata),
        prev: prev ?? undefined,
      });
    },
    onSuccess: () => {
      if (user) {
        void queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
        void queryClient.invalidateQueries({ queryKey: ['logins'] });
      }
    },
  });
}
