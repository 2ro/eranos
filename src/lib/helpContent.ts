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
      { id: 'send-bitcoin-onchain' },
      { id: 'connect-wallet' },
      { id: 'donations-are-public-general' },
      { id: 'censorship-resistance' },
      { id: 'why-onchain' },
      { id: 'why-not-silent-payments' },
      { id: 'why-not-lightning' },
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
      { id: 'send-bitcoin-lightning' },
      { id: 'what-are-zaps' },
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

// ── Donor / Activist guide content ────────────────────────────────────────────

/**
 * The Donor Guide and Activist Guide pages are composed from a typed
 * sequence of {@link GuideBlock}s. Each block kind is rendered by a
 * dedicated component from `@/components/guide/`. The page just
 * dispatches on `block.kind`.
 *
 * String fields may contain the same inline markup as FAQ answers
 * (`**bold**` and `[link](url)`), and the `{appName}` placeholder. Both
 * are resolved at read-time by the `getDonorGuideBlocks` /
 * `getActivistGuideBlocks` helpers below.
 *
 * TODO: not yet translated. The guide blocks are still keyed off the
 * original `{appName}` (single-brace) literal — separate i18n pass.
 */

/** Replace `{appName}` literals in a guide string with the resolved value. */
function substitute(str: string, appName: string): string {
  return str.replaceAll('{appName}', appName);
}

/**
 * The two payment options a campaign can offer. Used by table headers
 * and inline badges.
 *
 * - `'public'`: a regular Bitcoin address. Visible on-chain, every
 *   wallet can pay it.
 * - `'silent'`: a BIP-352 silent-payments endpoint. The receiving side
 *   is unlinkable on-chain, but most wallets can't send to it yet.
 */
export type PaymentMode = 'public' | 'silent';

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

/**
 * Side-by-side comparison of Public Payments vs. Silent Payments.
 * Rendered as a real two-column table on desktop and as two stacked
 * tinted cards on mobile (no sideways scroll). Audience controls row
 * copy: donors see "what to expect when paying," activists see "what
 * to choose."
 */
