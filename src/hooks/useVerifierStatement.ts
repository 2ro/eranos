import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { withAgoraTag } from '@/lib/agoraNoteTags';

/**
 * Kind 15063 — Verifier Statement (see NIP.md).
 *
 * A replaceable event (one per user) whose `content` is a freeform Markdown
 * statement describing how the author verifies campaigns. Anyone can publish
 * one to "become a verifier"; empty content means the author has withdrawn.
 */
export const VERIFIER_STATEMENT_KIND = 15063;

/**
 * Query a user's verifier statement (kind 15063).
 *
 * Returns the trimmed Markdown statement, or `null` when the user has no
 * statement or has withdrawn it (empty content).
 */
export function useVerifierStatement(pubkey: string | undefined) {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['verifier-statement', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const events = await nostr.query(
        [{ kinds: [VERIFIER_STATEMENT_KIND], authors: [pubkey], limit: 1 }],
        { signal },
      );

      if (events.length === 0) return null;

      // Relays may return more than one; keep the newest.
      const event = events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );

      const content = event.content.trim();
      // Empty content = statement withdrawn → treat as no verifier.
      if (!content) return null;

      return content;
    },
    enabled: !!pubkey,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    statement: query.data ?? null,
    isVerifier: !!query.data,
    isLoading: query.isLoading,
  };
}

/**
 * Publish (or update) the logged-in user's verifier statement.
 *
 * Pass an empty string to withdraw — the event is published with empty
 * content, which `useVerifierStatement` treats as "no longer a verifier".
 *
 * Performs a read-modify-write so `published_at` is preserved across edits.
 */
export function useSetVerifierStatement(): UseMutationResult<void, Error, string> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (statement: string) => {
      if (!user) throw new Error('Not logged in');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [VERIFIER_STATEMENT_KIND],
        authors: [user.pubkey],
      });

      await publishEvent({
        kind: VERIFIER_STATEMENT_KIND,
        content: statement.trim(),
        tags: withAgoraTag([
          ['alt', 'Verifier statement: how this account verifies campaigns'],
        ]),
        prev: prev ?? undefined,
      });
    },
    onSuccess: async () => {
      if (user) {
        await queryClient.invalidateQueries({ queryKey: ['verifier-statement', user.pubkey] });
      }
    },
  });
}
