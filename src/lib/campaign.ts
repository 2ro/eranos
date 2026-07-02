import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import slugify from 'slugify';

import { COUNTRIES } from '@/lib/countries';
import { parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { isValidSlatepackAddress } from '@/lib/grinProof';

/**
 * Addressable kind number for fundraising campaigns (see NIP.md, Kind 33863).
 *
 * Campaigns are self-authored — the event author is the sole beneficiary
 * of donations. There is no recipient list, no split logic, and no
 * on-behalf-of authorship.
 *
 * Grin receiving config (both optional, both may be present):
 * - `["grin", "<grin1…>"]` — a native Slatepack address; donors pay from
 *   any Grin wallet and can publish a payment proof (kind 3414) that the
 *   tally verifies trustlessly (see `lib/grinProof.ts`).
 * - `["goblinpay", "<npub|nprofile>", "<signer pubkey>"]` — the campaign's
 *   GoblinPay receiving identity (its per-campaign endpub; a campaign is a
 *   GoblinPay "user"), plus (optional, element 3) the x-only pubkey (hex or
 *   npub) of the GoblinPay server whose signed receipts count toward this
 *   campaign's tally when published by donors.
 */
export const CAMPAIGN_KIND = 33863;

/**
 * NIP-92 imeta block parsed from a campaign event. Pairs with the
 * `banner` tag (`url` MUST match the banner URL — clients ignore an
 * imeta whose URL does not match).
 */
interface CampaignBannerImeta {
  url: string;
  /** MIME type, e.g. `image/jpeg`. */
  m?: string;
  /** SHA-256 of the file (lowercase hex). */
  x?: string;
  /** `WIDTHxHEIGHT` as published, kept verbatim. */
  dim?: string;
  blurhash?: string;
  /** Accessibility alt text for the banner (distinct from event-level NIP-31 alt). */
  alt?: string;
}

/** A fully-parsed campaign with everything the UI needs. */
export interface ParsedCampaign {
  /** The original event. */
  event: NostrEvent;
  /** Campaign creator's hex pubkey (the beneficiary). */
  pubkey: string;
  /** The campaign's `d` tag (slug). */
  identifier: string;
  /** Addressable coordinate `33863:<pubkey>:<d>`. */
  aTag: string;
  /** Campaign title. */
  title: string;
  /** Short tagline. */
  summary: string;
  /** Markdown story (the event content). */
  story: string;
  /** Sanitized HTTPS banner URL, or `undefined` if missing/invalid. */
  banner?: string;
  /** NIP-92 imeta for the banner. Only present when the imeta's `url` matches the banner. */
  bannerImeta?: CampaignBannerImeta;
  /** Fundraising goal in **integer US Dollars**, or `undefined` if not set. */
  goalUsd?: number;
  /** ISO 3166-1 alpha-2 country code parsed from a NIP-73 `i` tag. */
  countryCode?: string;
  /** Native Grin Slatepack address (`grin1…`) donors can pay from any Grin wallet. Checksum-validated at parse. */
  grinAddress?: string;
  /** The campaign's GoblinPay receiving identity (npub or nprofile — its per-campaign endpub). */
  goblinPayEndpub?: string;
  /** x-only hex pubkey of the GoblinPay server whose signed receipts count toward this campaign. */
  goblinPaySignerPubkey?: string;
  /** Created-at from the event. */
  createdAt: number;
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

/** Parse + validate the `grin` tag (a `grin1…` Slatepack address). */
function getGrinAddress(event: NostrEvent): string | undefined {
  const raw = getTag(event, 'grin')?.trim().toLowerCase();
  if (!raw || !isValidSlatepackAddress(raw)) return undefined;
  return raw;
}

/**
 * Parse the `goblinpay` tag: element 1 is the receiving identity (npub or
 * nprofile), element 2 (optional) the receipt-signer pubkey (hex or npub).
 * Malformed values are dropped field-by-field so one bad element doesn't
 * take out the other.
 */
function getGoblinPayConfig(event: NostrEvent): {
  endpub?: string;
  signerPubkey?: string;
} {
  const tag = event.tags.find(([n]) => n === 'goblinpay');
  if (!tag) return {};

  let endpub: string | undefined;
  const rawEndpub = typeof tag[1] === 'string' ? tag[1].trim() : '';
  if (rawEndpub) {
    try {
      const decoded = nip19.decode(rawEndpub);
      if (decoded.type === 'npub' || decoded.type === 'nprofile') endpub = rawEndpub;
    } catch {
      // not a valid NIP-19 identity — drop it
    }
  }

  let signerPubkey: string | undefined;
  const rawSigner = typeof tag[2] === 'string' ? tag[2].trim() : '';
  if (/^[0-9a-f]{64}$/i.test(rawSigner)) {
    signerPubkey = rawSigner.toLowerCase();
  } else if (rawSigner.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(rawSigner);
      if (decoded.type === 'npub') signerPubkey = decoded.data;
    } catch {
      // ignore
    }
  }

  return { endpub, signerPubkey };
}

function getCountryCode(event: NostrEvent): string | undefined {
  for (const [name, value] of event.tags) {
    if (name !== 'i' || typeof value !== 'string') continue;
    const code = parseCountryIdentifier(value);
    if (code && /^[A-Z]{2}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * Parse the NIP-92 `imeta` tag whose `url` matches the campaign's banner.
 * Returns `undefined` if no matching imeta is found.
 */
function getBannerImeta(event: NostrEvent, bannerUrl: string | undefined): CampaignBannerImeta | undefined {
  if (!bannerUrl) return undefined;

  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    // Each entry after the tag name is a space-separated `key value` pair.
    const fields: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const entry = tag[i];
      if (typeof entry !== 'string') continue;
      const spaceIdx = entry.indexOf(' ');
      if (spaceIdx <= 0) continue;
      const key = entry.slice(0, spaceIdx);
      const val = entry.slice(spaceIdx + 1);
      fields[key] = val;
    }
    if (fields.url !== bannerUrl) continue;

    return {
      url: fields.url,
      m: fields.m,
      x: fields.x,
      dim: fields.dim,
      blurhash: fields.blurhash,
      alt: fields.alt,
    };
  }

  return undefined;
}

/**
 * Parses a kind 33863 event into a strongly-typed campaign, or returns
 * `null` if the event is missing a required field (kind, `d`, or `title`).
 */
export function parseCampaign(event: NostrEvent): ParsedCampaign | null {
  if (event.kind !== CAMPAIGN_KIND) return null;

  const identifier = getTag(event, 'd');
  const title = getTag(event, 'title');
  if (!identifier || !title) return null;

  // Banner — only accept https URLs. Formal sanitizeUrl pass happens at
  // the render site (this lib runs in tests without DOM); strip non-https
  // here so the parsed value is safe to interpolate into a fetch().
  const rawBanner = getTag(event, 'banner');
  const banner = rawBanner && /^https:\/\//i.test(rawBanner) ? rawBanner : undefined;
  const bannerImeta = getBannerImeta(event, banner);
  const goblinPay = getGoblinPayConfig(event);

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    aTag: `${CAMPAIGN_KIND}:${event.pubkey}:${identifier}`,
    title: title.trim(),
    summary: getTag(event, 'summary')?.trim() ?? '',
    story: event.content,
    banner,
    bannerImeta,
    goalUsd: parsePositiveInt(getTag(event, 'goal')),
    countryCode: getCountryCode(event),
    grinAddress: getGrinAddress(event),
    goblinPayEndpub: goblinPay.endpub,
    goblinPaySignerPubkey: goblinPay.signerPubkey,
    createdAt: event.created_at,
  };
}

/**
 * Which Grin donation paths a campaign + this instance can offer:
 * - `invoice`: the instance-run GoblinPay invoice flow (needs the app
 *   config's `goblinPayUrl` + `goblinPayApiToken`).
 * - `endpub`: the campaign's own GoblinPay receiving identity
 *   (scan-to-pay, no invoice).
 * - `address`: the native `grin1…` Slatepack address.
 */
export function grinDonationPaths(
  campaign: ParsedCampaign,
  goblinPayUrl: string | undefined,
  goblinPayApiToken: string | undefined,
): { invoice: boolean; endpub: boolean; address: boolean } {
  return {
    invoice: !!goblinPayUrl && !!goblinPayApiToken,
    endpub: !!campaign.goblinPayEndpub,
    address: !!campaign.grinAddress,
  };
}

/** Human display for a campaign's country code, including the flag emoji. */
export function getCampaignCountryLabel(campaign: ParsedCampaign): string | undefined {
  const country = campaign.countryCode ? COUNTRIES[campaign.countryCode] : undefined;
  if (!country) return undefined;
  return `${country.flag} ${country.name}`;
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
 * Strip Unicode bidi controls, zero-width characters, and BOMs from a
 * user-supplied title before it lands in an event tag or feeds the slug
 * deriver. These code points are invisible in most rendering contexts
 * but survive copy-paste — they're routinely auto-inserted by RTL
 * keyboards (RLM/LRM/FSI/PDI), and they're a phishing vector when
 * preserved in display strings.
 *
 * - `\u200B-\u200F` zero-width space / joiner / non-joiner / LRM / RLM
 * - `\u202A-\u202E` LRE / RLE / PDF / LRO / RLO bidi embedding+override
 * - `\u2066-\u2069` LRI / RLI / FSI / PDI bidi isolates
 * - `\uFEFF` zero-width no-break space (BOM)
 *
 * Whitespace (including non-breaking variants) is preserved here —
 * trimming is the caller's job.
 */
export function sanitizeCampaignTitle(input: string): string {
  return input.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
}

/**
 * Slugifies a free-form string into a `d` tag value. Lowercase, ASCII-only,
 * hyphenated. Returns an empty string if nothing remains after stripping.
 *
 * Non-Latin scripts (Arabic, Cyrillic, Greek, Persian, Georgian, etc.) are
 * transliterated to ASCII via the `slugify` package's built-in charMap
 * before the strict-ASCII filter runs — so an Arabic title like `حملة`
 * becomes `hmlh` instead of collapsing to empty. Combining marks (diacritics
 * on Latin letters) are stripped via NFKD so `café` becomes `cafe`.
 *
 * The output is suitable for direct comparison against the strict d-tag
 * regex `/^[a-z0-9][a-z0-9-]{0,63}$/`; callers that need a guaranteed-
 * non-empty d-tag should use {@link buildCampaignSlug}, which adds a random
 * fallback for inputs that don't transliterate to any ASCII alphanumeric.
 */
export function slugifyCampaignIdentifier(input: string): string {
  // Drop bidi/zero-width controls first so they don't affect the slug
  // (RLM/LRM around a Latin title would otherwise survive into the
  // transliteration step as `\u200F` → no charMap entry → kept verbatim
  // → filtered, but only after pinning down the leading-hyphen position).
  const cleaned = sanitizeCampaignTitle(input);

  // `slugify` runs its charMap (covers Arabic, Persian, Cyrillic, Greek,
  // Georgian, Armenian, Vietnamese, common Latin diacritics, currency
  // symbols, smart quotes, etc.) and lowercases. We follow up with our
  // own NFKD + combining-mark strip to catch any Latin diacritics that
  // slugify's map missed, then collapse to the strict d-tag charset.
  const transliterated = slugify(cleaned, {
    lower: true,
    // We strip everything outside [a-z0-9] ourselves below, so let
    // slugify keep punctuation as-is — its `strict` mode would drop
    // useful separators that we'd rather convert to hyphens.
    strict: false,
    trim: true,
  });

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    // Re-trim trailing hyphens introduced by the 64-char truncation.
    .replace(/-+$/, '');
}

/**
 * Derive a publishable d-tag from a campaign title.
 *
 * Returns a `{ slug, isFallback }` pair:
 * - `slug` — a valid d-tag matching `/^[a-z0-9][a-z0-9-]{0,63}$/`.
 * - `isFallback` — `true` when the title contained no ASCII-transliterable
 *   characters (e.g. emoji-only, or scripts not covered by the
 *   transliteration map), and the slug is a random 10-character
 *   identifier of the form `campaign-XXXXXX`.
 *
 * The fallback exists so users typing titles in scripts like Chinese,
 * Japanese, Korean, Thai, Tamil, etc. can still publish a campaign —
 * the human-readable title lives in the `title` tag, so an opaque
 * d-tag has no user-facing cost beyond an uglier URL.
 */
export function buildCampaignSlug(input: string): { slug: string; isFallback: boolean } {
  const slug = slugifyCampaignIdentifier(input);
  if (slug && /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return { slug, isFallback: false };
  }
  return { slug: `campaign-${randomHex(6)}`, isFallback: true };
}

/** Cryptographically-random lowercase hex string of the given byte length. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
