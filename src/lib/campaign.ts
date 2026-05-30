import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import slugify from 'slugify';

import { COUNTRIES } from '@/lib/countries';
import { parseCountryIdentifier } from '@/lib/countryIdentifiers';
import { validateBitcoinAddress } from '@/lib/bitcoin';

/**
 * Addressable kind number for fundraising campaigns (see NIP.md, Kind 33863).
 *
 * Campaigns are self-authored — the event author owns the wallet declared
 * in the `w` tag and is the sole beneficiary of donations. There is no
 * recipient list, no split logic, and no on-behalf-of authorship.
 */
export const CAMPAIGN_KIND = 33863;

/**
 * Two ways a campaign can accept donations, distinguished by the `w` tag's
 * bech32(m) prefix:
 *
 * - **`onchain`** — the wallet is a public mainnet on-chain bech32(m)
 *   address (`bc1q…` segwit v0 or `bc1p…` Taproot). Donations are
 *   traceable; clients show progress, totals, and recent donations.
 * - **`sp`** — the wallet is a BIP-352 silent-payment code (`sp1…`).
 *   Donations are unlinkable by design; clients MUST hide all aggregate
 *   UI and MUST NOT publish donation receipts.
 */
type CampaignWalletMode = 'onchain' | 'sp';

/** Parsed wallet endpoint declared by a campaign's `w` tag. */
interface CampaignWallet {
  /** Raw bech32(m) string as it appears in the `w` tag. */
  value: string;
  /** Mode derived from the prefix. */
  mode: CampaignWalletMode;
}

/**
 * The full set of wallet endpoints declared by a campaign. A campaign may
 * carry up to one endpoint per mode; at least one must be present, but
 * both modes may be present simultaneously (the QR code combines them).
 */
export interface CampaignWallets {
  /** On-chain mainnet bech32(m) address, if declared. */
  onchain?: CampaignWallet;
  /** BIP-352 silent-payment code, if declared. */
  sp?: CampaignWallet;
}

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
  /** Bitcoin wallet endpoints (at least one is present). */
  wallets: CampaignWallets;
  /** Fundraising goal in **integer US Dollars**, or `undefined` if not set. */
  goalUsd?: number;
  /** Deadline (Unix seconds), or `undefined` if not set. */
  deadline?: number;
  /** ISO 3166-1 alpha-2 country code parsed from a NIP-73 `i` tag. */
  countryCode?: string;
  /** Created-at from the event. */
  createdAt: number;
}

/** Returns the first value of a tag, or undefined. */
function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Returns all values of a tag in declaration order. */
function getTagValues(event: NostrEvent, name: string): string[] {
  const values: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== name) continue;
    if (typeof tag[1] !== 'string') continue;
    values.push(tag[1]);
  }
  return values;
}

/** Parses a positive integer string. Returns undefined on failure. */
function parsePositiveInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
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
 * Parse a campaign wallet endpoint, returning the parsed wallet on success
 * or `null` if the string is missing, malformed, or for a network we
 * don't accept (testnet, regtest, etc.).
 *
 * Mode is inferred from the bech32 HRP/prefix:
 *
 * - `bc1q…` / `bc1p…` → mainnet on-chain (validated via @scure/btc-signer).
 * - `sp1…` → BIP-352 silent-payment code (validated via prefix + bech32m
 *   checksum at the donor's wallet when it derives the payment output).
 *
 * Any other prefix (`tb1…`, `bcrt1…`, `tsp1…`, `lnbc…`, etc.) is rejected.
 */
export function parseCampaignWallet(value: string | undefined): CampaignWallet | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // On-chain mainnet: bc1q (segwit v0) or bc1p (Taproot v1).
  if (/^bc1[qp]/i.test(trimmed)) {
    if (!validateBitcoinAddress(trimmed)) return null;
    return { value: trimmed, mode: 'onchain' };
  }

  // Silent payments: sp1 followed by bech32m payload (mainnet only).
  if (/^sp1[02-9ac-hj-np-z]+$/i.test(trimmed)) {
    // @scure/btc-signer's address decoder doesn't currently parse BIP-352
    // codes, so we accept any bech32m-shaped sp1 string. The checksum is
    // verified by the donor's wallet when it derives the payment output; an
    // invalid code there simply fails the donation flow.
    return { value: trimmed, mode: 'sp' };
  }

  return null;
}

/**
 * Parse all of a campaign's `w` tags into a {@link CampaignWallets}
 * struct. Returns `null` if the campaign carries no `w` tags, any
 * individual `w` value fails {@link parseCampaignWallet}, or more than
 * one `w` value is present for the same mode (the spec permits at most
 * one endpoint per mode).
 */
function parseCampaignWallets(values: string[]): CampaignWallets | null {
  if (values.length === 0) return null;
  const wallets: CampaignWallets = {};
  for (const raw of values) {
    const parsed = parseCampaignWallet(raw);
    if (!parsed) return null;
    if (wallets[parsed.mode]) {
      // Two endpoints of the same mode is invalid per NIP.md.
      return null;
    }
    wallets[parsed.mode] = parsed;
  }
  if (!wallets.onchain && !wallets.sp) return null;
  return wallets;
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
 * `null` if the event is missing a required field (kind, `d`, `title`, or
 * a valid `w` wallet endpoint).
 */
export function parseCampaign(event: NostrEvent): ParsedCampaign | null {
  if (event.kind !== CAMPAIGN_KIND) return null;

  const identifier = getTag(event, 'd');
  const title = getTag(event, 'title');
  if (!identifier || !title) return null;

  const wallets = parseCampaignWallets(getTagValues(event, 'w'));
  if (!wallets) return null;

  // Banner — only accept https URLs. Formal sanitizeUrl pass happens at
  // the render site (this lib runs in tests without DOM); strip non-https
  // here so the parsed value is safe to interpolate into a fetch().
  const rawBanner = getTag(event, 'banner');
  const banner = rawBanner && /^https:\/\//i.test(rawBanner) ? rawBanner : undefined;
  const bannerImeta = getBannerImeta(event, banner);

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
    wallets,
    goalUsd: parsePositiveInt(getTag(event, 'goal')),
    deadline: parsePositiveInt(getTag(event, 'deadline')),
    countryCode: getCountryCode(event),
    createdAt: event.created_at,
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
