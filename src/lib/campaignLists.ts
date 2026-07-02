import type { NostrEvent } from '@nostrify/nostrify';
import slugify from 'slugify';

import { CAMPAIGN_KIND } from '@/lib/campaign';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Curated topic lists of campaigns.
 *
 * Each list is a single NIP-51 **kind 30003 (Bookmark Set)** event authored
 * by a campaign moderator (a `p` in the Team Soapbox follow pack — see
 * `useCampaignModerators`). The ordered `a` tags are the list members, in
 * display order; the title / description / icon live in standard NIP-51
 * tags plus one Agora-specific `icon` tag holding the Lucide icon name.
 *
 * **Tag layout (per list event):**
 * ```
 * ['d', '<slug>']                            // stable lowercased slug
 * ['title', '<display name>']                // NIP-51
 * ['description', '<optional blurb>']        // NIP-51, optional
 * ['icon', '<LucideIconName>']               // PascalCase, looked up via LucideIcon component
 * ['t', 'agora.campaign-list']               // hashtag namespace so all lists can be queried in one filter
 * ['a', '33863:<pubkey>:<d>']                // one per campaign, ARRAY ORDER = display order
 * ['alt', 'Eranos campaign list: <title>']    // NIP-31
 * ```
 *
 * **List-of-lists order** is encoded as a separate sentinel kind 30003
 * event with `d = 'agora.campaign-lists.index'` whose `a` tags reference
 * the list events themselves (`30003:<authorPubkey>:<slug>`) in the
 * desired display order. Any moderator may publish an index; at read time
 * the newest-`created_at` index across all moderators wins. Lists not in
 * the current index fall to the end of the strip in newest-first order so
 * a freshly-created list is visible until a moderator reorders.
 *
 * **Trust model.** Read paths MUST gate `authors:` on the moderator
 * allowlist (`useCampaignModerators`). Without that gate, any pubkey could
 * publish a kind 30003 event with the `agora.campaign-list` hashtag and
 * appear in the strip. The fold also picks the newest event per
 * `(pubkey, d)` for a single list — concurrent edits from two moderators
 * resolve to whoever publishes last, matching the rest of the moderation
 * namespace.
 */

/** Kind 30003 — NIP-51 Bookmark Set. */
export const CAMPAIGN_LIST_KIND = 30003;

/** Hashtag marker that identifies an Eranos campaign list. */
export const CAMPAIGN_LIST_HASHTAG = 'agora.campaign-list';

/**
 * Hashtag marker and `d` tag for the sentinel "lists order" event.
 * Both values are deliberately equal so a single `#t` filter pulls back
 * both the list events and the index event in one round trip.
 */
export const CAMPAIGN_LIST_INDEX_HASHTAG = 'agora.campaign-lists.index';
export const CAMPAIGN_LIST_INDEX_D = 'agora.campaign-lists.index';

/** A 64-character lowercase hex string. */
const HEX_64_RE = /^[0-9a-f]{64}$/;

/** A list slug — kebab-case, lowercase ASCII, digits, hyphens. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Lucide icon name — PascalCase, allow letters and digits only. */
const ICON_NAME_RE = /^[A-Z][A-Za-z0-9]{0,63}$/;

/**
 * A parsed Eranos campaign list, ready for rendering. The membership
 * (`coords`) is in display order — the order in which the `a` tags
 * appeared on the source event.
 */
export interface ParsedCampaignList {
  /** Underlying kind 30003 event. */
  event: NostrEvent;
  /** `d` tag — stable slug used in URLs and as the index reference. */
  slug: string;
  /** Author pubkey (the moderator who last published this revision). */
  authorPubkey: string;
  /** Coordinate `30003:<authorPubkey>:<slug>`. */
  aTag: string;
  /** Display name. */
  title: string;
  /** Optional short description. */
  description?: string;
  /** Lucide icon component name (PascalCase). Already validated. */
  icon: string;
  /** Optional sanitized cover image URL (from a `cover` tag). */
  cover?: string;
  /** Ordered list of campaign coordinates (`33863:<pubkey>:<d>`). */
  coords: string[];
  /** `created_at` of the source event. */
  createdAt: number;
}

/** Parse a single kind 30003 event into a list, or `null` if invalid. */
export function parseCampaignList(event: NostrEvent): ParsedCampaignList | null {
  if (event.kind !== CAMPAIGN_LIST_KIND) return null;

  const getTag = (name: string) =>
    event.tags.find(([n, v]) => n === name && typeof v === 'string')?.[1];

  const slug = getTag('d');
  if (!slug || !SLUG_RE.test(slug)) return null;
  // The index sentinel is not a renderable list.
  if (slug === CAMPAIGN_LIST_INDEX_D) return null;

  // Must carry the campaign-list hashtag to be considered an Agora list —
  // not every kind 30003 authored by a moderator is one of ours.
  const isCampaignList = event.tags.some(
    ([n, v]) => n === 't' && v === CAMPAIGN_LIST_HASHTAG,
  );
  if (!isCampaignList) return null;

  const title = getTag('title')?.trim();
  if (!title) return null;

  const description = getTag('description')?.trim() || undefined;

  // Icon defaults to a generic `List` if the publisher omitted or chose an
  // invalid name. The picker UI enforces a valid Lucide name on write,
  // so this fallback only triggers for hand-crafted events or rare typos.
  const rawIcon = getTag('icon')?.trim();
  const icon = rawIcon && ICON_NAME_RE.test(rawIcon) ? rawIcon : 'List';

  const cover = sanitizeUrl(getTag('cover'));

  // Membership: `a` tags pointing at campaign coordinates, in array order.
  // Filter to the campaign kind and a well-formed `kind:hexpubkey:slug`.
  const coords: string[] = [];
  const coordPrefix = `${CAMPAIGN_KIND}:`;
  const seen = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;
    const value = tag[1];
    if (!value.startsWith(coordPrefix)) continue;
    const parts = value.split(':');
    if (parts.length < 3) continue;
    const pubkey = parts[1];
    const dTag = parts.slice(2).join(':');
    if (!HEX_64_RE.test(pubkey) || !dTag) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    coords.push(value);
  }

  return {
    event,
    slug,
    authorPubkey: event.pubkey,
    aTag: `${CAMPAIGN_LIST_KIND}:${event.pubkey}:${slug}`,
    title,
    description,
    icon,
    cover,
    coords,
    createdAt: event.created_at,
  };
}

