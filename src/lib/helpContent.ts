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
        id: 'why-not-lightning',
        question: 'Why doesn\'t {appName} use Lightning?',
        answer: [
          'Lightning requires a Lightning wallet. The easiest ones (Wallet of Satoshi, Strike, Breez) are **custodial** \u2014 a company holds the funds and can be shut down, geo-blocked, or pressured into freezing accounts. Non-custodial Lightning is technically demanding and unreliable for newcomers.',
          'We want {appName} to work for someone whose only Bitcoin experience is a regular consumer app like Cash App, Coinbase, Strike, Venmo, or PayPal. On-chain Bitcoin works with every wallet on the planet.',
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
      'When an activist creates a campaign, they choose what kinds of payments to accept: **public** (a regular Bitcoin address), **private** (silent payments), or **both**. The campaign\'s donate page shows a QR code that matches that choice.',
      'When a campaign accepts **both**, the QR code encodes both endpoints. Silent-payment-capable wallets read it as a private payment; ordinary Bitcoin wallets read it as a normal payment to the public address. You don\'t have to choose \u2014 your wallet picks the right path automatically.',
      'Either way, the money goes directly to the activist. {appName} doesn\'t hold or route it, and the address is derived from the activist\'s Nostr key so there\'s no middleman in between.',
    ],
  },
  {
    id: 'why-public',
    heading: 'When your donation is public',
    paragraphs: [
      'Public Bitcoin donations are recorded on the public ledger. Anyone can look up an activist\'s address and see every public donation \u2014 the amount, the time, and the address it came from.',
      'Your sending address can usually be traced back to wherever you bought the Bitcoin \u2014 a KYC consumer app like Cash App, Coinbase, Strike, Venmo, PayPal, Kraken, or Binance ties every transaction to your real identity. That link is what connects a public donation to who you are.',
      '**Silent-payment donations are different.** They settle on-chain like any Bitcoin transaction, but the output can\'t be linked back to the activist\'s donation code. They don\'t appear in donor lists and don\'t count toward public totals. If the campaign accepts silent payments and your wallet supports them, your donation isn\'t visible to outside observers.',
    ],
  },
  {
    id: 'privacy-silent-payments',
    heading: 'For privacy: use a silent-payments wallet',
    paragraphs: [
      'The easiest way to donate privately is to use a Bitcoin wallet that supports **silent payments** (BIP-352). When you scan a campaign\'s QR code, your wallet will use the silent-payment rail automatically if the campaign accepts it.',
      'Two options:',
      '\u2022 [Ditto Wallet](https://ditto.pub) \u2014 a Nostr-native Bitcoin wallet that supports silent payments.',
      '\u2022 [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk) \u2014 a dedicated silent-payments wallet for Android.',
      'One caveat: silent payments hide the donation itself, but not where the sats in your wallet came from. If you funded the wallet from a KYC exchange, the funding transaction is still traceable to you. For stronger privacy, fund the wallet with non-KYC Bitcoin (see below).',
    ],
    pros: ['Simplest privacy path \u2014 no coinjoin, no peer-to-peer trade.', 'Non-custodial \u2014 you keep your keys.', 'Donation never appears in public donor lists or totals.'],
    cons: ['Only works if the campaign accepts silent payments (most do).', 'Funding the wallet from a KYC exchange still leaks the funding step.'],
  },
  {
    id: 'privacy-non-kyc',
    heading: 'For stronger privacy: source non-KYC Bitcoin',
    paragraphs: [
      'To remove the funding-step link entirely, buy Bitcoin peer-to-peer so it isn\'t tied to your government ID. [Bisq](https://bisq.network) and [HodlHodl](https://hodlhodl.com) let you trade on-chain Bitcoin directly with another person. [RoboSats](https://learn.robosats.com) is Lightning-only, so you\'d swap to Lightning with [Boltz](https://boltz.exchange) and then receive on RoboSats.',
      'Move those sats into a silent-payments wallet (Ditto Wallet or Dana) and you have both halves of the privacy story: no KYC link on the way in, and no public trace on the way out.',
    ],
    pros: ['No exchange knows who you are.', 'Combined with silent payments, this is the strongest privacy setup.'],
    cons: ['Slower and harder than a consumer app.', 'Requires finding a counterparty.'],
  },
  {
    id: 'privacy-coinjoin',
    heading: 'If you can\'t switch wallets: coinjoin first',
    paragraphs: [
      'If you\'re stuck using an ordinary Bitcoin wallet (no silent-payments support) and the campaign only accepts public payments, a coinjoin mixes your Bitcoin with other people\'s coins so the output can\'t be linked back to the input. Wallets like [Wasabi](https://wasabiwallet.io), [Sparrow](https://sparrowwallet.com), and [JoinMarket](https://github.com/JoinMarket-Org/joinmarket-clientserver) support this.',
    ],
    pros: ['Breaks the on-chain trail from your KYC purchase.', 'Non-custodial.'],
    cons: ['Costs fees and takes time.', 'Fewer maintained tools after the Samourai shutdown.', 'Silent payments are usually easier if the campaign accepts them.'],
  },
  {
    id: 'donor-comparison',
    heading: 'Quick comparison',
    paragraphs: [
      '**Silent-payments wallet (Ditto Wallet, Dana):** non-custodial \u00b7 high privacy \u00b7 easy \u00b7 low fees. Best default if the campaign accepts private payments.',
      '**Non-KYC source + silent payments:** non-custodial \u00b7 strongest privacy \u00b7 harder \u00b7 variable fees.',
      '**Coinjoin + public donation:** non-custodial \u00b7 high privacy \u00b7 medium difficulty \u00b7 medium fees. Useful when only public payments are accepted.',
      '**Consumer app (Cash App, Coinbase, Strike, Venmo, PayPal):** custodial \u00b7 no privacy \u00b7 easiest \u00b7 ties the donation to your real identity. Convenient, but never anonymous.',
    ],
  },
];

