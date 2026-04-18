import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Kind constants ────────────────────────────────────────────────────────────

/** NIP-72 community definition (addressable). */
export const COMMUNITY_DEFINITION_KIND = 34550;

/** NIP-58 badge definition. */
export const BADGE_DEFINITION_KIND = 30009;

/** NIP-58 badge award. */
export const BADGE_AWARD_KIND = 8;

/** NIP-56 report / moderation. */
export const REPORT_KIND = 1984;

/** NIP-09 deletion request. */
export const DELETION_KIND = 5;

// ── Rank tier metadata ────────────────────────────────────────────────────────

export interface RankTier {
  /** Numeric rank index (0 = founder/moderator, 1+ = badge-based). */
  rank: number;
  /** Badge `a` tag coordinate (e.g. `30009:<pubkey>:<d-tag>`). Undefined for rank 0. */
  badgeATag?: string;
  /** Optional relay hint from the community definition's `a` tag. */
  relayHint?: string;
}

// ── Parsed community ──────────────────────────────────────────────────────────

export interface ParsedCommunity {
  /** The `d` tag value (community identifier). */
  dTag: string;
  /** Human-readable name. */
  name: string;
  /** Description text. */
  description: string;
  /** Sanitized image URL. */
  image?: string;
  /** Founder pubkey (the event publisher). */
  founderPubkey: string;
  /** Moderator pubkeys (from `p` tags with role "moderator"). */
  moderatorPubkeys: string[];
  /** Ordered rank tiers (rank 0 first, then badge-based ranks). */
  ranks: RankTier[];
  /** Recommended relay URLs. */
  relays: string[];
  /** The `a` tag coordinate for the community: `34550:<pubkey>:<d-tag>`. */
  aTag: string;
}

/**
 * Parse a kind 34550 community definition event into structured data.
 * Returns `null` if the event is invalid or missing required tags.
 */
export function parseCommunityEvent(event: NostrEvent): ParsedCommunity | null {
  if (event.kind !== COMMUNITY_DEFINITION_KIND) return null;

  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  if (!dTag) return null;

  const name = event.tags.find(([n]) => n === 'name')?.[1] || dTag;
  const description = event.tags.find(([n]) => n === 'description')?.[1] || '';
  const rawImage = event.tags.find(([n]) => n === 'image')?.[1];
  const image = sanitizeUrl(rawImage);

  // Moderators: p tags with "moderator" role (4th element)
  const moderatorPubkeys = event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter(Boolean);

  // Badge rank tiers: a tags pointing to kind 30009 with rank index in 4th element
  const badgeRanks: RankTier[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'a') continue;
    const coord = tag[1];
    if (!coord || !coord.startsWith('30009:')) continue;
    const rankStr = tag[3];
    const rank = parseInt(rankStr, 10);
    if (isNaN(rank) || rank < 1) continue;
    badgeRanks.push({
      rank,
      badgeATag: coord,
      relayHint: tag[2] || undefined,
    });
  }

  // Sort badge ranks ascending
  badgeRanks.sort((a, b) => a.rank - b.rank);

  // Build full rank list: rank 0 (founder/moderators) + badge ranks
  const ranks: RankTier[] = [{ rank: 0 }, ...badgeRanks];

  // Relay URLs
  const relays = event.tags
    .filter(([n]) => n === 'relay')
    .map(([, url]) => url)
    .filter(Boolean);

  return {
    dTag,
    name,
    description,
    image,
    founderPubkey: event.pubkey,
    moderatorPubkeys,
    ranks,
    relays,
    aTag: `${COMMUNITY_DEFINITION_KIND}:${event.pubkey}:${dTag}`,
  };
}

// ── Community member ──────────────────────────────────────────────────────────

export interface CommunityMember {
  /** Member's pubkey. */
  pubkey: string;
  /** Their effective rank in this community. */
  rank: number;
  /** The badge award event that established membership (undefined for rank 0). */
  awardEvent?: NostrEvent;
  /** Pubkey of whoever awarded them (undefined for rank 0). */
  awardedBy?: string;
}

export interface CommunityMembership {
  /** All validated members grouped by rank. */
  members: CommunityMember[];
  /** Convenience: count of all members (including founder + moderators). */
  totalCount: number;
}

/**
 * Resolve community membership via the chain validation algorithm
 * described in the community NIP.
 *
 * 1. Seed rank 0 from the community definition (founder + moderators).
 * 2. Iteratively validate badge awards — awarder must be a validated
 *    member with rank strictly less than the awarded badge's rank.
 * 3. Apply moderation overlays (kind 1984 bans).
 */