export interface GuidePaymentComparisonBlock {
  kind: 'paymentComparison';
  audience: 'donor' | 'activist';
  /** Optional one-line footnote rendered under the table. */
  footnote?: string;
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
  | GuidePaymentComparisonBlock
  | GuideCalloutBlock
  | GuideProseBlock
  | GuideOptionGridBlock;

const DONOR_GUIDE_TEMPLATE: GuideBlock[] = [
  {
    kind: 'tldr',
    lede: 'Pay the Bitcoin address on the campaign page from any wallet you already have. If the campaign accepts silent payments and your wallet supports them, your donation is private automatically.',
    nextActions: [
      'Pay from any Bitcoin wallet',
      'No middleman, no holding period',
      'Want privacy? Read below',
    ],
  },
  {
    kind: 'steps',
    heading: 'How a donation flows',
    steps: [
      {
        title: 'Open the campaign',
        body: 'You see a single QR code. If the campaign accepts both options, it encodes both endpoints; your wallet picks the right one.',
      },
      {
        title: 'Pay it from any wallet',
        body: 'Cash App, Coinbase, Strike, a hardware wallet, anything. Pay the amount plus the network fee.',
      },
      {
        title: 'It arrives directly',
        body: "Funds settle straight to the activist. {appName} doesn't hold or route them, and the address is derived from the activist's Nostr key.",
      },
    ],
  },
  {
    kind: 'paymentComparison',
    audience: 'donor',
    footnote:
      'Campaigns can accept Public only, Silent only, or both. If both, the QR code carries both endpoints. Your wallet picks the one it can use.',
  },
  {
    kind: 'callout',
    variant: 'warning',
    title: 'Public donations are visible on-chain forever',
    body: 'A **Public** donation lands at a regular Bitcoin address tied to the campaign. Anyone can look up the address and see the amount, the time, and your sending address. **Silent** donations settle on-chain too, but the receiving side is unlinkable to the campaign so they stay out of public donor lists and totals.',
  },
  {
    kind: 'optionGrid',
    heading: 'Donating privately',
    intro:
      "These steps matter most for **Public** donations, where every transaction is permanently tied to a single address. **Silent** donations already hide the receiving side, so the risk is lower. Targeted analysis of your sending wallet is still possible either way, so if your risk is high these steps are worth taking. Pick one, or stack them.",
    options: [
      {
        name: 'Use a silent-payments wallet',
        purpose:
          'Pay with a Bitcoin wallet that supports BIP-352. If the campaign accepts silent payments, your wallet uses that endpoint automatically.',
        chips: ['non-custodial', 'easiest', 'BIP-352'],
        href: 'https://ditto.pub',
      },
      {
        name: 'Buy non-KYC Bitcoin',
        purpose:
          "Buy Bitcoin peer-to-peer so it isn't linked to your government ID in the first place. Strongest privacy starting point.",
        chips: ['peer-to-peer', 'no ID'],
        href: 'https://bisq.network',
      },
      {
        name: 'Coinjoin first',
        purpose:
          "Mix your Bitcoin with other people's coins so the output can't be traced to your KYC purchase. Useful when the campaign only accepts public.",
        chips: ['non-custodial', 'breaks history'],
        href: 'https://wasabiwallet.io',
      },
      {
        name: 'Use a fresh wallet',
        purpose:
          'Donate from a wallet that has never touched your main identity or a KYC exchange.',
        chips: ['free', 'non-custodial', 'easiest'],
        href: 'https://sparrowwallet.com',
      },
    ],
  },
  {
    kind: 'callout',
    variant: 'danger',
    title: "Consumer apps can't make you anonymous",
    body: 'Cash App, Coinbase, Strike, Venmo, Kraken, Binance, and PayPal all verify your ID. No matter how you send the donation, every transaction stays tied to your real identity. Use a non-custodial wallet you control.',
  },
  {
    kind: 'prose',
    heading: 'A note on silent payments today',
    paragraphs: [
      "Silent payments are the most private way to receive Bitcoin on-chain, but the ecosystem is young. Most popular wallets can't send to a silent-payment endpoint yet, so when a wallet can't, the donation falls back to a regular Bitcoin transaction to the campaign's public address (if the campaign accepts both).",
      'For activists, silent-payment donations also arrive without push notifications and only appear after the activist scans their wallet, which can take minutes to hours. None of this affects the safety of your funds; it just shapes the experience.',
    ],
  },
];

const ACTIVIST_GUIDE_TEMPLATE: GuideBlock[] = [
  {
    kind: 'tldr',
    lede: "Pick what to accept when you create your campaign: Public, Silent, or both. Either option is non-custodial. {appName} never holds your funds.",
    nextActions: [
      'Compare the two options',
      'Plan how you will cash out',
      'Sweep funds promptly',
    ],
  },
  {
    kind: 'prose',
    heading: 'How receiving works',
    paragraphs: [
      "Your {appName} donation addresses are derived from your Nostr public key. When you create a campaign, you pick what to accept:",
      "**Public payments only.** A regular Bitcoin address. Visible to everyone, works with every wallet.",
      "**Silent payments only.** BIP-352 silent payments. The receiving side is unlinkable on-chain, so donations stay out of public donor lists and totals. Donors need a silent-payments-capable wallet to send. If they don't have one, their donation can't go through.",
      "**Both.** {appName} generates a single QR code that encodes both endpoints. Silent-payments wallets read it as private; ordinary wallets pay the public address. Donors don't have to choose.",
      'Accepting both is usually the right call: you get private donations from supporters who use a silent-payments wallet, and you stay open to donors whose only Bitcoin is in a consumer app.',
    ],
  },
  {
    kind: 'prose',
    heading: 'What everyone can see',
    paragraphs: [
      'If your campaign accepts public payments, anyone considering supporting you can look up the address and see the public donation history.',
      "Silent-payment donations aren't part of that record. They're invisible to outside observers and don't show in the campaign's public totals; new donors only see whatever you publish about the campaign's progress.",
    ],
  },
  {
    kind: 'paymentComparison',
    audience: 'activist',
    footnote:
      "You can't switch a campaign's accepted payment options after it's created. If you change your mind, make a new campaign.",
  },
  {
    kind: 'prose',
    heading: 'A note on silent payments today',
    paragraphs: [
      "Silent payments are the most private way to receive Bitcoin on-chain, but the ecosystem is young. Most popular wallets can't send to a silent-payment endpoint yet, so when a donor's wallet can't, the donation falls back to a regular Bitcoin transaction to your public address (if you accept both).",
      'Silent-payment donations also arrive without push notifications and only appear after you scan your wallet, which can take minutes to hours. None of this affects the safety of your funds; it just shapes the day-to-day experience.',
    ],
  },
  {
    kind: 'steps',
    heading: 'Move donations promptly',
    steps: [
      {
        title: 'Sweep to a wallet you control',
        body: 'Good self-custody options: [Sparrow](https://sparrowwallet.com), [BlueWallet](https://bluewallet.io), or [Phoenix](https://phoenix.acinq.co) (Lightning).',
      },
      {
        title: "Don't sit on funds at the campaign address",
        body: 'Treat it like a mailbox, not a savings account. This applies to both Public and Silent donations.',
      },
    ],
  },
  {
    kind: 'optionGrid',
    heading: 'Cashing out privately',
    intro:
      "Spending on-chain creates a trail unless you break it first. The simplest privacy exit is to **move funds into a silent-payments wallet first**, then spend onward; the hop breaks the link between your campaign address and what comes next. The other options below also work and have their own trade-offs.",
    options: [
      {
        name: 'Silent-payments wallet hop',
        purpose:
          "Move your donations to a silent-payments wallet ([Ditto Wallet](https://ditto.pub), [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk)). From there your downstream spending isn't tied to the campaign.",
        chips: ['non-custodial', 'easiest', 'low fees'],
        href: 'https://ditto.pub',
      },
      {
        name: 'Lightning swap',
        purpose:
          "Atomic-swap on-chain Bitcoin to Lightning. Lightning payments don't hit the public blockchain.",
        chips: ['non-custodial', 'easy', 'low fees'],
        href: 'https://boltz.exchange',
      },
      {
        name: 'Coinjoin',
        purpose:
          "Mix your Bitcoin with other users' coins so the output can't be linked back to the input.",
        chips: ['non-custodial', 'high privacy'],
        href: 'https://wasabiwallet.io',
      },
      {
        name: 'Peer-to-peer',
        purpose:
          'Trade Bitcoin for fiat directly with another person or through a broker on Bisq, HodlHodl, or RoboSats.',
        chips: ['cash', 'no KYC'],
        href: 'https://bisq.network',
      },
      {
        name: 'Spend it directly',
        purpose:
          'Buy gift cards (Amazon, Uber, groceries, travel) straight from Bitcoin without converting to cash first.',
        chips: ['skip cash-out', 'instant'],
        href: 'https://www.bitrefill.com/us/en/',
      },
    ],
  },
  {
    kind: 'callout',
    variant: 'danger',
    title: 'Avoid centralized tumblers',
    body: 'Custodial mixers can steal your coins, log who sent what, or turn out to be law-enforcement honeypots. Use a silent-payments hop or a non-custodial coinjoin instead.',
  },
];

/** Substitute placeholders in a single guide block. */
function substituteGuideBlock(block: GuideBlock, appName: string): GuideBlock {
  switch (block.kind) {
    case 'tldr':
      return {
        ...block,
        lede: substitute(block.lede, appName),
        nextActions: block.nextActions.map((a) => substitute(a, appName)),
      };
    case 'steps':
      return {
        ...block,
        heading: substitute(block.heading, appName),
        steps: block.steps.map((s) => ({
          title: substitute(s.title, appName),
          body: substitute(s.body, appName),
        })),
      };
    case 'paymentComparison':
      return {
        ...block,
        footnote: block.footnote ? substitute(block.footnote, appName) : undefined,
      };
    case 'callout':
      return {
        ...block,
        title: substitute(block.title, appName),
        body: substitute(block.body, appName),
      };
    case 'prose':
      return {
        ...block,
        heading: block.heading ? substitute(block.heading, appName) : undefined,
        paragraphs: block.paragraphs.map((p) => substitute(p, appName)),
      };
    case 'optionGrid':
      return {
        ...block,
        heading: substitute(block.heading, appName),
        intro: block.intro ? substitute(block.intro, appName) : undefined,
        options: block.options.map((o) => ({
          ...o,
          name: substitute(o.name, appName),
          purpose: substitute(o.purpose, appName),
          chips: o.chips.map((c) => substitute(c, appName)),
        })),
      };
  }
}

/** Donor guide blocks with `{appName}` resolved. */
export function getDonorGuideBlocks(appName: string): GuideBlock[] {
  return DONOR_GUIDE_TEMPLATE.map((b) => substituteGuideBlock(b, appName));
}

/** Activist guide blocks with `{appName}` resolved. */
export function getActivistGuideBlocks(appName: string): GuideBlock[] {
  return ACTIVIST_GUIDE_TEMPLATE.map((b) => substituteGuideBlock(b, appName));
}
