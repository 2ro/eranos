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
  /** Active members with banned members removed. Use this to list community members. */
  members: CommunityMember[];
}

/**
 * The shape expected by NoteMoreMenu's `communityContext` prop.
 * Computed from rank + moderation data for a specific viewer/target pair.
 */
export interface CommunityMenuContext {
  /** The community `A` tag coordinate (e.g. `34550:<pubkey>:<d-tag>`). */
  communityATag: string;
  /** Whether the current viewer has rank authority to ban this event's author. */
  canBan: boolean;
}

// ── Authority helpers ─────────────────────────────────────────────────────────

/**
 * Whether `viewer` has rank authority to ban `target`.
 * Non-members (target is undefined) can always be banned by any member.
 */
export function canBanTarget(viewer: CommunityMember, target: CommunityMember | undefined): boolean {
  return target ? viewer.rank < target.rank : true;
}

/**
 * Look up the viewer's rank entry, returning undefined if they are not a
 * member or are banned. Use this to gate moderation UI — if the result is
 * undefined, the viewer has no moderation authority.
 */
export function getViewerAuthority(
  viewerPubkey: string,
  rankMap: Map<string, CommunityMember>,
  moderation: CommunityModeration,
): CommunityMember | undefined {
  if (moderation.bannedPubkeys.has(viewerPubkey)) return undefined;
  return rankMap.get(viewerPubkey);
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

export interface CommunityContentBan {
  /** Target event ID claimed by the ban event's `e` tag. */
  eventId: string;
  /** Target pubkey claimed by the ban event's `p` tag. */
  targetPubkey: string;
  /** The parsed moderation event that requested this ban. */
  report: CommunityReport;
}

/** Moderation data resolved for a community. */
export interface CommunityModeration {
  /** Content-ban candidates grouped by target event ID. Apply only when target pubkey matches the actual event author. */
  contentBansByEventId: Map<string, CommunityContentBan[]>;
  /** Set of pubkeys that are member-banned. */
  bannedPubkeys: Set<string>;
  /** Reports grouped by target event ID (for content warnings). */
  reportsByEventId: Map<string, CommunityReport[]>;
  /** All parsed reports (for moderator review). */
  allReports: CommunityReport[];
}

/** Empty moderation sentinel — no bans, no reports. */
export const EMPTY_MODERATION: CommunityModeration = {
  contentBansByEventId: new Map(),
  bannedPubkeys: new Set(),
  reportsByEventId: new Map(),
  allReports: [],
};

/** Empty membership sentinel — no members. */
export const EMPTY_MEMBERSHIP: CommunityMembership = { members: [] };

/** Empty rank map sentinel — shared frozen instance for default-return paths. */
export const EMPTY_RANK_MAP: ReadonlyMap<string, CommunityMember> = new Map();

/**
 * Returns true when a resolved content-ban candidate applies to this event.
 *
 * The ban event's `p` tag is untrusted until it matches the target event's
 * actual author. Without this check, a malicious report could pair a real
 * event ID with a lower-ranked or non-member pubkey to bypass authority checks.
 */
export function hasApplicableContentBan(
  event: NostrEvent,
  moderation: CommunityModeration,
): boolean {
  const candidates = moderation.contentBansByEventId.get(event.id);
  if (!candidates) return false;
  return candidates.some((ban) => ban.targetPubkey === event.pubkey);
}

/**
 * Returns true when a single event survives community moderation
 * (not banned by author or content ban). Use for single-event checks;
 * use `applyCommunityModerationToEvents` for batch filtering.
 */
export function isEventAllowedByModeration(
  event: NostrEvent,
  moderation: CommunityModeration,
): boolean {
  if (moderation.bannedPubkeys.has(event.pubkey)) return false;
  if (hasApplicableContentBan(event, moderation)) return false;
  return true;
}

/**
 * Applies resolved community moderation to concrete events.
 *
 * This function is intentionally pure and content-kind agnostic. Any event kind
 * can pass through it as long as the caller has already scoped the events to a
 * community and resolved that community's moderation state.
 */
export function applyCommunityModerationToEvents<T extends NostrEvent>(
  events: T[],
  moderation: CommunityModeration,
): T[] {
  return events.filter((event) => isEventAllowedByModeration(event, moderation));
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
 *
 * Callers are expected to have already scoped the input to a community
 * (e.g. via `#A` relay filter), so this parser does not re-verify the
 * event's `A` tag — it only validates the structural tags that determine
 * classification.
 */
export function parseCommunityReport(event: NostrEvent): CommunityReport | null {
  if (event.kind !== REPORT_KIND) return null;

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
    // (a "report" without a target event has nowhere to attach in the UI)
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
  const contentBansByEventId = new Map<string, CommunityContentBan[]>();
  const bannedPubkeys = new Set<string>();
  const reportsByEventId = new Map<string, CommunityReport[]>();
  const allReports: CommunityReport[] = [];

  // Parse every event once. Drop anything that fails classification or is
  // not authored by a validated member (membership overlay rules).
  const parsed: CommunityReport[] = [];
  for (const event of reports) {
    const p = parseCommunityReport(event);
    if (!p) continue;
    if (!members.has(p.reporterPubkey)) continue;
    parsed.push(p);
  }

  // ── Pass 1: Resolve bans in rank order ─────────────────────────────
  //
  // Bans are processed sorted by reporter rank ascending. Because bans
  // require `reporter.rank < target.rank`, this guarantees that by the
  // time we evaluate a rank-N reporter's bans, we've already finalised
  // whether any lower-ranked members they're relying on are themselves
  // banned by a higher-ranked moderator. A banned reporter's bans are
  // then skipped.

  interface BanCandidate {
    parsed: CommunityReport;
    reporterRank: number;
  }

  const banCandidates: BanCandidate[] = [];

  for (const p of parsed) {
    if (p.action !== 'content-ban' && p.action !== 'member-ban') continue;

    // Reporter is guaranteed to be a member (filtered above).
    const reporter = members.get(p.reporterPubkey)!;

    // Authority check: reporter rank must be strictly less than target rank.
    // Non-members are treated as lowest rank (Infinity).
    const targetRank = members.get(p.targetPubkey)?.rank ?? Infinity;
    if (reporter.rank >= targetRank) continue;

    banCandidates.push({ parsed: p, reporterRank: reporter.rank });
  }

  banCandidates.sort((a, b) => a.reporterRank - b.reporterRank);

  for (const { parsed: p } of banCandidates) {
    if (bannedPubkeys.has(p.reporterPubkey)) continue;

    if (p.action === 'content-ban' && p.targetEventId) {
      const existing = contentBansByEventId.get(p.targetEventId) ?? [];
      existing.push({
        eventId: p.targetEventId,
        targetPubkey: p.targetPubkey,
        report: p,
      });
      contentBansByEventId.set(p.targetEventId, existing);
    } else if (p.action === 'member-ban') {
      bannedPubkeys.add(p.targetPubkey);
    }

    allReports.push(p);
  }

  // ── Pass 2: Attach soft reports, excluding banned reporters ────────

  for (const p of parsed) {
    if (p.action !== 'report') continue;
    if (bannedPubkeys.has(p.reporterPubkey)) continue;
    if (!p.targetEventId) continue; // defensive — 'report' action always has one

    const existing = reportsByEventId.get(p.targetEventId) ?? [];
    existing.push(p);
    reportsByEventId.set(p.targetEventId, existing);
    allReports.push(p);
  }

  return { contentBansByEventId, bannedPubkeys, reportsByEventId, allReports };
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

  return { members };
}

/**
 * Build the `a` tag coordinate string for a community event.
 */
export function getCommunityATag(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return `${COMMUNITY_DEFINITION_KIND}:${event.pubkey}:${dTag}`;
}
