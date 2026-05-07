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

const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/i;

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
  /** Member badge `a` tag coordinate (e.g. `30009:<pubkey>:<d-tag>`). */
  memberBadgeATag?: string;
  /** Optional relay hint from the community definition's member badge `a` tag. */
  memberBadgeRelayHint?: string;
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
  const moderatorPubkeys = Array.from(new Set(event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter((pubkey): pubkey is string => !!pubkey && pubkey !== event.pubkey && HEX_PUBKEY_RE.test(pubkey))));

  const memberBadgeTag = event.tags.find(
    ([n, coord, , role]) => n === 'a' && coord?.startsWith('30009:') && role === 'member',
  );
  const memberBadgeATag = memberBadgeTag?.[1];
  const memberBadgeRelayHint = memberBadgeTag?.[2] || undefined;

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
    memberBadgeATag,
    memberBadgeRelayHint,
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
  /** The badge award event that established membership (undefined for leadership). */
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
 * Returns the list of reports that apply to this event, or an empty array.
 *
 * Like content bans, a report's `p` tag is untrusted until it matches the
 * target event's actual author. Without this pubkey match, any member
 * could publish a kind 1984 pairing a victim event's ID with the
 * reporter's own pubkey, forcing a content warning on an arbitrary event.
 * This mirrors the id+pubkey match requirement in the NIP (see NIP.md
 * §Classification Summary and §Reports — Content Warnings).
 */
