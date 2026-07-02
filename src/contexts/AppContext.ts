import { createContext } from "react";

/**
 * The app theme preference.
 *
 * "system" resolves to "light" or "dark" based on OS preference.
 *
 * Agora's colors are hardcoded in `src/index.css` and cannot be customized
 * at runtime. This used to support a `"custom"` value that loaded
 * user-defined colors, fonts, and backgrounds from localStorage / Nostr
 * events; that capability has been removed entirely for security reasons.
 */
export type Theme = "light" | "dark" | "system";

/**
 * How to handle events with a NIP-36 content-warning tag.
 * - "blur": Show a warning overlay; media is not loaded until the user reveals.
 * - "hide": Remove the event from view entirely.
 * - "show": Ignore the content-warning tag and display normally.
 */
export type ContentWarningPolicy = "blur" | "hide" | "show";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

/** Blossom server list metadata, mirroring RelayMetadata for parity with relay management. */
export interface BlossomServerMetadata {
  /** Ordered list of Blossom server URLs (most trusted/reliable first per BUD-03). */
  servers: string[];
  /** Unix timestamp of when the server list was last updated (from kind 10063 created_at). */
  updatedAt: number;
}

/** Which "Other Stuff" content types to show in the sidebar nav and include in feeds. */
export interface FeedSettings {
  /** Include text posts (kind 1) in the feed */
  feedIncludePosts: boolean;
  /** Include NIP-22 comments (kind 1111) in the feed */
  feedIncludeComments: boolean;
  /** Include reposts (kind 6) in the feed */
  feedIncludeReposts: boolean;
  /** Include generic reposts (kind 16) in the feed */
  feedIncludeGenericReposts: boolean;
  /** Include reactions (kind 7) in the feed, rendered as "X reacted to" overlays on the target event. Default: false. */
  feedIncludeReactions: boolean;
  /** Include long-form articles (kind 30023) in the feed */
  feedIncludeArticles: boolean;
  /** Show Articles (kind 30023) link in sidebar */
  showArticles: boolean;
  /** Show Highlights (kind 9802) link in sidebar */
  showHighlights: boolean;
  /** Include NIP-84 Highlights (kind 9802) in the follows/global feed */
  feedIncludeHighlights: boolean;
  /** Show Events (kind 31922/31923) link in sidebar */
  showEvents: boolean;
  /** Include calendar events in the follows/global feed */
  feedIncludeEvents: boolean;
  /** Show Vines (kind 34236) link in sidebar */
  showVines: boolean;
  /** Show Polls (kind 1068) link in sidebar */
  showPolls: boolean;
  /** Show Treasures link in sidebar */
  showTreasures: boolean;
  /** Show Treasure listings (kind 37516) in Treasures */
  showTreasureGeocaches: boolean;
  /** Show Found logs (kind 7516) in Treasures */
  showTreasureFoundLogs: boolean;
  /** Show Colors (kind 3367) link in sidebar */
  showColors: boolean;
  /** Show People Lists (kind 39089 follow packs, kind 30000 people sets) link in sidebar */
  showPeopleLists: boolean;
  /** Include Vines in the follows/global feed */
  feedIncludeVines: boolean;
  /** Include Polls in the follows/global feed */
  feedIncludePolls: boolean;
  /** Include Treasure listings in the follows/global feed */
  feedIncludeTreasureGeocaches: boolean;
  /** Include Treasure found logs in the follows/global feed */
  feedIncludeTreasureFoundLogs: boolean;
  /** Include Colors in the follows/global feed */
  feedIncludeColors: boolean;
  /** Include People Lists (kind 3 follow lists, kind 30000 people sets, kind 39089 follow packs) in the follows/global feed */
  feedIncludePeopleLists: boolean;
  /** Show Magic Decks (kind 37381) link in sidebar */
  showDecks: boolean;
  /** Include Magic Decks in the follows/global feed */
  feedIncludeDecks: boolean;
  /** Include voice messages (kind 1222 + 1244) in the follows/global feed */
  feedIncludeVoiceMessages: boolean;
  /** Show NIP-30 custom emojis in the emoji picker */
  showCustomEmojis: boolean;
  /** Show Emoji Packs (kind 30030) link in sidebar */
  showEmojiPacks: boolean;
  /** Include Emoji Packs in the follows/global feed */
  feedIncludeEmojiPacks: boolean;
  /** Show Photos (NIP-68, kind 20) link in sidebar */
  showPhotos: boolean;
  /** Include Photos in the follows/global feed */
  feedIncludePhotos: boolean;
  /** Show Videos page (NIP-71 kinds 21/22) link in sidebar */
  showVideos: boolean;
  /** Include normal videos (kind 21) in the follows/global feed */
  feedIncludeNormalVideos: boolean;
  /** Include short videos (kind 22) in the follows/global feed */
  feedIncludeShortVideos: boolean;
  /** Show NIP-38 user statuses on profiles and note cards */
  showUserStatuses: boolean;
  /** Show Music (kind 36787 tracks + kind 34139 playlists) link in sidebar */
  showMusic: boolean;
  /** Include music tracks (kind 36787) in the follows/global feed */
  feedIncludeMusicTracks: boolean;
  /** Include music playlists (kind 34139) in the follows/global feed */
  feedIncludeMusicPlaylists: boolean;
  /** Show Podcasts (kind 30054 episodes + kind 30055 trailers) link in sidebar */
  showPodcasts: boolean;
  /** Include podcast episodes (kind 30054) in the follows/global feed */
  feedIncludePodcastEpisodes: boolean;
  /** Include podcast trailers (kind 30055) in the follows/global feed */
  feedIncludePodcastTrailers: boolean;
  /** Show Development (NIP-34 repos, patches, PRs, custom NIPs, app submissions) link in sidebar */
  showDevelopment: boolean;
  /** Include Development content in the follows/global feed */
  feedIncludeDevelopment: boolean;
  /** Show Communities (NIP-72 kind 34550) link in sidebar */
  showCommunities: boolean;
  /** Include community definitions (kind 34550) in the follows/global feed */
  feedIncludeCommunities: boolean;
  /** Show Badges (NIP-58 kind 30009) link in sidebar */
  showBadges: boolean;
  /** Show badge definitions (kind 30009) on the Badges page */
  showBadgeDefinitions: boolean;
  /** Show profile badges (kind 10008/30008) on the Badges page */
  showProfileBadges: boolean;
  /** Show badge awards (kind 8) on the Badges page */
  showBadgeAwards: boolean;
  /** Include badge definitions (kind 30009) in the follows/global feed */
  feedIncludeBadgeDefinitions: boolean;
  /** Include profile badges (kind 10008/30008) in the follows/global feed */
  feedIncludeProfileBadges: boolean;
  /** Include badge awards (kind 8) in the follows/global feed */
  feedIncludeBadgeAwards: boolean;
  /** Include Request to Vanish events (kind 62) in the follows/global feed */
  feedIncludeVanish: boolean;
  /** Show Birdstar (kind 2473 bird detections + kind 30621 custom constellations) link in sidebar */
  showBirdstar: boolean;
  /** Include bird detections (kind 2473) in the follows/global feed */
  feedIncludeBirdDetections: boolean;
  /** Include Birdex life lists (kind 12473) in the follows/global feed */
  feedIncludeBirdex: boolean;
  /** Include custom constellations (kind 30621) in the follows/global feed */
  feedIncludeConstellations: boolean;
  /** Include replies in the follows feed (default: true) */
  followsFeedShowReplies: boolean;
}

