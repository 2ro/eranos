import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Kind constants ────────────────────────────────────────────────────────────

/** NIP-72 community definition (addressable). */
export const COMMUNITY_DEFINITION_KIND = 34550;

/** NIP-58 badge definition. */
export const BADGE_DEFINITION_KIND = 30009;

/** NIP-58 badge award. */
export const BADGE_AWARD_KIND = 8;

/** NIP-56 report. */
export const REPORT_KIND = 1984;

/** NIP-32 label namespace used for authoritative moderation actions. */
export const MODERATION_LABEL_NAMESPACE = 'moderation';

/** NIP-32 label value that marks a kind 1984 event as an authoritative ban. */
export const MODERATION_BAN_LABEL = 'ban';

// ── NIP-56 report types ───────────────────────────────────────────────────────

/** Standard NIP-56 report type strings. */
export const NIP56_REPORT_TYPES = [
  'nudity',
  'malware',
  'profanity',
  'illegal',
  'spam',
  'impersonation',
  'other',
] as const;

export type Nip56ReportType = typeof NIP56_REPORT_TYPES[number];

/** Human-readable metadata for each NIP-56 report type. */
export const NIP56_REPORT_TYPE_META: Record<Nip56ReportType, { label: string; description: string }> = {
  spam: { label: 'Spam', description: 'Unsolicited or repetitive content' },
  nudity: { label: 'Nudity or sexual content', description: 'Depictions of nudity or pornography' },
  profanity: { label: 'Hateful speech', description: 'Profanity, hateful or abusive speech' },
  illegal: { label: 'Illegal content', description: 'Content that may be illegal in some jurisdictions' },
  impersonation: { label: 'Impersonation', description: 'Pretending to be someone else' },
  malware: { label: 'Malware', description: 'Virus, trojan horse, spyware, or ransomware' },
  other: { label: 'Other', description: 'Something else not listed above' },
};

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

// ── Community moderation ──────────────────────────────────────────────────────

/**
 * Classification of a community-scoped kind 1984 event.
 *
 * - `content-ban`: Authoritative removal of a specific post (has `e` tag + ban label).
 * - `member-ban`: Authoritative ban of a member (no `e` tag + ban label).
 * - `report`: Soft content warning from a member (NIP-56 report type, no ban label).
 */
export type CommunityReportAction = 'content-ban' | 'member-ban' | 'report';

export interface CommunityReport {
  /** The original kind 1984 event. */
  event: NostrEvent;
  /** Classified action type. */
  action: CommunityReportAction;
  /** Targeted event ID (for content-ban and report). Undefined for member-ban. */
  targetEventId?: string;
  /** Targeted pubkey. */
  targetPubkey: string;
  /** NIP-56 report type from the `e` or `p` tag (e.g. "nudity", "spam", "other"). */
  reportType: Nip56ReportType;
  /** Reporter's pubkey. */
  reporterPubkey: string;
}

/** Moderation data resolved for a community. */
export interface CommunityModeration {
  /** Set of event IDs that are content-banned (should be omitted entirely). */
  bannedEventIds: Set<string>;
  /** Set of pubkeys that are member-banned. */
  bannedPubkeys: Set<string>;
  /** Reports grouped by target event ID (for content warnings). */
  reportsByEventId: Map<string, CommunityReport[]>;
  /** All parsed reports (for moderator review). */
  allReports: CommunityReport[];
}

/**
 * Check whether a kind 1984 event carries the authoritative `ban` label.
 */
function hasBanLabel(event: NostrEvent): boolean {
  const hasNamespace = event.tags.some(
    ([n, v]) => n === 'L' && v === MODERATION_LABEL_NAMESPACE,
  );
  const hasLabel = event.tags.some(
    ([n, v, ns]) =>
      n === 'l' && v === MODERATION_BAN_LABEL && ns === MODERATION_LABEL_NAMESPACE,
  );
  return hasNamespace && hasLabel;
}

/**
 * Parse a community-scoped kind 1984 event into a structured report.
 * Returns `null` if the event is not a valid community report.
 */
export function parseCommunityReport(event: NostrEvent): CommunityReport | null {
  if (event.kind !== REPORT_KIND) return null;

  // Must have a community A tag
  const communityATag = event.tags.find(([n]) => n === 'A')?.[1];
  if (!communityATag) return null;

  // Extract target pubkey (required on all reports)
  const pTag = event.tags.find(([n]) => n === 'p');
  const targetPubkey = pTag?.[1];
  if (!targetPubkey) return null;

  // Extract target event ID (optional — determines content vs member action)
  const eTag = event.tags.find(([n]) => n === 'e');
  const targetEventId = eTag?.[1];

  // Determine report type from the e or p tag's 3rd element
  const rawType = eTag?.[2] || pTag?.[2] || 'other';
  const reportType: Nip56ReportType = (NIP56_REPORT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as Nip56ReportType)
    : 'other';

  const isBan = hasBanLabel(event);

  let action: CommunityReportAction;
  if (isBan && targetEventId) {
    action = 'content-ban';
  } else if (isBan && !targetEventId) {
    action = 'member-ban';
  } else if (!isBan && targetEventId) {
    action = 'report';
  } else {
    // No ban label and no e tag — invalid per classification table
    return null;
  }

  return {
    event,
    action,
    targetEventId,
    targetPubkey,
    reportType,
    reporterPubkey: event.pubkey,
  };
}

