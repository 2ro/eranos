import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Addressable kind number for fundraising campaigns (see NIP.md). */
export const CAMPAIGN_KIND = 30223;

/** Canonical category slugs shown in the create-campaign form. */
export const CAMPAIGN_CATEGORIES = [
  'human-rights',
  'civil-liberties',
  'democracy',
  'political-prisoners',
  'legal-defense',
  'independent-media',
  'humanitarian-aid',
  'emergency-relief',
  'education',
  'community',
  'medical-aid',
  'other',
] as const;

export type CampaignCategory = typeof CAMPAIGN_CATEGORIES[number];

/** Human-readable labels for category slugs. */
export const CAMPAIGN_CATEGORY_LABELS: Record<CampaignCategory, string> = {
  'human-rights': 'Human Rights',
  'civil-liberties': 'Civil Liberties',
  democracy: 'Democracy & Free Elections',
  'political-prisoners': 'Political Prisoners',
  'legal-defense': 'Legal Defense',
  'independent-media': 'Independent Media',
  'humanitarian-aid': 'Humanitarian Aid',
  'emergency-relief': 'Emergency Relief',
  education: 'Education & Training',
  community: 'Community Organizing',
  'medical-aid': 'Medical Aid',
  other: 'Other',
};

const LEGACY_CAMPAIGN_CATEGORY_ALIASES: Record<string, CampaignCategory> = {
  medical: 'medical-aid',
  emergency: 'emergency-relief',
  animals: 'humanitarian-aid',
  sports: 'community',
  creative: 'community',
  business: 'community',
  faith: 'community',
  memorial: 'other',
};

/** A 64-character lowercase hex string (Nostr pubkey or event id). */
const HEX_64_RE = /^[0-9a-f]{64}$/;

/** A campaign recipient parsed from a single `p` tag. */
export interface CampaignRecipient {
  /** Lowercase hex pubkey. */
  pubkey: string;
  /** Optional relay hint provided in the `p` tag. */
  relay?: string;
  /** Positive split weight. Defaults to 1 when the `p` tag does not supply one. */
  weight: number;
}

/** A fully-parsed campaign with everything the UI needs. */
export interface ParsedCampaign {
  /** The original event. */
  event: NostrEvent;
  /** Campaign creator's hex pubkey. */
  pubkey: string;
  /** The campaign's `d` tag (slug). */
  identifier: string;
  /** Addressable coordinate `30223:<pubkey>:<d>`. */
  aTag: string;
  /** Campaign title. */
  title: string;
  /** Short tagline. */
  summary: string;
  /** Markdown story (the event content). */
  story: string;
  /** Sanitized HTTPS cover image URL, or `undefined` if missing/invalid. */
  image?: string;
  /** Category slug from the first `t` tag matching a known category, or `undefined`. */
  category?: CampaignCategory;
  /** Goal in satoshis, or `undefined` if not set. */
  goalSats?: number;
  /** Deadline (Unix seconds), or `undefined` if not set. */
  deadline?: number;
  /** Human-readable location string. */
  location?: string;
  /** Validated recipient list (always at least one). */
  recipients: CampaignRecipient[];
  /** Created-at from the event. */
  createdAt: number;
  /**
   * True when the creator has marked the campaign closed via
   * `["status", "archived"]`. Archived campaigns are hidden from main
   * listings but still load by direct link so existing donors can find
   * them and donation history is preserved.
   */
  archived: boolean;
}

/** Returns the first value of a tag, or undefined. */
function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Parses a positive integer string. Returns undefined on failure. */
function parsePositiveInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

/**
 * Parses a kind 30223 event into a strongly-typed campaign, or returns
 * `null` if the event is missing required fields (title, `d` tag, or at
 * least one valid recipient).
 *
 * `p` tag rules:
 * - 2nd element MUST be a 64-char lowercase hex pubkey.
 * - 3rd element is treated as a relay hint when it looks like a relay URL.
 * - 4th element is a positive decimal weight; missing/invalid -> 1.
 * - Duplicate pubkeys collapse to the first occurrence.
 */