/**
 * Extract the list coord order from a sentinel "index" event. Returns the
 * ordered list of `30003:<author>:<slug>` references that the index points
 * at. Invalid `a` tags are dropped.
 */
export function parseCampaignListIndex(event: NostrEvent): string[] {
  if (event.kind !== CAMPAIGN_LIST_KIND) return [];
  // The index sentinel uses a dedicated `d` tag.
  const d = event.tags.find(([n]) => n === 'd')?.[1];
  if (d !== CAMPAIGN_LIST_INDEX_D) return [];

  const refs: string[] = [];
  const seen = new Set<string>();
  const listPrefix = `${CAMPAIGN_LIST_KIND}:`;
  for (const tag of event.tags) {
    if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;
    const value = tag[1];
    if (!value.startsWith(listPrefix)) continue;
    const parts = value.split(':');
    if (parts.length < 3) continue;
    const pubkey = parts[1];
    const slug = parts.slice(2).join(':');
    if (!HEX_64_RE.test(pubkey) || !SLUG_RE.test(slug)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    refs.push(value);
  }
  return refs;
}

/**
 * Compose a sorted list array from raw events. Lists are deduped per
 * `(pubkey, slug)`, newest `created_at` wins. The optional index event
 * dictates display order — referenced lists appear in index order; any
 * remaining lists fall to the end in newest-first order so a brand-new
 * list is visible until a moderator reorders.
 *
 * @param events    Mixed bag of kind 30003 events from moderator authors.
 * @returns         `{ lists, indexEvent }` — `indexEvent` is the newest
 *                  sentinel event across all moderators, or `undefined`
 *                  when no moderator has published one yet.
 */
export function foldCampaignLists(events: NostrEvent[]): {
  lists: ParsedCampaignList[];
  indexEvent: NostrEvent | undefined;
} {
  // Bucket: lists vs. index events. We let the parsers tell us which is
  // which (parseCampaignList rejects the index `d`, parseCampaignListIndex
  // rejects everything else).
  const listsByAuthorSlug = new Map<string, ParsedCampaignList>();
  let indexEvent: NostrEvent | undefined;

  for (const event of events) {
    if (event.kind !== CAMPAIGN_LIST_KIND) continue;
    const d = event.tags.find(([n]) => n === 'd')?.[1];
    if (!d) continue;

    if (d === CAMPAIGN_LIST_INDEX_D) {
      if (!indexEvent || event.created_at > indexEvent.created_at) {
        indexEvent = event;
      }
      continue;
    }

    const parsed = parseCampaignList(event);
    if (!parsed) continue;
    const key = `${parsed.authorPubkey}:${parsed.slug}`;
    const prev = listsByAuthorSlug.get(key);
    if (!prev || parsed.createdAt > prev.createdAt) {
      listsByAuthorSlug.set(key, parsed);
    }
  }

  const all = Array.from(listsByAuthorSlug.values());
  const byCoord = new Map(all.map((l) => [l.aTag, l]));

  // Apply index order. Lists referenced by the index appear first, in the
  // index's order; remaining lists are appended newest-first.
  let lists: ParsedCampaignList[] = [];
  const consumed = new Set<string>();
  if (indexEvent) {
    const orderRefs = parseCampaignListIndex(indexEvent);
    for (const ref of orderRefs) {
      const found = byCoord.get(ref);
      if (found && !consumed.has(found.aTag)) {
        lists.push(found);
        consumed.add(found.aTag);
      }
    }
  }
  const tail = all
    .filter((l) => !consumed.has(l.aTag))
    .sort((a, b) => b.createdAt - a.createdAt);
  lists = lists.concat(tail);

  return { lists, indexEvent };
}

/**
 * Generate a kebab-case slug from a free-form title. Collisions are the
 * caller's responsibility (see useCampaignListActions.createList).
 */
export function slugifyListTitle(title: string): string {
  const base = slugify(title, { lower: true, strict: true, trim: true });
  // Clamp to 64 chars and trim leading/trailing hyphens.
  const clamped = base.slice(0, 64).replace(/^-+|-+$/g, '');
  // Ensure first char is alphanumeric per SLUG_RE.
  return clamped.replace(/^-+/, '') || 'list';
}

/** Validate a slug against the on-write regex. Exposed for tests / forms. */
export function isValidListSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Validate a Lucide icon name. */
export function isValidIconName(name: string): boolean {
  return ICON_NAME_RE.test(name);
}
