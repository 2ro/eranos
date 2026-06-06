import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNostrPublish } from './useNostrPublish';
import { useCurrentUser } from './useCurrentUser';
import { useCampaignLabelers } from './useCampaignLabelers';
import { CAMPAIGN_KIND } from '@/lib/campaign';
import { LABEL_KIND } from '@/lib/agoraModeration';
import {
  AGORA_VERIFIED_NAMESPACE,
  AGORA_VERIFIED_VALUE,
  EMPTY_VERIFICATION_DATA,
  type CampaignVerification,
  type VerificationData,
  foldVerificationLabels,
} from '@/lib/agoraVerification';

/**
 * Fetches and folds campaign **verification** label events (NIP-32 kind
 * 1985 in the `agora.verified` namespace) authored by the configured
 * labeler allowlist ({@link useCampaignLabelers}). Returns a per-coordinate
 * map of which labelers have verified each campaign — the UI stacks their
 * avatars into a badge.
 *
 * The mutations let a logged-in labeler vouch for or retract verification:
 * - `verify({ coord })` publishes a kind 1985 label in the verified namespace.
 * - `unverify({ event })` publishes a NIP-09 kind 5 deletion of that
 *   labeler's own prior label event.
 *
 * As with moderation labels, the read query filters by `authors: labelers`,
 * so a `verified` label signed by anyone outside the allowlist is ignored —
 * the verification badge can never be forged by an untrusted pubkey.
 */
export function useCampaignVerifications() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const labelers = useCampaignLabelers();

  // Stable key so the query refetches when the labeler set changes.
  const labelersKey = [...labelers].sort().join(',');

  // True when the logged-in user is an authorized labeler. Gates the
  // verify / unverify controls in the UI.
  const isLabeler = !!user && labelers.includes(user.pubkey);

  const verificationQuery = useQuery({
    queryKey: ['campaign-verifications', labelersKey],
    // Never fire with an empty `authors:` filter — that would match every
    // `agora.verified` label from any author and break the trust model.
    enabled: labelers.length > 0,
    queryFn: async ({ signal }): Promise<VerificationData> => {
      const events = await nostr.query(
        [
          {
            kinds: [LABEL_KIND],
            authors: labelers,
            '#L': [AGORA_VERIFIED_NAMESPACE],
            '#l': [AGORA_VERIFIED_VALUE],
            limit: 2000,
          },
        ],
        { signal },
      );
      return foldVerificationLabels(events, labelers, CAMPAIGN_KIND);
    },
    staleTime: 30_000,
  });

  const verify = useMutation({
    mutationFn: async ({ coord }: { coord: string }) => {
      if (!user) throw new Error('You must be logged in to verify a campaign.');
      if (!labelers.includes(user.pubkey)) {
        throw new Error('Only authorized labelers can verify campaigns.');
      }
      if (!coord.startsWith(`${CAMPAIGN_KIND}:`)) {
        throw new Error(`Coordinate must start with ${CAMPAIGN_KIND}:`);
      }
      return publishEvent({
        kind: LABEL_KIND,
        content: '',
        tags: [
          ['L', AGORA_VERIFIED_NAMESPACE],
          ['l', AGORA_VERIFIED_VALUE, AGORA_VERIFIED_NAMESPACE],
          ['a', coord],
          ['alt', 'Campaign verification'],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-verifications'] });
    },
  });

  const unverify = useMutation({
    mutationFn: async ({ verification }: { verification: CampaignVerification }) => {
      if (!user) throw new Error('You must be logged in to unverify a campaign.');
      if (verification.pubkey !== user.pubkey) {
        // A labeler can only retract their own verification — a kind 5
        // deletion only takes effect on events the signer authored.
        throw new Error('You can only remove your own verification.');
      }
      // NIP-09 deletion of the label event. Kind 1985 is a regular event,
      // so an `e` tag (plus `k` for relays that key on kind) is sufficient.
      return publishEvent({
        kind: 5,
        content: '',
        tags: [
          ['e', verification.event.id],
          ['k', String(LABEL_KIND)],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-verifications'] });
    },
  });

  return {
    data: verificationQuery.data ?? EMPTY_VERIFICATION_DATA,
    isLoading: verificationQuery.isLoading,
    isReady: verificationQuery.isSuccess,
    /** Whether the logged-in user may verify / unverify campaigns. */
    isLabeler,
    verify,
    unverify,
  };
}
