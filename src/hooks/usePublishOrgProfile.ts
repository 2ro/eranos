import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  mergeProfileDraft,
  parseProfileMetadata,
  type ProfileDraft,
} from '@/lib/profileDraft';

/**
 * Publish a kind-0 profile event from the collected {@link ProfileDraft}.
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

  return useMutation<void, Error, { draft: ProfileDraft; expectedPubkey?: string }>({
    mutationFn: async ({ draft, expectedPubkey }) => {
      if (!user) throw new Error('Not logged in');
      if (expectedPubkey && user.pubkey !== expectedPubkey) {
        throw new Error('Active account does not match the new key');
      }

      const prev = await fetchFreshEvent(nostr, { kinds: [0], authors: [user.pubkey] });
      const metadata = mergeProfileDraft(parseProfileMetadata(prev?.content), draft);

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