const ACTIVIST_GUIDE_TEMPLATE: GuideSection[] = [
  {
    id: 'how-receiving-works',
    heading: 'How receiving works',
    paragraphs: [
      'Your {appName} donation addresses are derived from your Nostr public key. When you create a campaign, you pick what kinds of payments to accept:',
      '\u2022 **Public payments only** \u2014 a regular Bitcoin address. Visible to everyone, works with every wallet.',
      '\u2022 **Private payments only** \u2014 silent payments (BIP-352). Settles on-chain but unlinkable to your donation code, so it stays out of public donor lists and totals. Donors need a silent-payment-capable wallet to send.',
      '\u2022 **Both** \u2014 {appName} generates a single QR code that encodes both endpoints. Silent-payment wallets read it as private; ordinary wallets pay the public address. Donors don\'t have to choose.',
      'Accepting both is usually the right call: you get private donations from supporters who use a silent-payments wallet, and you stay open to donors whose only Bitcoin is in a consumer app. No one stands between you and the funds either way, and no server can be shut down to stop them.',
    ],
  },
  {
    id: 'why-public',
    heading: 'What\'s visible and what isn\'t',
    paragraphs: [
      '**Public donations** are recorded on the Bitcoin blockchain. Anyone can look up your address and see every public donation \u2014 the amount, the time, and the sending address. Your supporters\' addresses are visible too. These donations show up in your campaign\'s donor list and progress totals.',
      '**Private donations** use silent payments. They settle on-chain like any Bitcoin transaction, but the output can\'t be linked back to your donation code. By design they don\'t appear in donor lists and don\'t count toward public totals \u2014 only you can see them, by scanning with the wallet that holds the key.',
    ],
  },
  {
    id: 'dont-keep-funds',
    heading: 'Don\'t keep funds at your {appName} address',
    paragraphs: [
      'Move funds to a wallet you control as soon as practical. Treat your {appName} address like a mailbox, not a savings account.',
      'For public donations: [Sparrow](https://sparrowwallet.com), [BlueWallet](https://bluewallet.io), or [Phoenix](https://phoenix.acinq.co) (Lightning) are good self-custody options.',
      'For private (silent-payment) donations: a silent-payments wallet like [Ditto Wallet](https://ditto.pub) or [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk) can scan for and hold them. {appName} itself supports scanning, but moving funds onward to a dedicated wallet is still recommended.',
    ],
  },
  {
    id: 'cashout-overview',
    heading: 'Cashing out privately \u2014 overview',
    paragraphs: [
      'The simplest privacy exit is to **move your donations into a silent-payments wallet first**, and then spend onward from there. The hop into the silent-payments wallet breaks the link between your public campaign address and what comes next \u2014 once the funds are sitting in that wallet, you can send them to any Bitcoin address with a fresh chain-analysis trail.',
      'The other approaches below (Lightning swap, coinjoin, peer-to-peer exchange) still work and have their own tradeoffs. Tumblers are usually a bad idea.',
    ],
  },
  {
    id: 'cashout-silent-payments',
    heading: 'Cash out to a silent-payments wallet',
    paragraphs: [
      'Move your public donations into a wallet that can receive via silent payments \u2014 [Ditto Wallet](https://ditto.pub) or [Dana](https://github.com/cygnet3/dana/releases/download/v0.7.4/app-live-release.apk). Both generate a silent-payment receiving code; send your funds to that code from your {appName} address.',
      'Once the money lands in the silent-payments wallet, the link between your public campaign address and your downstream spending is broken \u2014 the receiving transaction settles on-chain but isn\'t connected to the silent-payments wallet\'s reusable code. From there you can spend to any Bitcoin address and the chain-analysis trail starts fresh.',
      'If your campaign was set to accept silent payments to begin with, the private donations are already going straight to whatever silent-payments wallet you scan them in \u2014 there\'s nothing extra to do.',
    ],
    pros: ['Simplest privacy exit \u2014 no swap services, no peer-to-peer trade.', 'Non-custodial \u2014 you keep your keys throughout.', 'Low fees: just standard on-chain miner fees for the move.'],
    cons: ['Silent-payments ecosystem is young; fewer wallet options.', 'You need to fund the silent-payments wallet from your {appName} address, which is itself an on-chain transaction.'],
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
    cons: ['Fees and wait time.', 'Steeper learning curve than the silent-payments hop.'],
  },
  {
    id: 'cashout-p2p',
    heading: 'Peer-to-peer exchange',
    paragraphs: [
      'Trade Bitcoin for fiat directly with another person. [Bisq](https://bisq.network) and [HodlHodl](https://hodlhodl.com) trade on-chain Bitcoin. [RoboSats](https://learn.robosats.com) is Lightning-only \u2014 swap your on-chain Bitcoin to Lightning first with [Boltz](https://boltz.exchange), then sell on RoboSats. No exchange records your identity either way.',
    ],
    pros: ['Cash in hand without KYC.', 'No central exchange knows you.'],
    cons: ['Slower than an exchange.', 'Requires a willing counterparty.', 'Some learning curve.'],
  },
  {
    id: 'cashout-tumblers',
    heading: 'Tumblers and centralized mixers',
    paragraphs: [
      '**Generally not recommended.** Centralized tumblers are custodial \u2014 you have to trust the operator not to steal your coins or log who sent what. Many are scams or law-enforcement honeypots.',
      'Silent payments and coinjoin are the non-custodial alternatives, and either is almost always the better choice.',
    ],
  },
  {
    id: 'cashout-comparison',
    heading: 'Quick comparison',
    paragraphs: [
      '**Silent-payments wallet (Ditto Wallet, Dana):** non-custodial \u00b7 high privacy \u00b7 easy \u00b7 low fees. Recommended default.',
      '**Lightning swap (Boltz):** non-custodial \u00b7 medium privacy \u00b7 easy \u00b7 low fees.',
      '**Coinjoin (Wasabi, JoinMarket):** non-custodial \u00b7 high privacy \u00b7 medium difficulty \u00b7 medium fees.',
      '**Peer-to-peer (Bisq, HodlHodl, RoboSats via Boltz):** non-custodial \u00b7 high privacy \u00b7 harder \u00b7 variable fees.',
      '**Tumblers:** custodial \u00b7 unpredictable privacy \u00b7 easy \u00b7 high risk. **Avoid.**',
    ],
  },
  {
    id: 'donors-can-be-seen',
    heading: 'Your public donation history is visible to future supporters',
    paragraphs: [
      'If your campaign accepts public payments, anyone considering supporting you can look up your address and see the full public donation history. Keep in mind how that history reads to a new donor.',
      'Silent-payment donations aren\'t part of this \u2014 they\'re invisible to outside observers and don\'t show in your campaign\'s public totals.',
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
