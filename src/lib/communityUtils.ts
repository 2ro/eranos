import type { NostrEvent } from '@nostrify/nostrify';

import { getEditableContentTags } from '@/lib/contentTags';
import { parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ── Kind constants ────────────────────────────────────────────────────────────

/** NIP-72 community definition (addressable). */
export const COMMUNITY_DEFINITION_KIND = 34550;

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
  /** Recommended relay URLs. */
  relays: string[];
  /** ISO 3166-1 alpha-2 country code parsed from an Agora `i` tag extension. */
  countryCode?: string;
  /** User-editable topic/category `t` tags, excluding Agora's app marker. */
  topicTags: string[];
  /** The `a` tag coordinate for the community: `34550:<pubkey>:<d-tag>`. */
  aTag: string;
  /**
   * Raw tag array from the underlying kind 34550 event. Carried through so
   * non-essential, non-indexed markers (e.g. Agora's `["t", "agora"]`
   * content marker) can be inspected without re-fetching the event.
   */
  tags: string[][];
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
  const countryCode = event.tags
    .map(([name, value]) => name === 'i' && value ? parseCountryIdentifier(value) : undefined)
    .find((code): code is string => !!code && /^[A-Z]{2}$/.test(code));

  // Moderators: p tags with "moderator" role (4th element)
  const moderatorPubkeys = Array.from(new Set(event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter((pubkey): pubkey is string => !!pubkey && pubkey !== event.pubkey && HEX_PUBKEY_RE.test(pubkey))));

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
    relays,
    countryCode,
    topicTags: getEditableContentTags(event.tags),
    aTag: `${COMMUNITY_DEFINITION_KIND}:${event.pubkey}:${dTag}`,
    tags: event.tags,
  };
}

// ── Community member ──────────────────────────────────────────────────────────

export interface CommunityMember {
  /** Member's pubkey. */
  pubkey: string;
  /** Their effective rank in this community. */
  rank: number;
}

