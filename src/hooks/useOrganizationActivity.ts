import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseCampaign, type ParsedCampaign, CAMPAIGN_KIND } from '@/lib/campaign';
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

/**
 * Latest-wins dedupe for addressable events by `(pubkey, d-tag)`. Relays
 * occasionally return both the current revision and older copies of an
 * addressable event in the same response — we always want the newest.
 */
function dedupeAddressableLatest(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    const d = getTag(event.tags, 'd');
    if (!d) continue;
    const key = `${event.pubkey}:${d}`;
    const prev = latest.get(key);
    if (!prev || event.created_at > prev.created_at) {
      latest.set(key, event);
    }
  }
  return [...latest.values()];
}

/**
 * Fetch campaigns published by an organization's founder or moderators
 * that carry an uppercase `A` root-scope tag referencing this organization.
 *
 * Trust boundary: anyone can technically publish a kind 30223 event with
 * the organization's `A` tag, so this hook MUST author-filter to the
 * founder + moderator set. Without `authors`, forged "official" campaigns
 * would show up on the organization page (see the nostr-security skill,
 * §"Author filtering for trust-sensitive queries").
 */
export function useOrganizationCampaigns(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();
  const officialAuthors = community ? getOrganizationOfficialAuthors(community) : [];
  const aTag = community?.aTag ?? '';
  const authorsKey = officialAuthors.join(',');

  return useQuery<ParsedCampaign[]>({
    queryKey: ['org-campaigns', aTag, authorsKey],
    queryFn: async ({ signal }) => {
      if (!community || officialAuthors.length === 0) return [];
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{
          kinds: [CAMPAIGN_KIND],
          authors: officialAuthors,
          '#A': [aTag],
          limit: 100,
        }],
        { signal: combinedSignal },
      );
      const parsed: ParsedCampaign[] = [];
      for (const event of dedupeAddressableLatest(events)) {
        const campaign = parseCampaign(event);
        if (!campaign) continue;
        parsed.push(campaign);
      }
      parsed.sort((a, b) => b.createdAt - a.createdAt);
      return parsed;
    },
    enabled: !!community && officialAuthors.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Fetch pledges (kind 36639) published by an organization's founder or
 * moderators that carry an uppercase `A` root-scope tag referencing this
 * organization.
 *
 * Same trust boundary as {@link useOrganizationCampaigns}: must author-filter
 * to the founder + moderator set so non-mod pledges don't show as official.
 */
export function useOrganizationPledges(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();
  const officialAuthors = community ? getOrganizationOfficialAuthors(community) : [];
  const aTag = community?.aTag ?? '';
  const authorsKey = officialAuthors.join(',');

  return useQuery<Action[]>({
    queryKey: ['org-pledges', aTag, authorsKey],
    queryFn: async ({ signal }) => {
      if (!community || officialAuthors.length === 0) return [];
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{
          kinds: [PLEDGE_KIND],
          authors: officialAuthors,
          '#A': [aTag],
          limit: 100,
        }],
        { signal: combinedSignal },
      );
      const pledges: Action[] = [];
      for (const event of dedupeAddressableLatest(events)) {
        const pledge = parseAction(event);
        if (!pledge) continue;
        pledges.push(pledge);
      }
      pledges.sort((a, b) => b.createdAt - a.createdAt);
      return pledges;
    },
    enabled: !!community && officialAuthors.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Fetch upcoming NIP-52 calendar events published by an organization's
 * founder or moderators that carry an uppercase `A` root-scope tag
 * referencing this organization.
 *
 * Same trust boundary as {@link useOrganizationCampaigns}.
 */
export function useOrganizationEvents(community: ParsedCommunity | null | undefined) {
  const { nostr } = useNostr();
  const officialAuthors = community ? getOrganizationOfficialAuthors(community) : [];
  const aTag = community?.aTag ?? '';
  const authorsKey = officialAuthors.join(',');

  return useQuery<NostrEvent[]>({
    queryKey: ['org-events', aTag, authorsKey],
    queryFn: async ({ signal }) => {
      if (!community || officialAuthors.length === 0) return [];
      const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [{
          kinds: CALENDAR_EVENT_KINDS,
          authors: officialAuthors,
          '#A': [aTag],
          limit: 100,
        }],
        { signal: combinedSignal },
      );
      return dedupeAddressableLatest(events).filter(isValidCalendarEvent);
    },
    enabled: !!community && officialAuthors.length > 0,
    staleTime: 60_000,
  });
}
