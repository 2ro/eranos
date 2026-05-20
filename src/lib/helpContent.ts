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
}

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Raw FAQ template content. Strings may contain the literal `{appName}`
 * placeholder, which is substituted at read-time by `getFAQCategories()`
 * and friends.
 */
const FAQ_TEMPLATE: FAQCategory[] = [
  // ── Getting Started ─────────────────────────────────────────────────────
  {
    id: 'getting-started',
    label: 'Getting Started',
    items: [
      {
        id: 'what-is-ditto',
        question: 'What is {appName}?',
        answer: [
          '{appName} is a social media platform built on Nostr \u2014 a new kind of open, decentralized network. Think of {appName} as the app you\'re using right now to connect with people, post, and discover content.',
          'Because {appName} is built on Nostr, your account isn\'t locked to this site. You own your identity and can take it to any other Nostr app.',
        ],
      },
      {
        id: 'what-is-nostr',
        question: 'What is Nostr?',
        answer: [
          'Nostr is a new kind of social network where **you** own your account, not a company. Think of it like email \u2014 you can use different apps, but your identity stays the same. Nobody can ban you from the entire network.',
          'Everything you post, every person you follow, and your entire identity is portable. You can take it with you anywhere. To learn more, check out [Nostr 101](https://soapbox.pub/blog/nostr101).',
        ],
      },
      {
        id: 'login-other-apps',
        question: 'Can I log into other Nostr apps with my {appName} account?',
        answer: [
          'Yes! Your {appName} account **is** a Nostr account. You can use the same keys to log into any Nostr app \u2014 Primal, Damus, Amethyst, Coracle, and many more. Your posts, followers, and profile carry over everywhere.',
          'Explore the full range of Nostr apps at [nostrapps.com](https://nostrapps.com/).',
        ],
      },
      {
        id: 'why-login-different',
        question: 'Why is my sign-in so different and long?',
        answer: [
          'Instead of a username and password controlled by a company, Nostr uses a pair of cryptographic keys \u2014 like a really secure digital ID.',
          'Your "public key" (starts with **npub**) is your username that everyone can see. Your "secret key" (starts with **nsec**) is your password. The long string of characters is what makes it virtually impossible to hack.',
        ],
      },
      {
        id: 'lose-secret-key',
        question: 'What happens if I lose my secret key?',
        answer: [
          '**There is no "forgot password" button.** No company stores your key or can reset it for you. If you lose it, your account is gone forever.',
          'This is the tradeoff for true ownership \u2014 nobody can take your account away, but nobody can recover it either. **Save your secret key somewhere safe right now.** For tips on keeping your key safe, read [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'manage-secret-key',
        question: 'Can I save my secret key in my phone\'s password manager?',
        answer: [
          'Yes! You can save it in your device\'s password manager (like iCloud Keychain, 1Password, or Bitwarden). On iPhone, if you save it correctly in Passwords, you can even use Face ID or Touch ID to log in.',
          'For a full guide on the best ways to store and manage your keys, check out [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'cost-to-use',
        question: 'Does {appName} cost anything?',
        answer: [
          '**Nope!** {appName} is completely free to use. Zaps (tips) are optional and just for fun. There are no premium tiers, no paywalls, no hidden fees.',
        ],
      },
      {
        id: 'beginner-guide',
        question: 'Is there a step-by-step guide for getting started?',
        answer: [
          'You\'re looking at it! This Help section covers everything you need. Start by saving your secret key, then explore your feed, follow some people, and try posting.',
          'Don\'t worry about getting everything perfect \u2014 you can always come back here.',
        ],
      },
    ],
  },

  // ── Apps & Access ───────────────────────────────────────────────────────
  {
    id: 'apps-access',
    label: 'Apps & Access',
    items: [
      {
        id: 'download-app',
        question: 'Can I download this on the App Store or Google Play?',
        answer: [
          'This site works as a web app right from your browser \u2014 no download needed! You can also "Add to Home Screen" on your phone to get an app-like experience.',
          'On Android, you can download {appName} from [Zap Store](https://zapstore.dev/apps/spot.agora.app), a community-driven app store for the Nostr ecosystem. iOS support is planned for the future \u2014 stay tuned!',
        ],
      },
      {
        id: 'one-account-many-apps',
        question: 'Can I use my account on other apps?',
        answer: [
          'Yes! That\'s one of the best things about Nostr. Your account isn\'t locked to any single app.',
          'You can take your keys to Primal, Damus, Amethyst, Coracle, or any other Nostr app and everything carries over \u2014 your posts, your followers, all of it.',
        ],
      },
      {
        id: 'nostr-app-store',
        question: 'Is there a Nostr-specific app store?',
        answer: [
          'Yes! [Zap Store](https://zapstore.dev/) is a community-driven app store built specifically for the Nostr ecosystem. You can discover and download Nostr apps, and the apps are verified by the community rather than a corporation. {appName} is listed there \u2014 [get it on Zap Store](https://zapstore.dev/apps/spot.agora.app).',
          'You can also browse a directory of Nostr apps at [nostrapps.com](https://nostrapps.com/).',
        ],
      },
    ],
  },

  // ── Payments & Zaps ─────────────────────────────────────────────────────
  {
    id: 'payments',
    label: 'Payments & Zaps',
    items: [
      {
        id: 'what-are-zaps',
        question: 'What are zaps?',
        answer: [
          'Zaps are tips! They let you send tiny amounts of Bitcoin to someone as a way of saying "great post" or "thanks."',
          'Think of it like a super-powered Like button that actually sends real money. They use the Lightning Network, which makes them instant and nearly free. To learn more, check out [Understanding Zaps](https://nostr.how/en/zaps).',
        ],
      },
      {
        id: 'send-bitcoin-onchain',
        question: 'How does sending Bitcoin work?',
        answer: [
          'This sends real Bitcoin on-chain, using your Nostr key as your wallet \u2014 no separate account, no top-up.',
          'Your send pays a small network fee to miners so the transaction gets confirmed. Faster confirmation costs a bit more; {appName} picks a sensible default.',
          'Once broadcast, it\'s public and irreversible. The creator\'s post gets tagged so they know the Bitcoin came from you.',
        ],
      },
      {
        id: 'send-bitcoin-lightning',
        question: 'How does sending Bitcoin over Lightning work?',
        answer: [
          'Lightning is a faster, cheaper layer built on top of Bitcoin. Payments settle in seconds and fees are usually fractions of a cent.',
          'You\'ll pay from your connected Lightning wallet. The creator receives the Bitcoin right away, and the payment is attached to their post as a zap so everyone can see the support.',
          'To learn more, check out [Understanding Zaps](https://nostr.how/en/zaps).',
        ],
      },
      {
        id: 'connect-wallet',
        question: 'How do I connect a wallet?',
        answer: [
          'To send or receive zaps, you need a Lightning wallet. Great options for beginners include [Alby](https://getalby.com/), [Zeus](https://zeusln.com/), and [Wallet of Satoshi](https://www.walletofsatoshi.com/).',
          'Once you have one, add your Lightning address to your profile settings, and you\'re ready to go.',
        ],
      },
      {
        id: 'only-bitcoin',
        question: 'Can I only use Bitcoin, or can I use regular money?',
        answer: [
          'Zaps use Bitcoin\'s Lightning Network. If you don\'t have Bitcoin, you can skip zaps entirely \u2014 they\'re completely optional.',
          'If you\'re curious, most Lightning wallets let you buy small amounts of Bitcoin right inside the app.',
        ],
      },
    ],
  },

  // ── Content & Safety ────────────────────────────────────────────────────
  {
    id: 'content-safety',
    label: 'Content & Safety',
    items: [
      {
        id: 'fyp',
        question: 'Will I have a "For You" page? How do I make my feed relevant?',
        answer: [
          'Your feed shows posts from people you follow \u2014 there\'s no algorithm deciding what you see. The more people you follow, the better your feed gets.',
          'Use the "Trends" page to discover popular content, and check out Follow Packs (curated groups of people) to quickly fill your feed with interesting voices.',
        ],
      },
      {
        id: 'what-are-relays',
        question: 'What are relays?',
        answer: [
          'Relays are the servers that store and deliver your posts. Think of them like different mail carriers \u2014 your messages get sent through them to reach other people.',
          'You don\'t need to think about relays to use Nostr; the defaults work great. But if you\'re curious, you can add or remove relays in Settings > Network.',
          'Using multiple relays means your content is backed up in more places, making it harder for anyone to silence you. To dive deeper, read [Understanding Nostr Relays](https://nostr.how/en/relays).',
        ],
      },
      {
        id: 'what-are-blossom',
        question: 'What are Blossom servers?',
        answer: [
          'Blossom servers are where your media files (photos, videos, audio) get stored when you upload them. Think of them like cloud storage for your files.',
          'Different Blossom servers are run by different people in different places. You can manage which servers you use in Settings > Network. To learn more about how Blossom works, read [The Blossom Protocol](https://onnostr.substack.com/p/the-blossom-protocol-supercharging).',
        ],
      },
      {
        id: 'media-content',
        question: 'What happens to media I upload? Can it be removed?',
        answer: [
          'When you upload media to Nostr, it gets stored on a Blossom server. That server has the right to remove any content for any reason, including based on the laws of their region.',
          'This is why it\'s important to use multiple Blossom servers, manage your server connections, and make informed choices about where you store your data.',
        ],
      },
      {
        id: 'report-content',
        question: 'How do I report harmful content?',
        answer: [
          'To report a post, tap the three-dot menu (**...**) on any post and select "Report." You can also mute or block individual users from the same menu.',
          'Because Nostr is decentralized, there\'s no single company reviewing reports \u2014 but relay operators can choose to remove content from their servers, and your mute list keeps your feed clean for you.',
        ],
      },
      {
        id: 'terms-of-service',
        question: 'Are there terms of service I need to agree to?',
        answer: [
          'Nostr itself is a protocol (like email or the web) \u2014 it doesn\'t have terms of service. Individual relays and apps may have their own rules.',
          'Since no single entity controls the network, the community largely self-moderates. Think of it less like a walled garden and more like the open internet.',
        ],
      },
    ],
  },

  // ── Profile & Identity ───────────────────────────────────────────────────
  {
    id: 'profile-identity',
    label: 'Profile & Identity',
    items: [
      {
        id: 'profile-fields',
        question: 'What are profile fields?',
        answer: [
          'Profile fields let you add extra info to your profile sidebar — like links, wallet addresses, music, photos, videos, and more. They\'re a way to express yourself and share what matters to you.',
          'You can add fields from the profile settings page. Each field has a **label** (what it\'s called) and a **value** (the content). For media fields, you can upload files directly and they\'ll render as players or embeds on your profile.',
        ],
      },
      {
        id: 'profile-fields-music',
        question: 'What audio formats can I upload for music fields?',
        answer: [
          'You can upload audio files in these formats: **MP3**, **OGG**, **WAV**, **FLAC**, **AAC**, **M4A**, and **Opus**. They\'ll appear as a mini audio player on your profile sidebar.',
        ],
      },
      {
        id: 'profile-fields-media',
        question: 'What image and video formats are supported?',
        answer: [
          'For images: **JPG**, **PNG**, **GIF**, **WebP**, **SVG**, and **AVIF**. For video: **MP4**, **WebM**, and **MOV**.',
          'Images will display as linked thumbnails, and videos will be embedded inline on your profile.',
        ],
      },
    ],
  },

  // ── Why is this different from Big Tech? ────────────────────────────────
  {
    id: 'big-tech',
    label: 'Why Is This Different from Big Tech?',
    items: [
      {
        id: 'why-different',
        question: 'How is this different from Instagram, X, or Facebook?',
        answer: [
          'On traditional social media, a company owns your account, controls what you see, and can delete your profile at any time.',
          'On Nostr, **you** own your identity. No company can lock you out, shadowban you, or shut down your account. Your followers, your posts, and your identity belong to you \u2014 not a corporation. We take this seriously \u2014 read our [ethics pledge](https://soapbox.pub/ethics) to see what we stand for.',
        ],
      },
      {
        id: 'vs-mastodon-bluesky',
        question: 'How is this different from Mastodon or Bluesky?',
        answer: [
          'Mastodon and Bluesky are also alternatives to Big Tech, but they work very differently from Nostr. On Mastodon, your account is tied to a specific server \u2014 if that server shuts down or bans you, you lose your account and have to start over. On Bluesky, the network is technically decentralized but in practice almost everyone depends on a single company (bsky.social), which can block entire servers.',
          'Nostr is different because your identity is a cryptographic key that **you** control. It\'s not tied to any server, company, or app. No one can delete your account, and you can switch between apps freely while keeping your followers and posts.',
          'The good news is you don\'t have to choose just one \u2014 bridges like Mostr let you follow people across all three networks. For a deeper comparison, check out [Nostr vs. Fediverse vs. Bluesky](https://soapbox.pub/blog/comparing-protocols).',
        ],
      },
      {
        id: 'what-is-decentralization',
        question: 'What does "decentralized" actually mean?',
        answer: [
          'It means there\'s no single company or server running everything. Nostr is a network of independent relays and apps, all speaking the same language.',
          'If one relay goes down or kicks you off, your account still works everywhere else. It\'s like the difference between one company owning all the roads vs. having thousands of independent roads anyone can build and use. For more on why this matters, read [The Future Is Decentralized](https://soapbox.pub/blog/future-is-decentralized).',
        ],
      },
      {
        id: 'censorship-resistance',
        question: 'What does "censorship-resistant" mean?',
        answer: [
          'It means no single person, company, or government can stop you from posting.',
          'On traditional platforms, one decision by a content moderation team can erase your entire online presence. On Nostr, as long as there\'s at least one relay willing to host your content, you can keep posting. You may lose reach on some relays, but you can never be fully silenced.',
        ],
      },
      {
        id: 'open-source',
        question: 'What does "open source" mean, and why does it matter?',
        answer: [
          'Open source means the code that powers this app is publicly available for anyone to read, verify, and improve. There are no hidden algorithms, no secret data collection, and no backdoors.',
          'Anyone can check exactly what the software does. It\'s the digital equivalent of a restaurant with a glass kitchen \u2014 nothing to hide. You can browse the [{appName} source code](https://gitlab.com/soapbox-pub/agora-3) yourself.',
        ],
      },
      {
        id: 'self-host',
        question: 'Can I self-host {appName}?',
        answer: [
          'Yes! Because {appName} is open source, anyone can run their own instance. You get full control over your server, your data, and your community.',
          'If you\'re interested, check out the project README for self-hosting and deployment steps.',
        ],
      },
      {
        id: 'who-made-this',
        question: 'Who made this?',
        answer: [
          'This platform is built by [Soapbox](https://soapbox.pub), a team of developers who believe social media should be owned by its users, not corporations.',
          'Soapbox builds open-source tools for the Nostr ecosystem. You can learn more about the team and their mission at [soapbox.pub](https://soapbox.pub).',
        ],
      },
    ],
  },

  // ── About Agora (design rationale) ──────────────────────────────────────
  {
    id: 'agora-design',
    label: 'About Agora',
    items: [
      {
        id: 'what-is-agora',
        question: 'What is {appName} for?',
        answer: [
          '{appName} is a Nostr platform for sending on-chain Bitcoin donations directly to activists. No middleman, no payment processor, no account to freeze.',
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
        id: 'why-not-lightning',
        question: 'Why doesn\'t {appName} use Lightning?',
        answer: [
          'Lightning requires a Lightning wallet. The easiest ones (like Wallet of Satoshi) are **custodial** \u2014 a company holds the funds and can be shut down, pressured, or pulled offline by a bad actor. Non-custodial Lightning is technically demanding and unreliable for newcomers.',
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
      {
        id: 'why-onchain',
        question: 'Why on-chain Bitcoin?',
        answer: [
          'On-chain Bitcoin is the most widely supported and censorship-resistant payment rail in the world. Every Bitcoin wallet can send it.',
          'The tradeoff is that on-chain transactions are public and pay a miner fee. The Donor and Activist guides explain how to handle both.',
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