export function getApplicableReports(
  event: NostrEvent,
  moderation: CommunityModeration,
): CommunityReport[] {
  const candidates = moderation.reportsByEventId.get(event.id);
  if (!candidates) return [];
  return candidates.filter((report) => report.targetPubkey === event.pubkey);
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
 * Parse a kind 1984 event into a structured report based on its
 * structural tags (target, ban label, report type).
 *
 * This parser is **community-agnostic** — it does not validate the `A`
 * tag or any community scoping. Callers that need a community-scoped
 * view (the common case) should use `resolveCommunityModeration`, which
 * enforces the `A` tag match against a specific community.
 *
 * Returns `null` if the event's structure is not a valid NIP-56 report.
 */
export function parseCommunityReport(event: NostrEvent): CommunityReport | null {
  if (event.kind !== REPORT_KIND) return null;

  // Extract target pubkey (required on all reports)
  const pTag = event.tags.find(([n]) => n === 'p');
  const targetPubkey = pTag?.[1];
  if (!targetPubkey || !HEX_PUBKEY_RE.test(targetPubkey)) return null;

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
 * Events are filtered to those carrying an `A` tag matching
 * `communityATag` before classification. This enforces the trust boundary
 * at the public API surface so callers cannot accidentally cross-pollinate
 * moderation state between communities (e.g. when a single relay query
 * returns reports scoped to multiple communities via `#A`).
 *
 * Uses a two-pass approach to prevent banned members from retaining
 * moderation authority:
 *
 * **Pass 1 — Resolve bans (authority-ordered):**
 * Founder/moderators (rank 0) can ban members and non-members. Members
 * (rank 1) can ban only non-members. Processing leadership before members
 * ensures banned members cannot keep moderation authority.
 *
 * **Pass 2 — Resolve reports (filtered):**
 * Processes non-ban reports, skipping any reporter who ended up in the
 * banned set from pass 1. This prevents banned members from polluting the
 * report queue.
 *
 * @param communityATag - The community's `A` tag value (`34550:<pubkey>:<d>`).
 * @param reports - Candidate kind 1984 events. Events without a matching
 *                  `A` tag are ignored.
 * @param members - Validated membership map (pubkey -> CommunityMember).
 */
export function resolveCommunityModeration(
  communityATag: string,
  reports: NostrEvent[],
  members: Map<string, CommunityMember>,
): CommunityModeration {
  const contentBansByEventId = new Map<string, CommunityContentBan[]>();
  const bannedPubkeys = new Set<string>();
  const reportsByEventId = new Map<string, CommunityReport[]>();
  const allReports: CommunityReport[] = [];

  // Parse every event once. Drop anything that:
  //  - lacks an `A` tag matching this community (trust-boundary check;
  //    protects against mixed-community event sets)
  //  - fails structural classification
  //  - is not authored by a validated member (membership overlay rules)
  const parsed: CommunityReport[] = [];
  for (const event of reports) {
    const hasMatchingATag = event.tags.some(
      ([n, v]) => n === 'A' && v === communityATag,
    );
    if (!hasMatchingATag) continue;
    const p = parseCommunityReport(event);
    if (!p) continue;
    if (!members.has(p.reporterPubkey)) continue;
    parsed.push(p);
  }

  // ── Pass 1: Resolve bans in authority order ────────────────────────
  //
  // Rank 0 means founder/moderator and rank 1 means member. Non-members
  // are treated as lowest rank (Infinity), so members can only ban
  // non-members while founder/moderators can ban anyone.
  //
  // Candidates are sorted by reporter rank ascending so leadership bans
  // are resolved before member bans. A reporter banned by an earlier
  // authoritative action must not retain moderation authority for later
  // actions in the same pass.

  interface BanCandidate {
    parsed: CommunityReport;
    reporterRank: number;
  }

  const banCandidates: BanCandidate[] = [];

  for (const p of parsed) {
    if (p.action !== 'content-ban' && p.action !== 'member-ban') continue;

    // Reporter membership is guaranteed by the parse-time filter above.
    const reporterRank = members.get(p.reporterPubkey)!.rank;
    const targetRank = members.get(p.targetPubkey)?.rank ?? Infinity;

    // Authority check: strict rank inequality.
    if (reporterRank >= targetRank) continue;

    banCandidates.push({ parsed: p, reporterRank });
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
 * Whether a kind 8 badge award is a valid membership award for a community.
 *
 * Three conditions must hold (per NIP.md §Badge Awards):
 * 1. The event is a kind 8 badge award.
 * 2. The award author is the founder or a current moderator of the community.
 * 3. The award contains an `a` tag referencing the community's member badge.
 *
 * This is the single source of truth for award authorization. Both the
 * membership resolver and any discovery path that reaches awards through
 * an unfiltered query (e.g. `#p`-based "communities I belong to" lookups)
 * MUST apply this check before trusting the award.
 */
export function isAuthorizedAward(award: NostrEvent, community: ParsedCommunity): boolean {
  if (award.kind !== BADGE_AWARD_KIND) return false;
  if (!community.memberBadgeATag) return false;
  if (award.pubkey !== community.founderPubkey && !community.moderatorPubkeys.includes(award.pubkey)) return false;
  return award.tags.some(([n, v]) => n === 'a' && v === community.memberBadgeATag);
}

/**
 * Resolve flat community membership from founder/moderators plus membership
 * awards.
 *
 * Each award is validated via `isAuthorizedAward`. Callers SHOULD still query
 * with `authors: [founder, ...moderators]` so the relay indexes the trust
 * boundary, but this resolver enforces the same check client-side so that
 * discovery paths which reach awards by other filters (e.g. `#p` on the
 * viewer) stay consistent.
 */
export function resolveMembership(
  community: ParsedCommunity,
  awardEvents: NostrEvent[],
): CommunityMembership {
  const validated = new Map<string, CommunityMember>();

  validated.set(community.founderPubkey, {
    pubkey: community.founderPubkey,
    rank: 0,
  });
  for (const modPk of community.moderatorPubkeys) {
    if (!validated.has(modPk)) {
      validated.set(modPk, { pubkey: modPk, rank: 0 });
    }
  }

  for (const award of awardEvents) {
    if (!isAuthorizedAward(award, community)) continue;

    const recipients = award.tags
      .filter(([n]) => n === 'p')
      .map(([, pk]) => pk)
      .filter((pk): pk is string => !!pk && HEX_PUBKEY_RE.test(pk));

    for (const recipientPk of recipients) {
      if (validated.has(recipientPk)) continue;
      validated.set(recipientPk, {
        pubkey: recipientPk,
        rank: 1,
        awardEvent: award,
        awardedBy: award.pubkey,
      });
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
