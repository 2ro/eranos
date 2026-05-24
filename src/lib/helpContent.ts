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
          '{appName} is a platform for sending Bitcoin donations \u2014 public or private \u2014 directly to activists. There\'s no middleman, no payment processor, and no account that can be frozen.',
          '{appName} is built on Nostr, so your identity isn\'t locked to this site \u2014 you own it.',
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
          '{appName} is built by [Soapbox](https://soapbox.pub), an open-source team building tools for the Nostr ecosystem, in collaboration with the [World Liberty Congress](https://worldlibertycongress.org/).',
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
        id: 'send-bitcoin-onchain',
        question: 'How does sending Bitcoin work?',
        answer: [
          'When an activist creates a campaign, they choose what kinds of payments to accept: **public**, **private**, or **both**.',
          '**Public** donations are real Bitcoin on-chain. They settle on the public blockchain, work in every Bitcoin wallet, and are visible to anyone.',
          '**Private** donations use **silent payments** (BIP-352). They settle on-chain too, but the transaction can\'t be linked back to the activist\'s donation code \u2014 so they stay out of public donor lists and totals. The donor needs a wallet that supports silent payments \u2014 we recommend [Ditto Wallet](https://ditto.pub) or [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk).',
          'When a campaign accepts **both**, {appName} shows a single QR code that encodes both endpoints. Silent-payment wallets read it as private; other wallets fall back to the public address. Donors don\'t have to choose \u2014 their wallet picks the right path automatically.',
          'Either way, the payment goes straight to the activist. {appName} never touches the funds.',
        ],
      },
      {
        id: 'connect-wallet',
        question: 'What is the wallet on {appName}?',
        answer: [
          'Your {appName} wallet is built from your Nostr key. It can receive Bitcoin both ways \u2014 as a public address that any Bitcoin wallet can pay, and as a silent-payments code that capable wallets can pay privately. There\'s nothing to sign up for; it exists the moment you have an account.',
          'When you create a campaign, you pick whether to accept public payments, private payments, or both. To spend what you receive, see the **Activist Guide**.',
        ],
      },
      {
        id: 'donations-are-public-general',
        question: 'Are donations on {appName} public?',
        answer: [
          'It depends on which kind of payment the activist accepts.',
          '**Public donations** are recorded on the Bitcoin blockchain and on Nostr. Anyone can see the amounts, timing, and addresses.',
          '**Private donations** use silent payments. They\'re not publicly linkable to the activist\'s donation code, don\'t appear in donor lists, and don\'t count toward public totals.',
          'When a campaign accepts both, the donor\'s wallet decides which path to use \u2014 silent-payment-capable wallets pay privately, others pay the public address. Read the **Donor Guide** and **Activist Guide** for the full picture.',
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
        question: 'Why Bitcoin?',
        answer: [
          'Bitcoin is the most widely supported and censorship-resistant payment rail in the world. Every Bitcoin wallet can send it.',
          'On {appName}, activists choose how to receive: **public** (a regular Bitcoin address) for maximum reach, **private** (silent payments) for unlinkable donations, or **both** so each donor\'s wallet picks the right path automatically. Donors who only have a consumer Bitcoin app can still contribute; donors with a silent-payments wallet get privacy by default.',
          'The tradeoff is that public Bitcoin transactions are visible on the blockchain and pay a miner fee. The Donor and Activist guides explain how to handle both.',
        ],
      },
      {
        id: 'why-not-silent-payments',
        question: 'Does {appName} support silent payments?',
        answer: [
          'Yes. When an activist creates a campaign they can accept silent payments alongside, or instead of, public Bitcoin payments. Silent-payment donations still settle on-chain, but the transaction can\'t be linked back to the activist\'s donation code \u2014 so they don\'t appear in public donor lists or totals.',
          'Sending a silent payment requires a wallet that supports BIP-352. Most consumer apps don\'t yet, but [Ditto Wallet](https://ditto.pub) and [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk) do.',
          'When a campaign accepts both kinds of payment, {appName} encodes them in a single QR code. Silent-payment-capable wallets pay privately; everyone else pays the public address. No donor is shut out, and no activist is forced to choose between reach and privacy.',
        ],
      },
      {
        id: 'why-not-lightning',
        question: 'Why doesn\'t {appName} use Lightning?',
        answer: [
          'Lightning requires a Lightning wallet. The easiest ones (Wallet of Satoshi, Strike, Breez) are **custodial** \u2014 a company holds the funds and can be shut down, geo-blocked, or pressured into freezing accounts. Non-custodial Lightning is technically demanding and unreliable for newcomers.',
          'We want {appName} to work for someone whose only Bitcoin experience is a regular consumer app like Cash App, Coinbase, Strike, Venmo, or PayPal. On-chain Bitcoin works with every wallet on the planet.',
        ],
      },
      {
        id: 'why-not-rotating-addresses',
        question: 'Why doesn\'t {appName} generate a new address for every donation?',
        answer: [
          'Doing this would require {appName} to act as a money-exchanging middleman \u2014 taking custody of the Bitcoin first and then forwarding it on to the activist.',
          'That would make us a money transmitter, subject to the regulations that come with that, and a single point of failure: shut down {appName}\'s server and you\'ve shut down every donation flowing through it.',
          'Instead, each user\'s donation address is derived from their Nostr public key. Donors send directly to the activist, {appName} never touches the funds, and the platform itself can\'t be turned off to censor anyone. Activists who want per-donation privacy can accept silent payments, which give the same unlinkability without anyone holding the money in the middle.',
        ],
      },
      {
        id: 'why-not-other-crypto',
        question: 'Why not Monero or another cryptocurrency?',
        answer: [
          'Bitcoin is by far the most widely adopted cryptocurrency. That means it\'s the easiest for donors to buy and send, and the easiest for activists to receive, hold, and spend.',
          'Privacy-focused coins like Monero offer different privacy tradeoffs than Bitcoin, but they\'re unsupported by most consumer apps and harder to convert back to local currency. Asking either side of a donation to first acquire a niche cryptocurrency is a barrier {appName} won\'t put in the way. For Bitcoin donations themselves, silent payments cover the unlinkability use case without leaving the Bitcoin ecosystem.',
        ],
      },
    ],
  },

  // ── About Nostr ─────────────────────────────────────────────────────────
  // Protocol-level questions: what Nostr is, how the npub/nsec key pair
  // works, and what to do with your secret key. Placed after the payments
  // section so newcomers see "what is Agora / why Bitcoin" first, and only
  // dig into Nostr's identity model once they care.
  {
    id: 'about-nostr',
    label: 'About Nostr',
    items: [
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
    ],
  },

  // ── Hidden legacy items ─────────────────────────────────────────────────
  // Kept so existing HelpTip call sites on other pages don't break, but
  // excluded from the visible FAQ. {appName}'s donation flow is Bitcoin
  // only (public or private via silent payments); Lightning, zaps, and the
  // network/safety topics aren't part of the public help content right now.
  {
    id: 'legacy',
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
      {
        id: 'fyp',
        question: 'How does the feed work?',
        answer: [
          'Your feed shows campaigns and posts from people you follow. There\'s no algorithm deciding what you see.',
        ],
      },
      {
        id: 'what-are-relays',
        question: 'What are relays?',
        answer: [
          'Relays are the servers that store and deliver Nostr events \u2014 posts, donation receipts, profile info. The defaults work out of the box; you can add or remove relays in Settings > Network.',
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
          'On Mastodon, your account lives on a specific server. On Bluesky, most accounts depend on one company. On Nostr, your identity is a key you control, and your donation address goes with you to any Nostr app.',
        ],
      },
      {
        id: 'profile-fields',
        question: 'What are profile fields?',
        answer: [
          'Profile fields let you add extra info to your profile \u2014 links, wallet addresses, music, photos, videos.',
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
 * The Donor Guide and Activist Guide pages are composed from a typed
 * sequence of {@link GuideBlock}s. Each block kind is rendered by a
 * dedicated component from `@/components/guide/`. The page just
 * dispatches on `block.kind`.
 *
 * String fields may contain the same inline markup as FAQ answers
 * (`**bold**` and `[link](url)`), and the `{appName}` placeholder. Both
 * are resolved at read-time by the `getDonorGuideBlocks` /
 * `getActivistGuideBlocks` helpers below.
 */

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
