/**
 * Structured FAQ content for the Help section.
 *
 * This module is the single source of truth for FAQ *structure* — category
 * order, item IDs within each category, and the `hidden` flag on the
 * legacy category. The user-visible strings (category labels, questions,
 * and answer paragraphs) are translated and live under the `faq.*`
 * namespace in `src/locales/*.json`.
 *
 * Any page can call `getFAQCategories(appName)` to render the full FAQ.
 * Internally these resolve strings through `i18n.t()`, so callers must
 * trigger a re-render when the active language changes — `HelpFAQSection`
 * and `HelpTip` do this by depending on `i18n.language` via
 * `useTranslation()`.
 *
 * Adding a new FAQ item:
 *   1. Add `{ id: 'my-new-item' }` to the relevant category's `items` here.
 *   2. Add `faq.items.my-new-item.question` and `.answer` to en.json.
 *   3. Translate into the other locales (or leave them — i18next falls
 *      back to English at runtime).
 *
 * Answer strings may contain the simple inline markup supported by
 * `renderInlineMarkup`: `**bold**` and `[link text](url)`, plus
 * `{{appName}}` for runtime interpolation of the app's name.
 */

import i18n from '@/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FAQItem {
  /** Stable key used for accordion state, deep-linking, and i18n lookups. */
  id: string;
  /** The question (plain text). */
  question: string;
  /**
   * The answer, as an array of paragraph strings.
   * Strings may contain simple inline markup:
   *   **bold**  and  [link text](url)
   */
  answer: string[];
}

export interface FAQCategory {
  id: string;
  label: string;
  description?: string;
  items: FAQItem[];
  /**
   * If true, this category is excluded from the default `HelpFAQSection`
   * render. Used for legacy items kept around so existing `HelpTip` call
   * sites on other pages don't break, without exposing them in the public
   * FAQ accordion.
   */
  hidden?: boolean;
}

// ── Structure (no user-visible strings; all strings live in locales) ─────────

interface FAQItemStructure {
  id: string;
}

interface FAQCategoryStructure {
  id: string;
  items: FAQItemStructure[];
  hidden?: boolean;
}

/**
 * FAQ structure: ordered list of categories and the item IDs they contain.
 * Strings are resolved from `i18n` at read-time by the helpers below.
 */
