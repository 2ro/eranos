import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { CAMPAIGN_KIND, type CampaignCategory, parseCampaign, type ParsedCampaign } from '@/lib/campaign';

interface UseCampaignsOptions {
  /** Optional category filter (`t` tag). */
  category?: CampaignCategory;
  /** Maximum number of events to fetch from relays. Default: 60. */
  limit?: number;
  /** Authors to fetch from, e.g. for a profile's campaigns. */
  authors?: string[];
  /**
   * Restrict to campaigns whose recipient `p` tags include any of these
   * pubkeys. Used by the /claim page to find campaigns set up *for* a user.
   */
  recipientPubkeys?: string[];
  /**
   * Include campaigns that have been archived by their creator
   * (`["status", "archived"]`). Defaults to `false` so archived
   * campaigns never appear in the main fundraisers listing.
   */
  includeArchived?: boolean;
}

/**
 * Loads kind 30223 campaign events and returns them as fully-parsed
 * {@link ParsedCampaign} objects, newest first.
 *
 * Campaigns that fail validation (missing title, no recipients, etc.) are
 * dropped so the UI never has to defensively check for missing fields.
 *
 * Archived campaigns (`status=archived`) are excluded by default. Pass
 * `includeArchived: true` to load them — used by the author's own profile
 * view so they can see and reopen their own archives.
 *
 * For each `(pubkey, d)` pair we keep only the latest event — relays may
 * return older revisions of an addressable event alongside the current one.
 */
export function useCampaigns(options: UseCampaignsOptions = {}) {
  const { nostr } = useNostr();
  const { category, limit = 60, authors, recipientPubkeys, includeArchived = false } = options;

  return useQuery({
    queryKey: [
      'campaigns',
      { category, limit, authors, recipientPubkeys, includeArchived },
    ],
    queryFn: async (c) => {
      const filter: NostrFilter = { kinds: [CAMPAIGN_KIND], limit };
      if (category) filter['#t'] = [category];
      if (authors && authors.length > 0) filter.authors = authors;
      if (recipientPubkeys && recipientPubkeys.length > 0) {
        filter['#p'] = recipientPubkeys;
      }

      const events = await nostr.query([filter], { signal: c.signal });

      // Dedupe by (pubkey, d) keeping the newest version.
      const latestByCoord = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${event.pubkey}:${d}`;
        const prev = latestByCoord.get(key);
        if (!prev || event.created_at > prev.created_at) {
          latestByCoord.set(key, event);
        }
      }

      const parsed: ParsedCampaign[] = [];
      for (const event of latestByCoord.values()) {
        const campaign = parseCampaign(event);
        if (!campaign) continue;
        if (!includeArchived && campaign.archived) continue;
        parsed.push(campaign);
      }
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      return parsed;
    },
    staleTime: 30_000,
  });
}