/**
 * Process community-scoped kind 1984 events into moderation data.
 *
 * Uses a two-pass approach to prevent banned members from retaining
 * moderation authority:
 *
 * **Pass 1 — Resolve bans (rank-ordered):**
 * Collects all valid ban candidates (membership + authority checks), then
 * processes them sorted by reporter rank ascending. Because bans require
 * `reporter.rank < target.rank`, the ban graph is a DAG — processing in
 * rank order guarantees that by the time we evaluate a rank-N reporter's
 * bans, we've already finalised whether all lower-ranked members are
 * banned. If a reporter is themselves banned, their bans are skipped.
 *
 * **Pass 2 — Resolve reports (filtered):**
 * Processes non-ban reports, skipping any reporter who ended up in the
 * banned set from pass 1. This prevents banned members from polluting the
 * report queue.
 *
 * @param reports - Kind 1984 events scoped to the community.
 * @param members - Validated membership map (pubkey -> CommunityMember).
 */
export function resolveCommunityModeration(
  reports: NostrEvent[],
  members: Map<string, CommunityMember>,
): CommunityModeration {
  const bannedEventIds = new Set<string>();
  const bannedPubkeys = new Set<string>();
  const reportsByEventId = new Map<string, CommunityReport[]>();
  const allReports: CommunityReport[] = [];

  // ── Pass 1: Collect and resolve ban candidates ──────────────────────

  interface BanCandidate {
    parsed: CommunityReport;
    reporterRank: number;
  }

  const banCandidates: BanCandidate[] = [];

  for (const event of reports) {
    const parsed = parseCommunityReport(event);
    if (!parsed) continue;
    if (parsed.action !== 'content-ban' && parsed.action !== 'member-ban') continue;

    const reporter = members.get(parsed.reporterPubkey);
    if (!reporter) continue;

    // Authority check: reporter rank must be strictly less than target rank
    const target = members.get(parsed.targetPubkey);
    const targetRank = target?.rank ?? Infinity; // Non-members treated as lowest
    if (reporter.rank >= targetRank) continue; // Insufficient authority

    banCandidates.push({ parsed, reporterRank: reporter.rank });
  }

  // Sort by reporter rank ascending so higher-authority bans are applied
  // first. This ensures that when we reach a candidate whose reporter has
  // been banned by a higher-ranked member, bannedPubkeys already contains
  // that reporter.
  banCandidates.sort((a, b) => a.reporterRank - b.reporterRank);

  for (const { parsed } of banCandidates) {
    // Skip bans issued by members who are themselves banned
    if (bannedPubkeys.has(parsed.reporterPubkey)) continue;

    if (parsed.action === 'content-ban' && parsed.targetEventId) {
      bannedEventIds.add(parsed.targetEventId);
    } else if (parsed.action === 'member-ban') {
      bannedPubkeys.add(parsed.targetPubkey);
    }

    allReports.push(parsed);
  }

  // ── Pass 2: Resolve reports, excluding banned reporters ─────────────

  for (const event of reports) {
    const parsed = parseCommunityReport(event);
    if (!parsed) continue;
    if (parsed.action !== 'report') continue;

    // Skip reports from banned members
    if (bannedPubkeys.has(parsed.reporterPubkey)) continue;

    const reporter = members.get(parsed.reporterPubkey);
    if (!reporter) continue;

    if (parsed.targetEventId) {
      const existing = reportsByEventId.get(parsed.targetEventId) ?? [];
      existing.push(parsed);
      reportsByEventId.set(parsed.targetEventId, existing);
    }

    allReports.push(parsed);
  }

  return { bannedEventIds, bannedPubkeys, reportsByEventId, allReports };
}

/**
 * Resolve community membership via the chain validation algorithm
 * described in the community NIP.
 *
 * 1. Seed rank 0 from the community definition (founder + moderators).
 * 2. Iteratively validate badge awards — awarder must be a validated
 *    member with rank strictly less than the awarded badge's rank.
 */
export function resolveMembership(
  community: ParsedCommunity,
  awardEvents: NostrEvent[],
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

  // Step 2: Iterative validation
  let changed = true;
  const processed = new Set<string>();

  while (changed) {
    changed = false;
    for (const award of awardEvents) {
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