/**
 * A standard NIP-01 filter object that may contain variable placeholders
 * (`$name`) in string positions. After resolution, becomes a `NostrFilter`.
 */
export type TabFilter = Record<string, unknown>;

/** A variable definition for tab filters (extracted from `var` tags). */
interface TabVarDef {
  /** Variable name including the `$` prefix, e.g. `"$follows"`. */
  name: string;
  /** Tag name to extract from the referenced event, e.g. `"p"`. */
  tagName: string;
  /** Event pointer: `e:<id>` or `a:<kind>:<pubkey>:<d-tag>`. May contain variables. */
  pointer: string;
}

/** A named feed tab saved from the search page. */
export interface SavedFeed {
  id: string;
  label: string;
  filter: TabFilter;
  vars: TabVarDef[];
  createdAt: number;
}

export interface AppConfig {
  /** Application display name used in page titles, UI text, and branding. Default: "Eranos". */
  appName: string;
  /** Application identifier used as a prefix for application-specific metadata (NIP-78 d-tags, etc). Default: "agora". */
  appId: string;
  /**
   * Canonical origin used when generating shareable URLs (QR codes, copy-link,
   * remote-login callbacks, etc). Falls back to Agora's canonical production
   * origin when unset.
   * Must NOT include a trailing slash.
   */
  shareOrigin?: string;
  /** Sidebar item ID to display on the homepage ("/"). Default: "feed". */
  homePage: string;
  /** Display name used in the NIP-89 "client" tag. Falls back to `appName` when not set. */
  clientName?: string;
  /** NIP-19 `naddr1…` identifying this client's kind 31990 handler event. Decoded at publish time to produce the `31990:<pubkey>:<d-tag>` addr and relay hint for the "client" tag per NIP-89. */
  client?: string;
  /** Current theme */
  theme: Theme;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays: boolean;
  /**
   * Whether to include the user's personal NIP-65 relay list in the effective relay set.
   * Defaults to `false` — users must opt-in via Settings → Network to actually connect
   * to their own relays. Until enabled, only the app-default relays are used (assuming
   * `useAppRelays` is true).
   */
  useUserRelays: boolean;
  /** Feed and sidebar content settings */
  feedSettings: FeedSettings;
  /** Ordered list of sidebar item IDs (built-in + extra-kind). */
  sidebarOrder: string[];
  /** NIP-85 stats pubkey source (hex format) */
  nip85StatsPubkey: string;
  /**
   * Blossom file upload server metadata (BUD-03).
   * `servers` is the user's personal list, synced from/to kind 10063.
   * App default servers are managed separately via APP_BLOSSOM_SERVERS.
   */
  blossomServerMetadata: BlossomServerMetadata;
  /**
   * Whether to use app default Blossom servers in addition to the user's kind 10063 servers.
   * Mirrors `useAppRelays` semantics for Blossom.
   */
  useAppBlossomServers: boolean;
  /** Favicon URI template. Supports RFC 6570 variables: {href}, {origin}, {hostname}, etc. */
  faviconUrl: string;
  /** Link preview URI template. Supports RFC 6570 variables: {url}, {href}, {origin}, {hostname}, etc. Returns OEmbed JSON. */
  linkPreviewUrl: string;
  /** CORS proxy URI template. Use {href} as placeholder for the target URL (URL-encoded). */
  corsProxy: string;
  /** How to handle NIP-36 content-warning events (blur, hide, or show). Default: "blur". */
  contentWarningPolicy: ContentWarningPolicy;
  /** Sentry DSN for error reporting (empty string = disabled). */
  sentryDsn: string;
  /** Whether the user has enabled Sentry error reporting. */
  sentryEnabled: boolean;
  /** Plausible Analytics domain (empty string = disabled). */
  plausibleDomain: string;
  /** Plausible Analytics API endpoint (empty string = use default). */
  plausibleEndpoint: string;
  /** Saved home feed tabs. Cached locally so they appear instantly on load. */
  savedFeeds: SavedFeed[];
  /** Autoplay videos in feeds and previews (muted). Default: false. */
  autoplayVideos: boolean;
  /** Image upload quality: "compressed" resizes/optimizes, "original" uploads as-is. Default: "compressed". */
  imageQuality: 'compressed' | 'original';
  /**
   * Base URL of an image-resizing proxy. Empty string = disabled (images load
   * at full resolution from their origin). When set, image URLs are rewritten
   * through the proxy at a per-context width, returning WebP at quality 75.
   *
   * The proxy must speak the wsrv.nl / weserv API
   * (https://github.com/weserv/images). The well-known public instance is
   * `https://wsrv.nl`. Self-hosted `imgproxy` and similar do NOT speak the
   * same query language.
   *
   * **Privacy note**: enabling the proxy collapses every image fetch through
   * one hostname (good — your ISP no longer sees every Blossom/imgur/etc.
   * host you load from), but the proxy operator now sees every image URL
   * you load. Self-hosters and privacy-conscious users can point this at
   * their own instance, or disable the proxy entirely.
   *
   * Default: `'https://wsrv.nl'`.
   */
  imageProxy: string;
  /**
   * Low-bandwidth mode. When enabled:
   * - Videos never autoplay (overrides `autoplayVideos`).
   * - Background video frame-grabbing for posters is skipped.
   * - Images that would normally load inline (post images, galleries,
   *   banners, link preview thumbnails, video posters) show a tap-to-load
   *   placeholder. The image proxy setting is independent — if the proxy
   *   is on, the tap loads the proxied (smaller) version; if off, the tap
   *   loads the original.
   *
   * Default: false.
   */
  lowBandwidthMode: boolean;
  /**
   * Route all app traffic through the Tor network (arti). **Android only** —
   * ignored on web and iOS. The Advanced Settings toggle applies changes live
   * via the native `start`/`stop` bridge (arti starts/stops immediately and the
   * relay layer remounts). The flag is also persisted natively so arti
   * auto-starts on the next cold launch (see `src/lib/tor.ts` and the native
   * `TorController`).
   *
   * Default: false.
   */
  torEnabled: boolean;
  /** Hex pubkey of the curator whose follow list defines the curated feed. */
  curatorPubkey?: string;
  /** Ordered list of right sidebar widget configs. Each entry is a widget type ID with optional display settings. */
  sidebarWidgets: WidgetConfig[];
  /** Base URL for the AI chat-completions provider (OpenAI-compatible /v1 endpoint). */
  aiBaseURL: string;
  /** API key for the AI provider. Empty string = use NIP-98 auth (only valid for Shakespeare). */
  aiApiKey: string;
  /** AI model identifier sent to the provider (e.g. "google/gemma-4-26b", "claude-opus-4.6"). */
  aiModel: string;
  /** Custom system prompt for the Agent. Empty string = use the default template. */
  aiSystemPrompt: string;
  /**
   * URL of the DeepL-backed Cloudflare Worker used to translate user-generated
   * content (the "Translate" button on notes). Defaults to the build-time
   * `VITE_TRANSLATE_WORKER_URL` env value. Empty string falls back to the
   * hardcoded worker URL in the translate flow.
   */
  translateWorkerUrl: string;
  /**
   * Base URL of the GoblinPay instance backing this Eranos deployment's
   * in-app Grin donate flow (no trailing slash). Empty/unset disables the
   * GoblinPay path; the native `grin1…` address path still works per
   * campaign. The instance must allow CORS from this app's origin (or be
   * proxied same-origin by the deploy).
   */
  goblinPayUrl?: string;
  /**
   * API token for the GoblinPay connector surface (`POST /invoice`,
   * `Authorization: Bearer`). Required to create invoices; the status,
   * checkout, and receipt reads are public-by-token and need no auth.
   */
  goblinPayApiToken?: string;
  /**
   * Base URL of a Grin node used for read-only kernel lookups (the
   * payment-proof tally's on-chain check, `get_kernel` on `/v2/foreign`).
   * The node must allow CORS from this app's origin (or be proxied
   * same-origin by the deploy). Default: `https://api.grin.money`.
   */
  grinNodeUrl?: string;
}

/** Configuration for a single widget in the right sidebar. */
export interface WidgetConfig {
  /** Widget type identifier (e.g. "trends", "wikipedia", "bluesky"). */
  id: string;
  /** User-configured height in pixels. Overrides the widget's default height. */
  height?: number;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (
    updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>,
  ) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
