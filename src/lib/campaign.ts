import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

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
export type CampaignWalletMode = 'onchain' | 'sp';

/** Parsed wallet endpoint declared by a campaign's `w` tag. */
export interface CampaignWallet {
  /** Raw bech32(m) string as it appears in the `w` tag. */
  value: string;
  /** Mode derived from the prefix. */
  mode: CampaignWalletMode;
}

/**
 * NIP-92 imeta block parsed from a campaign event. Pairs with the
 * `banner` tag (`url` MUST match the banner URL — clients ignore an
 * imeta whose URL does not match).
 */
export interface CampaignBannerImeta {
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
  /** Bitcoin wallet endpoint (required). */
  wallet: CampaignWallet;
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

  const wallet = parseCampaignWallet(getTag(event, 'w'));
  if (!wallet) return null;

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
    wallet,
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