export function parseCampaign(event: NostrEvent): ParsedCampaign | null {
  if (event.kind !== CAMPAIGN_KIND) return null;

  const identifier = getTag(event, 'd');
  const title = getTag(event, 'title');
  if (!identifier || !title) return null;

  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'p') continue;
    const pubkey = tag[1];
    if (typeof pubkey !== 'string' || !HEX_64_RE.test(pubkey)) continue;
    if (seen.has(pubkey)) continue;
    seen.add(pubkey);

    const maybeRelay = typeof tag[2] === 'string' && tag[2].startsWith('ws') ? tag[2] : undefined;
    const rawWeight = typeof tag[3] === 'string' ? Number(tag[3]) : NaN;
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1;

    recipients.push({ pubkey, relay: maybeRelay, weight });
  }

  if (recipients.length === 0) return null;

  // Category from the first `t` tag whose value is a recognized slug.
  let category: CampaignCategory | undefined;
  for (const [name, value] of event.tags) {
    if (name !== 't' || typeof value !== 'string') continue;
    if ((CAMPAIGN_CATEGORIES as readonly string[]).includes(value)) {
      category = value as CampaignCategory;
      break;
    }
    const legacyCategory = LEGACY_CAMPAIGN_CATEGORY_ALIASES[value];
    if (legacyCategory) {
      category = legacyCategory;
      break;
    }
  }

  // Image — only accept https URLs. We do the formal sanitizeUrl pass at the
  // render site (since this lib runs in tests without DOM); strip non-https here.
  const rawImage = getTag(event, 'image');
  const image = rawImage && /^https:\/\//i.test(rawImage) ? rawImage : undefined;

  // Status tag. We only recognize `archived` today; any other value is
  // ignored so future statuses (e.g. `paused`, `funded`) don't accidentally
  // get treated as archived.
  const archived = getTag(event, 'status') === 'archived';

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    aTag: `${CAMPAIGN_KIND}:${event.pubkey}:${identifier}`,
    title: title.trim(),
    summary: getTag(event, 'summary')?.trim() ?? '',
    story: event.content,
    image,
    category,
    goalSats: parsePositiveInt(getTag(event, 'goal')),
    deadline: parsePositiveInt(getTag(event, 'deadline')),
    location: getTag(event, 'location')?.trim() || undefined,
    recipients,
    createdAt: event.created_at,
    archived,
  };
}

/** Output of {@link splitDonation}: per-recipient amounts in sats. */
export interface DonationSplit {
  pubkey: string;
  weight: number;
  /** Whole satoshis allocated to this recipient. */
  amountSats: number;
}

/**
 * Splits a donation across the campaign's recipients according to each
 * recipient's weight (defaulting to equal shares when weights are uniform).
 *
 * Rules:
 * 1. Each recipient's share is `floor(totalSats * weight / sumOfWeights)`.
 * 2. Any rounding remainder is appended to the recipient with the largest
 *    weight (ties broken by original `p` tag order) so the entire donation
 *    reaches the campaign.
 * 3. Self-donations (recipient pubkey equals donor pubkey) are dropped from
 *    the output. The donor's share would be a no-op output paying their own
 *    Taproot address and only inflates the on-chain fee.
 *
 * Throws if `totalSats` is not a positive finite integer, or if there are no
 * non-self recipients.
 */
export function splitDonation(
  recipients: CampaignRecipient[],
  totalSats: number,
  donorPubkey: string | undefined,
): DonationSplit[] {
  if (!Number.isFinite(totalSats) || !Number.isInteger(totalSats) || totalSats <= 0) {
    throw new Error('Donation amount must be a positive integer (satoshis).');
  }

  const payable = recipients.filter((r) => r.pubkey !== donorPubkey);
  if (payable.length === 0) {
    throw new Error('No eligible recipients (donor cannot donate to themselves).');
  }

  const totalWeight = payable.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Recipient weights must sum to a positive number.');
  }

  const splits: DonationSplit[] = payable.map((r) => ({
    pubkey: r.pubkey,
    weight: r.weight,
    amountSats: Math.floor((totalSats * r.weight) / totalWeight),
  }));

  const allocated = splits.reduce((sum, s) => sum + s.amountSats, 0);
  const remainder = totalSats - allocated;
  if (remainder > 0) {
    let largestIdx = 0;
    for (let i = 1; i < splits.length; i++) {
      if (splits[i].weight > splits[largestIdx].weight) largestIdx = i;
    }
    splits[largestIdx].amountSats += remainder;
  }

  return splits;
}

/**
 * Computes the smallest donation total (in sats) where every recipient
 * receives at least `dustLimit` sats. Used to surface a helpful minimum
 * before the donor tries to sign a PSBT that would throw on dust.
 */
export function minDonationForSplit(
  recipients: CampaignRecipient[],
  donorPubkey: string | undefined,
  dustLimit: number,
): number {
  const payable = recipients.filter((r) => r.pubkey !== donorPubkey);
  if (payable.length === 0) return dustLimit;

  const totalWeight = payable.reduce((sum, r) => sum + r.weight, 0);
  const smallestShare = Math.min(...payable.map((r) => r.weight));
  // Need: floor(T * smallestShare / totalWeight) >= dustLimit
  // -> T >= ceil(dustLimit * totalWeight / smallestShare)
  return Math.ceil((dustLimit * totalWeight) / smallestShare);
}

/** Encodes a campaign's addressable coordinate as a NIP-19 `naddr1...` string. */
export function encodeCampaignNaddr(campaign: ParsedCampaign, relays?: string[]): string {
  return nip19.naddrEncode({
    kind: CAMPAIGN_KIND,
    pubkey: campaign.pubkey,
    identifier: campaign.identifier,
    relays,
  });
}

/**
 * Slugifies a free-form string into a `d` tag value. Lowercase, ASCII-only,
 * hyphenated. Returns an empty string if nothing remains after stripping.
 */
export function slugifyCampaignIdentifier(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    // strip combining marks
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