const FAQ_STRUCTURE: FAQCategoryStructure[] = [
  {
    id: 'getting-started',
    items: [
      { id: 'what-is-ditto' },
      { id: 'cost-to-use' },
      { id: 'who-made-this' },
    ],
  },
  {
    id: 'payments',
    items: [
      { id: 'censorship-resistance' },
      { id: 'why-onchain' },
      { id: 'why-not-rotating-addresses' },
      { id: 'why-not-other-crypto' },
    ],
  },
  {
    id: 'about-nostr',
    items: [
      { id: 'what-is-nostr' },
      { id: 'why-login-different' },
      { id: 'lose-secret-key' },
      { id: 'manage-secret-key' },
    ],
  },
  {
    // Hidden legacy items: kept so existing `HelpTip` call sites on other
    // pages don't break, but excluded from the default FAQ render.
    id: 'legacy',
    hidden: true,
    items: [
      { id: 'fyp' },
      { id: 'what-are-relays' },
      { id: 'what-are-blossom' },
      { id: 'report-content' },
      { id: 'vs-mastodon-bluesky' },
      { id: 'profile-fields' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a single FAQ item to its translated form. Falls back gracefully
 * when an answer key is missing in the active locale — i18next returns the
 * English string in that case, so missing translations just degrade to
 * English without breaking the page.
 */
function resolveItem(id: string, appName: string): FAQItem {
  const question = i18n.t(`faq.items.${id}.question`, { appName });

  // `returnObjects: true` lets us pull the answer array straight out of
  // the locale file. i18next will return the key path as a string if it
  // can't find the entry, so guard against that and fall back to an
  // empty array so the renderer doesn't explode.
  const rawAnswer = i18n.t(`faq.items.${id}.answer`, {
    appName,
    returnObjects: true,
  });
  const answer: string[] = Array.isArray(rawAnswer)
    ? (rawAnswer as string[])
    : [];

  return { id, question, answer };
}

/** Resolve a category to its translated form (label + items). */
function resolveCategory(
  structure: FAQCategoryStructure,
  appName: string,
): FAQCategory {
  const label = i18n.t(`faq.categories.${structure.id}.label`, { appName });
  // Description is optional — currently nothing in en.json provides one,
  // but the type allows it for future use.
  const descriptionKey = `faq.categories.${structure.id}.description`;
  const description = i18n.exists(descriptionKey)
    ? i18n.t(descriptionKey, { appName })
    : undefined;

  return {
    id: structure.id,
    label,
    description,
    hidden: structure.hidden,
    items: structure.items.map((i) => resolveItem(i.id, appName)),
  };
}

/**
 * Return the full list of FAQ categories with strings resolved against
 * the active i18n language and `{{appName}}` interpolated to `appName`.
 *
 * Callers that need reactivity when the user switches languages should
 * pull `i18n.language` from `useTranslation()` and include it in their
 * `useMemo` dependency list.
 */
export function getFAQCategories(appName: string): FAQCategory[] {
  return FAQ_STRUCTURE.map((c) => resolveCategory(c, appName));
}

/** Look up a single FAQ item by its ID across all categories. */
export function getFAQItem(appName: string, itemId: string): FAQItem | undefined {
  for (const cat of FAQ_STRUCTURE) {
    if (cat.items.some((i) => i.id === itemId)) {
      return resolveItem(itemId, appName);
    }
  }
  return undefined;
}

/**
 * @deprecated Re-exported from `@/lib/agoraDefaults` as `TEAM_SOAPBOX`.
 * This alias is kept for one transition pass; new code should import the
 * canonical constant directly.
 */
export { TEAM_SOAPBOX as TEAM_SOAPBOX_PACK } from '@/lib/agoraDefaults';

// ── Donor / Recipient guide content ──────────────────────────────────────────

/**
 * The Donor Guide and Recipient Guide pages are composed from a typed
 * sequence of {@link GuideBlock}s. Each block kind is rendered by a
 * dedicated component from `@/components/guide/`. The page just
 * dispatches on `block.kind`.
 *
 * The structure (block order, block kinds, callout variant, optionGrid
 * hrefs and chips) lives in this file. The
 * user-visible strings live under the `guides.donor.*` and
 * `guides.recipient.*` namespaces in `src/locales/*.json`, keyed by the
 * `id` on each structural block below.
 *
 * Strings may contain the inline markup supported by `renderInlineMarkup`
 * (`**bold**` and `[link](url)`) plus i18next-style `{{appName}}`
 * interpolation. `chips` and `href`s are not user-visible prose and stay
 * in code — chips because they're stylistic micro-labels (mostly
 * technical terms), hrefs because they're external URLs.
 *
 * Callers must trigger a re-render when the active i18n language
 * changes; both `DonorGuidePage` and `RecipientGuidePage` do this via
 * `useTranslation()` whose `i18n.language` dep feeds a `useMemo`.
 */

/**
 * Top-of-page summary card. One-sentence lede, plus 2 to 3 chip-style
 * next-actions that orient the reader without making them scroll.
 */
export interface GuideTldrBlock {
  kind: 'tldr';
  lede: string;
  nextActions: string[];
}

/** Numbered vertical flow of 2 to 4 short steps. */
export interface GuideStepsBlock {
  kind: 'steps';
  heading: string;
  steps: { title: string; body: string }[];
}

/** Single-line callout block with a tinted background and an icon. */
export interface GuideCalloutBlock {
  kind: 'callout';
  variant: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  body: string;
}

/** A short prose paragraph block (escape hatch for the rare "needs words"). */
export interface GuideProseBlock {
  kind: 'prose';
  heading?: string;
  paragraphs: string[];
}

/** A single tile inside a {@link GuideOptionGridBlock}. */
export interface GuideOptionItem {
  /** Tile heading. */
  name: string;
  /** One-sentence purpose / payoff. */
  purpose: string;
  /** Short tag chips (e.g. `non-custodial`, `low fees`). */
  chips: string[];
  /** Optional external URL the tile links to. */
  href?: string;
}

/** Grid of compact OptionCard tiles. Used for cash-out and privacy options. */
export interface GuideOptionGridBlock {
  kind: 'optionGrid';
  heading: string;
  intro?: string;
  options: GuideOptionItem[];
}

export type GuideBlock =
  | GuideTldrBlock
  | GuideStepsBlock
  | GuideCalloutBlock
  | GuideProseBlock
  | GuideOptionGridBlock;

// ── Guide structure (no user-visible strings; all strings live in locales) ───

/**
 * A discriminated union of structural block descriptors. Each variant
 * carries enough state to (a) build the rendered `GuideBlock` after a
 * string lookup and (b) reference the right i18n keys.
 *
 * `id` is the leaf segment under the guide's namespace (e.g. a donor
 * `{ kind: 'tldr', id: 'tldr' }` block resolves
 * `guides.donor.tldr.lede` and `guides.donor.tldr.nextActions`).
 */
type GuideBlockStructure =
  | { kind: 'tldr'; id: string }
  | { kind: 'steps'; id: string; stepIds: string[] }
  | { kind: 'callout'; id: string; variant: 'info' | 'warning' | 'danger' | 'success' }
  | { kind: 'prose'; id: string; paragraphCount: number; hasHeading?: boolean }
  | {
      kind: 'optionGrid';
      id: string;
      /** Optional intro paragraph above the grid. */
      hasIntro?: boolean;
      options: {
        /** Leaf key under `guides.<guide>.<id>.options.<optionId>`. */
        id: string;
        chips: string[];
        href?: string;
      }[];
    };

const DONOR_GUIDE_STRUCTURE: GuideBlockStructure[] = [
  { kind: 'tldr', id: 'tldr' },
  {
    kind: 'steps',
    id: 'flow',
    stepIds: ['openCampaign', 'arrivesDirectly'],
  },
  { kind: 'callout', id: 'publicVisible', variant: 'warning' },
  {
    kind: 'optionGrid',
    id: 'privacy',
    hasIntro: true,
    options: [
      {
        id: 'nonKyc',
        chips: ['peer-to-peer', 'no ID'],
        href: 'https://bisq.network',
      },
      {
        id: 'noKycExchange',
        chips: ['exchange', 'no KYC'],
        href: 'https://nonlogs.io',
      },
      {
        id: 'coinjoin',
        chips: ['optional step', 'no proof needed'],
      },
    ],
  },
  { kind: 'callout', id: 'consumerApps', variant: 'danger' },
];

const RECIPIENT_GUIDE_STRUCTURE: GuideBlockStructure[] = [
  { kind: 'tldr', id: 'tldr' },
  { kind: 'prose', id: 'howReceiving', paragraphCount: 6, hasHeading: true },
  { kind: 'prose', id: 'whatEveryoneSees', paragraphCount: 2, hasHeading: true },
  {
    kind: 'steps',
    id: 'movePromptly',
    stepIds: ['sweep', 'dontSit'],
  },
  {
    kind: 'optionGrid',
    id: 'cashout',
    hasIntro: true,
    options: [
      {
        id: 'coinjoin',
        chips: ['non-custodial', 'no KYC'],
        href: 'https://nonlogs.io',
      },
      {
        id: 'peerToPeer',
        chips: ['cash', 'no KYC'],
        href: 'https://bisq.network',
      },
    ],
  },
  { kind: 'callout', id: 'tumblers', variant: 'danger' },
];

/**
 * Translation parameters passed to every `i18n.t()` call inside the
 * guide resolver. Shared object keeps the resolver concise and ensures
 * `{{appName}}` is consistently interpolated everywhere.
 */
function tParams(appName: string): Record<string, string> {
  return { appName };
}

/** Resolve a single structural guide block to its translated `GuideBlock`. */
function resolveGuideBlock(
  structure: GuideBlockStructure,
  guide: 'donor' | 'recipient',
  appName: string,
): GuideBlock {
  const params = tParams(appName);
  const base = `guides.${guide}.${structure.id}`;

  switch (structure.kind) {
    case 'tldr': {
      const lede = i18n.t(`${base}.lede`, params);
      const raw = i18n.t(`${base}.nextActions`, { ...params, returnObjects: true });
      const nextActions: string[] = Array.isArray(raw) ? (raw as string[]) : [];
      return { kind: 'tldr', lede, nextActions };
    }
    case 'steps': {
      const heading = i18n.t(`${base}.heading`, params);
      const steps = structure.stepIds.map((sid) => ({
        title: i18n.t(`${base}.steps.${sid}.title`, params),
        body: i18n.t(`${base}.steps.${sid}.body`, params),
      }));
      return { kind: 'steps', heading, steps };
    }
    case 'callout': {
      const title = i18n.t(`${base}.title`, params);
      const body = i18n.t(`${base}.body`, params);
      return { kind: 'callout', variant: structure.variant, title, body };
    }
    case 'prose': {
      const heading = structure.hasHeading
        ? i18n.t(`${base}.heading`, params)
        : undefined;
      const raw = i18n.t(`${base}.paragraphs`, { ...params, returnObjects: true });
      const paragraphs: string[] = Array.isArray(raw) ? (raw as string[]) : [];
      return { kind: 'prose', heading, paragraphs };
    }
    case 'optionGrid': {
      const heading = i18n.t(`${base}.heading`, params);
      const intro = structure.hasIntro
        ? i18n.t(`${base}.intro`, params)
        : undefined;
      const options: GuideOptionItem[] = structure.options.map((opt) => ({
        name: i18n.t(`${base}.options.${opt.id}.name`, params),
        purpose: i18n.t(`${base}.options.${opt.id}.purpose`, params),
        chips: opt.chips,
        href: opt.href,
      }));
      return { kind: 'optionGrid', heading, intro, options };
    }
  }
}

/**
 * Donor guide blocks, resolved against the active language and with
 * `{{appName}}` interpolated to `appName`. Re-renders are the caller's
 * responsibility — `DonorGuidePage` depends on `i18n.language` so a
 * language switch re-evaluates this.
 */
export function getDonorGuideBlocks(appName: string): GuideBlock[] {
  return DONOR_GUIDE_STRUCTURE.map((b) => resolveGuideBlock(b, 'donor', appName));
}

/** Recipient guide blocks — same contract as `getDonorGuideBlocks`. */
export function getRecipientGuideBlocks(appName: string): GuideBlock[] {
  return RECIPIENT_GUIDE_STRUCTURE.map((b) => resolveGuideBlock(b, 'recipient', appName));
}
