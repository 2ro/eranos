import { useNostr } from '@nostrify/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  CAMPAIGN_KIND,
  parseCampaign,
  type ParsedCampaign,
} from '@/lib/campaign';

interface ArchiveCampaignArgs {
  campaign: ParsedCampaign;
  /** `true` to mark archived, `false` to reopen by removing the status tag. */
  archived: boolean;
}

/**
 * Archive (or reopen) a fundraising campaign without deleting it.
 *
 * Archiving republishes the campaign with `["status", "archived"]` so the
 * UI can hide it from the main fundraisers feed while still loading it by
 * direct link. Past donations remain intact because the addressable
 * coordinate (kind, pubkey, d) is unchanged.
 *
 * Unarchive removes the status tag (or any other status value), bringing
 * the campaign back into the main list.
 *
 * Only the campaign author can archive — the relay would reject anyone
 * else's republish under the same coordinate, but we also guard at the
 * UI layer.
 */
export function useArchiveCampaign() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaign, archived }: ArchiveCampaignArgs) => {
      if (!user) throw new Error('You must be logged in.');
      if (user.pubkey !== campaign.pubkey) {
        throw new Error('Only the campaign author can change its status.');
      }

      // Read-modify-write: never trust the local cache for addressable mutations.
      const prev = await fetchFreshEvent(nostr, {
        kinds: [CAMPAIGN_KIND],
        authors: [user.pubkey],
        '#d': [campaign.identifier],
      });
      if (!prev || !parseCampaign(prev)) {
        throw new Error('Could not load the latest version of this campaign.');
      }

      // Carry over every tag except any existing `status` tag, which we own here.
      const nextTags = prev.tags.filter(([name]) => name !== 'status');
      if (archived) nextTags.push(['status', 'archived']);

      const published = await publishEvent({
        kind: CAMPAIGN_KIND,
        content: prev.content,
        tags: nextTags,
        prev,
      });

      const parsed = parseCampaign(published);
      if (!parsed) {
        throw new Error('Updated campaign failed validation.');
      }
      return parsed;
    },
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({
        queryKey: ['campaign', campaign.pubkey, campaign.identifier],
      });
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-featured'] });
    },
  });
}
