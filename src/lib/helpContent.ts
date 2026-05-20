/**
 * Structured FAQ content for the Help section.
 *
 * This module is the single source of truth for all Help/FAQ data.
 * Any page can call `getFAQCategories(appName)` or `getFAQItems(appName)` to
 * render a full FAQ or a filtered subset (e.g. only "payments" questions on
 * a wallet settings page).
 *
 * Author-visible strings containing the app name are stored with the
 * `{appName}` placeholder and substituted at read-time by the helpers.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FAQItem {
  /** Stable key used for accordion state and deep-linking. */
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

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Raw FAQ template content. Strings may contain the literal `{appName}`
 * placeholder, which is substituted at read-time by `getFAQCategories()`
 * and friends.
 */
const FAQ_TEMPLATE: FAQCategory[] = [
  // ── About Agora ─────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    label: 'About Agora',
    items: [
      {
        id: 'what-is-ditto',
        question: 'What is {appName}?',
        answer: [
          '{appName} is a platform for sending on-chain Bitcoin donations directly to activists. There\'s no middleman, no payment processor, and no account that can be frozen.',
          '{appName} is built on Nostr, so your identity isn\'t locked to this site \u2014 you own it.',
        ],
      },
      {
        id: 'what-is-nostr',
        question: 'What is Nostr?',
        answer: [
          'Nostr is an open network where **you** own your account, not a company. Your identity is a cryptographic key you control, not a username on someone else\'s server.',
          'On {appName}, that same key is also what your donation address is derived from \u2014 which is why you can receive Bitcoin without signing up with anyone.',
        ],
      },
      {
        id: 'why-login-different',
        question: 'Why is my sign-in so different and long?',
        answer: [
          'Instead of a username and password controlled by a company, Nostr uses a pair of cryptographic keys.',
          'Your "public key" (starts with **npub**) is your username. Your "secret key" (starts with **nsec**) is your password. The long string is what makes it virtually impossible to guess.',
        ],
      },
      {
        id: 'lose-secret-key',
        question: 'What happens if I lose my secret key?',
        answer: [
          '**There is no "forgot password" button.** Nobody can reset it for you. If you lose it, your account \u2014 and any Bitcoin sitting at your donation address \u2014 is gone forever.',
          '**Save your secret key somewhere safe right now.** For tips, read [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'manage-secret-key',
        question: 'Can I save my secret key in my phone\'s password manager?',
        answer: [
          'Yes. You can save it in your device\'s password manager (iCloud Keychain, 1Password, Bitwarden, etc.). On iPhone, saving it in Passwords lets you use Face ID or Touch ID to log in.',
          'For a full guide, see [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'cost-to-use',
        question: 'Does {appName} cost anything?',
        answer: [
          '**No.** {appName} takes no platform fee. When you donate, you pay only the Bitcoin network fee that goes to miners \u2014 not to us.',
        ],
      },
      {
        id: 'who-made-this',
        question: 'Who made {appName}?',
        answer: [
          '{appName} is built by [Soapbox](https://soapbox.pub), an open-source team building tools for the Nostr ecosystem.',
        ],
      },
    ],
  },

  // ── Bitcoin Donations on Agora ──────────────────────────────────────────
  // Merged section combining the practical "how it works" Q&A with the
  // "why we designed it this way" rationale. On-chain only — Lightning and
  // zap content is intentionally absent.
  {
    id: 'payments',
    label: 'Bitcoin Donations on Agora',
    items: [
      {
        id: 'what-is-agora',
        question: 'What is {appName} for?',
        answer: [
          '{appName} is a Nostr platform for sending on-chain Bitcoin donations directly to activists. No middleman, no payment processor, no account to freeze.',
        ],
      },
      {
        id: 'send-bitcoin-onchain',
        question: 'How does sending Bitcoin work?',
        answer: [
          'You send real Bitcoin on-chain directly to the activist. Your Nostr key is your wallet \u2014 no separate account, no top-up.',
          'You pay a small network fee to miners so the transaction gets confirmed. Once broadcast, it\'s public and irreversible.',
        ],
      },
      {
        id: 'connect-wallet',
        question: 'What is the wallet on {appName}?',
        answer: [
          'Your {appName} wallet is an on-chain Bitcoin address derived from your Nostr key. There\'s nothing to sign up for \u2014 it exists the moment you have an account.',
          'Donations sent to you arrive at that address. To spend them, see the **Activist Guide**.',
        ],
      },
      {
        id: 'donations-are-public-general',
        question: 'Are donations on {appName} public?',
        answer: [
          'Yes. Every donation \u2014 given or received \u2014 is recorded on the public Bitcoin blockchain and on Nostr. Anyone can see the amounts, the timing, and the addresses involved.',
          'Read the **Donor Guide** and **Activist Guide** for what this means in practice and how to protect your privacy if you need to.',
        ],
      },
      {
        id: 'censorship-resistance',
        question: 'What does "censorship-resistant" mean here?',
        answer: [
          'No company sits between a donor and an activist. {appName} doesn\'t hold the funds and can\'t freeze the address.',
          'As long as the Bitcoin network is running, donations can be sent and received. {appName} itself going offline wouldn\'t stop them.',
        ],
      },
      {
        id: 'why-onchain',
        question: 'Why on-chain Bitcoin?',
        answer: [
          'On-chain Bitcoin is the most widely supported and censorship-resistant payment rail in the world. Every Bitcoin wallet can send it.',
          'The tradeoff is that on-chain transactions are public and pay a miner fee. The Donor and Activist guides explain how to handle both.',
        ],
      },
      {
        id: 'why-not-lightning',
        question: 'Why doesn\'t {appName} use Lightning?',
        answer: [
          'Lightning requires a Lightning wallet. The easiest ones (like Wallet of Satoshi) are **custodial** \u2014 a company holds the funds and can be shut down or pressured. Non-custodial Lightning is technically demanding and unreliable for newcomers.',
          'We want {appName} to work for someone whose only Bitcoin experience is Cash App. On-chain Bitcoin works with every wallet on the planet.',
        ],
      },
      {
        id: 'why-not-silent-payments',
        question: 'Why doesn\'t {appName} use silent payments?',
        answer: [
          'Silent payments only work when the **sender\'s** wallet supports them. Most popular wallets \u2014 Cash App, Strike, and nearly every custodial wallet \u2014 do not.',
          'Asking donors to install new software is a barrier we won\'t put in front of activists who need support.',
        ],
      },
      {
        id: 'why-not-rotating-addresses',
        question: 'Why doesn\'t {appName} generate a new address for every donation?',
        answer: [
          'Generating a fresh address per donation would require {appName} to run a server that signs and serves addresses. That server becomes a single point of failure \u2014 someone could shut it down to silence activists.',
          '{appName} derives each user\'s donation address from their Nostr public key. No server is required, and the platform itself can\'t be turned off to censor anyone.',
        ],
      },
    ],
  },

  // ── Network & Safety ────────────────────────────────────────────────────
  {
    id: 'content-safety',
    label: 'Network & Safety',
    items: [
      {
        id: 'fyp',
        question: 'How does the feed work?',
        answer: [
          'Your feed shows campaigns and posts from people you follow. There\'s no algorithm deciding what you see.',
          'Use the Trends page or Follow Packs to discover more activists and campaigns.',
        ],
      },
      {
        id: 'what-are-relays',
        question: 'What are relays?',
        answer: [
          'Relays are the servers that store and deliver Nostr events \u2014 posts, donation receipts, profile info. Think of them like different mail carriers.',
          'The defaults work out of the box. Using multiple relays means your content is backed up in more places, making it harder for anyone to silence you. To dive deeper, read [Understanding Nostr Relays](https://nostr.how/en/relays).',
        ],
      },
      {
        id: 'what-are-blossom',
        question: 'What are Blossom servers?',
        answer: [
          'Blossom servers store media files (campaign images, profile pictures) when you upload them. You can manage which servers you use in Settings > Network.',
        ],
      },
      {
        id: 'report-content',
        question: 'How do I report harmful content?',
        answer: [
          'Tap the three-dot menu (**...**) on any post and select "Report." You can mute or block users from the same menu.',
        ],
      },
      {
        id: 'vs-mastodon-bluesky',
        question: 'How is Nostr different from Mastodon or Bluesky?',
        answer: [
          'On Mastodon, your account lives on a specific server \u2014 if it shuts down or bans you, you start over. On Bluesky, most accounts depend on one company.',
          'On Nostr, your identity is a key you control. No server can lock you out, and your donation address goes with you to any Nostr app.',
        ],
      },
      {
        id: 'profile-fields',
        question: 'What are profile fields?',
        answer: [
          'Profile fields let you add extra info to your profile \u2014 links, wallet addresses, music, photos, videos. Useful for activists who want to share context about their work.',
        ],
      },
    ],
  },

  // ── Hidden legacy items ─────────────────────────────────────────────────
  // Kept so existing HelpTip call sites on other pages don't break, but
  // excluded from the visible FAQ. {appName} is on-chain only; Lightning
  // and zaps are not part of the public help content.
  {
    id: 'legacy-lightning',
    label: 'Legacy',
    hidden: true,
    items: [
      {
        id: 'send-bitcoin-lightning',
        question: 'How does sending Bitcoin over Lightning work?',
        answer: [
          'If a recipient has a Lightning address on their profile, you can send to that. Lightning settles in seconds and fees are tiny.',
          'Lightning sends don\'t use {appName}\'s donation address \u2014 they go straight to whatever Lightning wallet the recipient set up themselves. {appName}\'s own donation flow is on-chain only.',
        ],
      },
      {
        id: 'what-are-zaps',
        question: 'What are zaps?',
        answer: [
          'Zaps are small Lightning tips on Nostr, separate from {appName}\'s on-chain donation flow.',
        ],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Replace all occurrences of `{appName}` in a string with the resolved value. */
function substitute(str: string, appName: string): string {
  return str.replaceAll('{appName}', appName);
}

/** Substitute placeholders in a single FAQ item. */
function substituteItem(item: FAQItem, appName: string): FAQItem {
  return {
    ...item,
    question: substitute(item.question, appName),
    answer: item.answer.map((p) => substitute(p, appName)),
  };
}

/** Substitute placeholders in a single category (questions + answers). */
function substituteCategory(cat: FAQCategory, appName: string): FAQCategory {
  return {
    ...cat,
    label: substitute(cat.label, appName),
    description: cat.description ? substitute(cat.description, appName) : undefined,
    items: cat.items.map((i) => substituteItem(i, appName)),
  };
}

/**
 * Return the full list of FAQ categories with `{appName}` placeholders
 * resolved to the given `appName`.
 */
export function getFAQCategories(appName: string): FAQCategory[] {
  return FAQ_TEMPLATE.map((c) => substituteCategory(c, appName));
}

/** Flat list of every FAQ item, optionally filtered by category ID. */
export function getFAQItems(appName: string, categoryId?: string): FAQItem[] {
  const cats = categoryId
    ? FAQ_TEMPLATE.filter((c) => c.id === categoryId)
    : FAQ_TEMPLATE;
  return cats.flatMap((c) => c.items).map((i) => substituteItem(i, appName));
}

/** Look up a single FAQ item by its ID across all categories. */
export function getFAQItem(appName: string, itemId: string): FAQItem | undefined {
  for (const cat of FAQ_TEMPLATE) {
    const found = cat.items.find((i) => i.id === itemId);
    if (found) return substituteItem(found, appName);
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
 * A single section inside a long-form guide page (Donor Guide / Activist
 * Guide). Each section renders as a Card on the guide page.
 *
 * `paragraphs` accept the same inline markup as FAQ answers (**bold** and
 * [link](url)), rendered by `renderInlineMarkup` from `@/lib/helpMarkup`.
 *
 * `pros` / `cons` are optional and render as a bullet pair underneath the
 * paragraphs. They are used for tradeoff-heavy topics like cash-out methods.
 */
export interface GuideSection {
  /** Stable key, used for React keys and potential deep-linking. */
  id: string;
  /** Section heading. */
  heading: string;
  /** Body paragraphs, in order. */
  paragraphs: string[];
  /** Optional positives, rendered as a green-flavored bullet list. */
  pros?: string[];
  /** Optional negatives / caveats, rendered as an amber-flavored bullet list. */
  cons?: string[];
}

const DONOR_GUIDE_TEMPLATE: GuideSection[] = [
  {
    id: 'how-donating-works',
    heading: 'How donating works',
    paragraphs: [
      'You send real Bitcoin on-chain directly to the activist. {appName} doesn\'t hold or route the money \u2014 the address you\'re paying is derived from the activist\'s Nostr key, so there\'s no middleman in between.',
      'You pay a small network fee to Bitcoin miners. Once the transaction is broadcast, it\'s public and irreversible.',
    ],
  },
  {
    id: 'why-public',
    heading: 'Why your donation is public',
    paragraphs: [
      'Bitcoin is a public ledger. Anyone can look up an activist\'s address and see every donation \u2014 the amount, the time, and the address it came from.',
      'Your sending address can usually be traced back to wherever you bought the Bitcoin (Cash App, Coinbase, Strike, etc.). That link is what ties a donation to your real identity.',
    ],
  },
  {
    id: 'privacy-non-kyc',
    heading: 'For privacy: use non-KYC Bitcoin',
    paragraphs: [
      'Buy Bitcoin peer-to-peer so it isn\'t linked to your government ID. Marketplaces like [Bisq](https://bisq.network), [RoboSats](https://learn.robosats.com), and [HodlHodl](https://hodlhodl.com) let you trade directly with another person.',
    ],
    pros: ['No exchange knows who you are.', 'Strongest privacy starting point.'],
    cons: ['Slower and harder than Cash App.', 'Requires finding a counterparty.'],
  },
  {
    id: 'privacy-coinjoin',
    heading: 'For privacy: coinjoin before donating',
    paragraphs: [
      'A coinjoin mixes your Bitcoin with other people\'s coins so the output can\'t be linked back to the input. Wallets like [Wasabi](https://wasabiwallet.io), [Sparrow](https://sparrowwallet.com), and [JoinMarket](https://github.com/JoinMarket-Org/joinmarket-clientserver) support this.',
    ],
    pros: ['Breaks the on-chain trail from your KYC purchase.', 'Non-custodial \u2014 you keep your keys.'],
    cons: ['Costs fees and takes time.', 'Fewer maintained tools after the Samourai shutdown.'],
  },
  {
    id: 'fresh-wallet',
    heading: 'Use a fresh wallet',
    paragraphs: [
      'Donate from a wallet that has never touched a KYC exchange or your main identity. Even one shared transaction input can link the wallet back to you.',
      'Free options include [Sparrow](https://sparrowwallet.com) on desktop and [BlueWallet](https://bluewallet.io) on mobile.',
    ],
  },
  {
    id: 'vary-amounts',
    heading: 'Vary amounts and timing',
    paragraphs: [
      'Round numbers ($50, $100) and recurring donations create a pattern that\'s easy to fingerprint. Send unusual amounts at irregular times if you want to be harder to track.',
    ],
  },
  {
    id: 'what-cash-app-cant-do',
    heading: 'What Cash App and similar apps can\'t do',
    paragraphs: [
      'Cash App, Strike, and most custodial wallets are convenient but tied to your real identity. They can\'t make a donation truly anonymous, no matter how you send it.',
      'If anonymity matters to you, use a non-custodial wallet you control.',
    ],
  },
];

const ACTIVIST_GUIDE_TEMPLATE: GuideSection[] = [
  {
    id: 'how-receiving-works',
    heading: 'How receiving works',
    paragraphs: [
      'Your {appName} donation address is derived from your Nostr public key. Donors send on-chain Bitcoin directly to it. No one stands between you and the funds, and no server can be shut down to stop the donations.',
    ],
  },
  {
    id: 'why-public',
    heading: 'Why incoming donations are public',
    paragraphs: [
      'Bitcoin is a public ledger. Anyone can look up your address and see every donation \u2014 the amount, the time, and the sending address. Your supporters\' addresses are visible too.',
    ],
  },
  {
    id: 'dont-keep-funds',
    heading: 'Don\'t keep funds at your {appName} address',
    paragraphs: [
      'Move funds to a wallet you control as soon as practical. Treat your {appName} address like a mailbox, not a savings account.',
      'Good self-custody wallets to move funds into: [Sparrow](https://sparrowwallet.com), [BlueWallet](https://bluewallet.io), or [Phoenix](https://phoenix.acinq.co) (Lightning).',
    ],
  },
  {
    id: 'cashout-overview',
    heading: 'Cashing out privately \u2014 overview',
    paragraphs: [
      'To spend donations without revealing who you are, you have to break the on-chain trail before converting to cash. The next sections cover the main paths. Each has tradeoffs in custody, privacy, difficulty, and fees.',
    ],
  },
  {
    id: 'cashout-lightning-swap',
    heading: 'Lightning swap (Boltz, Bolt.exchange)',
    paragraphs: [
      'Services like [Boltz](https://boltz.exchange) atomic-swap your on-chain Bitcoin into Lightning. Lightning payments are private by default \u2014 they don\'t appear on the public blockchain.',
    ],
    pros: ['Instant and non-custodial.', 'Lightning payments aren\'t publicly traceable.'],
    cons: ['Per-swap limits and swap fees.', 'Depends on the swap service being online.'],
  },
  {
    id: 'cashout-coinjoin',
    heading: 'Coinjoin',
    paragraphs: [
      'A coinjoin mixes your Bitcoin with other users\' coins so the output can\'t be linked to the input. [Wasabi](https://wasabiwallet.io) and [JoinMarket](https://github.com/JoinMarket-Org/joinmarket-clientserver) are the main maintained options after the Samourai shutdown.',
    ],
    pros: ['Strong on-chain unlinkability.', 'Non-custodial.'],
    cons: ['Fees and wait time.', 'Steeper learning curve than a swap.'],
  },
  {
    id: 'cashout-p2p',
    heading: 'Peer-to-peer exchange',
    paragraphs: [
      'Trade Bitcoin for fiat directly with another person on [Bisq](https://bisq.network), [RoboSats](https://learn.robosats.com), or [HodlHodl](https://hodlhodl.com). No exchange records your identity.',
    ],
    pros: ['Cash in hand without KYC.', 'No central exchange knows you.'],
    cons: ['Slower than an exchange.', 'Requires a willing counterparty.', 'Some learning curve.'],
  },
  {
    id: 'cashout-tumblers',
    heading: 'Tumblers and centralized mixers',
    paragraphs: [
      '**Generally not recommended.** Centralized tumblers are custodial \u2014 you have to trust the operator not to steal your coins or log who sent what. Many are scams or law-enforcement honeypots.',
      'Coinjoin is the non-custodial alternative and is almost always the better choice.',
    ],
  },
  {
    id: 'cashout-comparison',
    heading: 'Quick comparison',
    paragraphs: [
      '**Lightning swap (Boltz):** non-custodial \u00b7 medium privacy \u00b7 easy \u00b7 low fees.',
      '**Coinjoin (Wasabi, JoinMarket):** non-custodial \u00b7 high privacy \u00b7 medium difficulty \u00b7 medium fees.',
      '**Peer-to-peer (Bisq, RoboSats):** non-custodial \u00b7 high privacy \u00b7 harder \u00b7 variable fees.',
      '**Tumblers:** custodial \u00b7 unpredictable privacy \u00b7 easy \u00b7 high risk. **Avoid.**',
    ],
  },
  {
    id: 'donors-can-be-seen',
    heading: 'Your donation history is visible to future supporters',
    paragraphs: [
      'Anyone considering supporting you can look up your address and see the full donation history. Keep in mind how that history reads to a new donor.',
    ],
  },
];

/** Substitute placeholders in a single guide section. */
function substituteGuideSection(section: GuideSection, appName: string): GuideSection {
  return {
    ...section,
    heading: substitute(section.heading, appName),
    paragraphs: section.paragraphs.map((p) => substitute(p, appName)),
    pros: section.pros?.map((p) => substitute(p, appName)),
    cons: section.cons?.map((c) => substitute(c, appName)),
  };
}

/** Donor guide sections with `{appName}` resolved. */
export function getDonorGuideSections(appName: string): GuideSection[] {
  return DONOR_GUIDE_TEMPLATE.map((s) => substituteGuideSection(s, appName));
}

/** Activist guide sections with `{appName}` resolved. */
export function getActivistGuideSections(appName: string): GuideSection[] {
  return ACTIVIST_GUIDE_TEMPLATE.map((s) => substituteGuideSection(s, appName));
}