export interface CommunityMembership {
  /** Founder pubkey. */
  founderPubkey: string;
  /** Moderator pubkeys (does NOT include the founder). */
  moderatorPubkeys: string[];
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
 * - `report`: Soft content warning from a moderator (NIP-56 report type, no ban label).
 *
 * Agora's organization trust model only knows founders and moderators —
 * there is no "member" tier — so banning a user wholesale is not modeled
 * here. Hide a user by banning each of their posts individually, or by
 * dropping them from the moderator list.
 */
type CommunityReportAction = 'content-ban' | 'report';

interface CommunityReport {
  /** The original kind 1984 event. */
  event: NostrEvent;
  /** Classified action type. */
  action: CommunityReportAction;
  /** Targeted event ID. */
  targetEventId: string;
  /** Targeted pubkey. */
  targetPubkey: string;
  /** NIP-56 report type from the `e` or `p` tag (e.g. "nudity", "spam", "other"). */
  reportType: Nip56ReportType;
  /** Reporter's pubkey. */
  reporterPubkey: string;
}

interface CommunityContentBan {
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
  /**
   * Set of pubkeys that are member-banned.
   *
   * Always empty in the current organization model — Agora no longer
   * supports banning whole users from an organization; only event-level
   * content bans remain. The field is kept on the type so existing
   * helpers (`isEventAllowedByModeration`, `getViewerAuthority`) keep a
   * stable shape, but new code should not rely on it being populated.
   */
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
export const EMPTY_MEMBERSHIP: CommunityMembership = { founderPubkey: '', moderatorPubkeys: [] };

/** Empty rank map sentinel — shared frozen instance for default-return paths. */
export const EMPTY_RANK_MAP: ReadonlyMap<string, CommunityMember> = new Map();

/**
 * Returns true when a resolved content-ban candidate applies to this event.
 *
 * The ban event's `p` tag is untrusted until it matches the target event's
 * actual author. Without this check, a malicious report could pair a real
 * event ID with a lower-ranked or non-member pubkey to bypass authority checks.
 */
function hasApplicableContentBan(
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
function isEventAllowedByModeration(
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
function parseCommunityReport(event: NostrEvent): CommunityReport | null {
  if (event.kind !== REPORT_KIND) return null;

  // Extract target pubkey (required on all reports)
  const pTag = event.tags.find(([n]) => n === 'p');
  const targetPubkey = pTag?.[1];
  if (!targetPubkey || !HEX_PUBKEY_RE.test(targetPubkey)) return null;

  // Extract target event ID — required: both content-ban and report
  // actions target a specific event in Agora's organization model.
  const eTag = event.tags.find(([n]) => n === 'e');
  const targetEventId = eTag?.[1];
  if (!targetEventId) return null;

  // Determine report type from the e or p tag's 3rd element
  const rawType = eTag?.[2] || pTag?.[2] || 'other';
  const reportType: Nip56ReportType = (NIP56_REPORT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as Nip56ReportType)
    : 'other';

  const isBan = hasBanLabel(event);
  const action: CommunityReportAction = isBan ? 'content-ban' : 'report';

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
 * In Agora's organization model only the founder and listed moderators
 * have moderation authority. Reports from anyone else are dropped.
 * Authoritative content removals (`content-ban`) hide the targeted post;
 * soft reports attach a content warning without removing the post.
 *
 * @param communityATag - The community's `A` tag value (`34550:<pubkey>:<d>`).
 * @param reports - Candidate kind 1984 events. Events without a matching
 *                  `A` tag are ignored.
 * @param members - Map of pubkey -> CommunityMember for the founder and
 *                  current moderators of the community.
 */
export function resolveCommunityModeration(
  communityATag: string,
  reports: NostrEvent[],
  members: Map<string, CommunityMember>,
): CommunityModeration {
  const contentBansByEventId = new Map<string, CommunityContentBan[]>();
  const reportsByEventId = new Map<string, CommunityReport[]>();
  const allReports: CommunityReport[] = [];

  for (const event of reports) {
    const hasMatchingATag = event.tags.some(
      ([n, v]) => n === 'A' && v === communityATag,
    );
    if (!hasMatchingATag) continue;
    const p = parseCommunityReport(event);
    if (!p) continue;
    // Only founder/moderators can publish moderation actions against the
    // organization. Anyone else's kind 1984 is treated as noise.
    if (!members.has(p.reporterPubkey)) continue;

    if (p.action === 'content-ban') {
      const existing = contentBansByEventId.get(p.targetEventId) ?? [];
      existing.push({
        eventId: p.targetEventId,
        targetPubkey: p.targetPubkey,
        report: p,
      });
      contentBansByEventId.set(p.targetEventId, existing);
    } else {
      const existing = reportsByEventId.get(p.targetEventId) ?? [];
      existing.push(p);
      reportsByEventId.set(p.targetEventId, existing);
    }

    allReports.push(p);
  }

  return { contentBansByEventId, bannedPubkeys: new Set(), reportsByEventId, allReports };
}

// ─── Organization role helpers (founder + moderator model) ───────────────────
//
// Agora treats NIP-72 communities as "Organizations" with only two trust
// levels: the founder (event author) and the moderators listed in the kind
// 34550 event's `p` tags with role "moderator". The badge-award membership
// layer is no longer part of Agora's product model. These helpers centralize
// the role checks so callers don't reach into ParsedCommunity tag arrays
// directly.

/**
 * Return the list of pubkeys whose campaigns, pledges, and calendar events
 * Agora should treat as "official" activity for the organization — the
 * founder plus every listed moderator.
 *
 * Agora restricts creation of organization-tagged campaigns / pledges /
 * events in the client to this set, but anyone could technically publish
 * a kind 33863 / 36639 / 31922 / 31923 with the organization's uppercase
 * `A` root-scope tag outside the client. Queries that surface "official"
 * organization activity MUST pass this list as the `authors` filter so
 * forged events from non-moderators never reach the UI.
 *
 * Returns a deduplicated array preserving founder-first ordering.
 */
export function getOrganizationOfficialAuthors(community: ParsedCommunity): string[] {
  const seen = new Set<string>();
  const authors: string[] = [];
  authors.push(community.founderPubkey);
  seen.add(community.founderPubkey);
  for (const mod of community.moderatorPubkeys) {
    if (seen.has(mod)) continue;
    seen.add(mod);
    authors.push(mod);
  }
  return authors;
}