export function resolveMembership(
  community: ParsedCommunity,
  awardEvents: NostrEvent[],
  reportEvents: NostrEvent[],
  deletionEvents: NostrEvent[],
): CommunityMembership {
  // Build badge-to-rank lookup
  const badgeToRank = new Map<string, number>();
  for (const tier of community.ranks) {
    if (tier.badgeATag) {
      badgeToRank.set(tier.badgeATag, tier.rank);
    }
  }

  // Track validated members: pubkey -> CommunityMember
  const validated = new Map<string, CommunityMember>();

  // Step 1: Seed rank 0
  validated.set(community.founderPubkey, {
    pubkey: community.founderPubkey,
    rank: 0,
  });
  for (const modPk of community.moderatorPubkeys) {
    if (!validated.has(modPk)) {
      validated.set(modPk, { pubkey: modPk, rank: 0 });
    }
  }

  // Build set of deleted event IDs (kind 5 targeting kind 8)
  const deletedIds = new Set<string>();
  for (const del of deletionEvents) {
    const kTags = del.tags.filter(([n]) => n === 'k').map(([, v]) => v);
    if (!kTags.includes('8')) continue;
    for (const tag of del.tags) {
      if (tag[0] === 'e') deletedIds.add(tag[1]);
    }
  }

  // Filter out deleted awards
  const activeAwards = awardEvents.filter((e) => !deletedIds.has(e.id));

  // Step 2: Iterative validation
  let changed = true;
  const processed = new Set<string>();

  while (changed) {
    changed = false;
    for (const award of activeAwards) {
      if (processed.has(award.id)) continue;

      const awarderPubkey = award.pubkey;
      const awarder = validated.get(awarderPubkey);
      if (!awarder) continue; // Awarder not validated yet

      // Find which badge is being awarded
      const badgeATag = award.tags.find(
        ([n, v]) => n === 'a' && v?.startsWith('30009:'),
      )?.[1];
      if (!badgeATag) continue;

      const awardedRank = badgeToRank.get(badgeATag);
      if (awardedRank === undefined) continue; // Badge not in this community

      // Awarder must have strictly lower rank number
      if (awarder.rank >= awardedRank) continue;

      // Find recipient(s)
      const recipients = award.tags
        .filter(([n]) => n === 'p')
        .map(([, pk]) => pk)
        .filter(Boolean);

      for (const recipientPk of recipients) {
        const existing = validated.get(recipientPk);
        // Only accept if it gives a better (lower) rank or first membership
        if (!existing || awardedRank < existing.rank) {
          validated.set(recipientPk, {
            pubkey: recipientPk,
            rank: awardedRank,
            awardEvent: award,
            awardedBy: awarderPubkey,
          });
          changed = true;
        }
      }

      processed.add(award.id);
    }
  }

  // Step 3: Apply moderation (bans)
  // Build set of deleted report IDs
  const deletedReportIds = new Set<string>();
  for (const del of deletionEvents) {
    const kTags = del.tags.filter(([n]) => n === 'k').map(([, v]) => v);
    if (!kTags.includes('1984')) continue;
    for (const tag of del.tags) {
      if (tag[0] === 'e') deletedReportIds.add(tag[1]);
    }
  }

  const communityATag = community.aTag;

  for (const report of reportEvents) {
    if (deletedReportIds.has(report.id)) continue;

    // Must be scoped to this community
    const scopedToThis = report.tags.some(
      ([n, v]) => n === 'A' && v === communityATag,
    );
    if (!scopedToThis) continue;

    const reporter = validated.get(report.pubkey);
    if (!reporter) continue; // Non-member reports are ignored

    // Ban: p tag only (no e tag)
    const hasPTag = report.tags.some(([n]) => n === 'p');
    const hasETag = report.tags.some(([n]) => n === 'e');

    if (hasPTag && !hasETag) {
      const targetPubkey = report.tags.find(([n]) => n === 'p')?.[1];
      if (!targetPubkey) continue;
      const target = validated.get(targetPubkey);
      if (!target) continue;
      // Reporter must outrank target
      if (reporter.rank < target.rank) {
        validated.delete(targetPubkey);
      }
    }
  }

  const members = Array.from(validated.values());
  members.sort((a, b) => a.rank - b.rank);

  return {
    members,
    totalCount: members.length,
  };
}

/**
 * Build the `a` tag coordinate string for a community event.
 */
export function getCommunityATag(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${COMMUNITY_DEFINITION_KIND}:${event.pubkey}:${dTag}`;
}
