import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseCampaign, type ParsedCampaign, CAMPAIGN_KIND } from '@/lib/campaign';
import { dedupeAddressableLatest } from '@/lib/addressableEvents';
import {
  getOrganizationOfficialAuthors,
  type ParsedCommunity,
} from '@/lib/communityUtils';
import { parseAction, type Action } from '@/hooks/useActions';

/**
 * Agora pledge kind (the former Activist Action). Kept in sync with
 * src/hooks/useActions.ts and NIP.md §Kind 36639.
 */
const PLEDGE_KIND = 36639;

/** NIP-52 calendar event kinds (all-day and timed). */
const CALENDAR_EVENT_KINDS = [31922, 31923];

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function isValidCalendarEvent(event: NostrEvent): boolean {
  if (!CALENDAR_EVENT_KINDS.includes(event.kind)) return false;
  const d = getTag(event.tags, 'd');
  const title = getTag(event.tags, 'title');
  const start = getTag(event.tags, 'start');
  if (!d || !title || !start) return false;
  if (event.kind === 31922) return /^\d{4}-\d{2}-\d{2}$/.test(start);
  const startTs = parseInt(start, 10);
  return Number.isFinite(startTs) && startTs > 0;
}

interface OrganizationActivity {
  campaigns: ParsedCampaign[];
  pledges: Action[];
  events: NostrEvent[];
}

/**
 * Fetch official campaigns, pledges, and calendar events for an organization
 * in one relay request.
 *
 * Trust boundary: anyone can technically publish an event with the
 * organization's uppercase `A` tag, so this hook MUST author-filter to the
 * founder + moderator set. Without `authors`, forged "official" activity
 * would show up on the organization page.
 */
export function useOrganizationActivity(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();
  const officialAuthors = community ? getOrganizationOfficialAuthors(community) : [];
  const aTag = community?.aTag ?? '';
  const authorsKey = officialAuthors.join(',');

  return useQuery<OrganizationActivity>({
    queryKey: ['organization-activity', aTag, authorsKey],
    queryFn: async ({ signal }) => {
      if (!community || officialAuthors.length === 0) {
        return { campaigns: [], pledges: [], events: [] };
      }

      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{
          kinds: [CAMPAIGN_KIND, PLEDGE_KIND, ...CALENDAR_EVENT_KINDS],
          authors: officialAuthors,
          '#A': [aTag],
          limit: 300,
        }],
        { signal: combinedSignal },
      );

      const campaigns: ParsedCampaign[] = [];
      const pledges: Action[] = [];
      const calendarEvents: NostrEvent[] = [];

      for (const event of dedupeAddressableLatest(events)) {
        if (event.kind === CAMPAIGN_KIND) {
          const campaign = parseCampaign(event);
          if (campaign) campaigns.push(campaign);
          continue;
        }

        if (event.kind === PLEDGE_KIND) {
          const pledge = parseAction(event);
          if (pledge) pledges.push(pledge);
          continue;
        }

        if (isValidCalendarEvent(event)) {
          calendarEvents.push(event);
        }
      }

      campaigns.sort((a, b) => b.createdAt - a.createdAt);
      pledges.sort((a, b) => b.createdAt - a.createdAt);
      calendarEvents.sort((a, b) => b.created_at - a.created_at);

      return { campaigns, pledges, events: calendarEvents };
    },
    enabled: !!community && officialAuthors.length > 0,
    staleTime: 60_000,
  });
}
