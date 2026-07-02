import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';

// ─── Theme Schemas ───────────────────────────────────────────────────

/** Zod schema for Theme validation */
const ThemeSchema = z.enum(['dark', 'light', 'system']) satisfies z.ZodType<Theme>;

/** Zod schema for ContentWarningPolicy validation */
const ContentWarningPolicySchema = z.enum(['blur', 'hide', 'show']) satisfies z.ZodType<ContentWarningPolicy>;

// ─── Feed & Relay Schemas ────────────────────────────────────────────

const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.string().url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
});

/** Zod schema for BlossomServerMetadata (BUD-03 kind 10063 server list). */
const BlossomServerMetadataSchema = z.object({
  servers: z.array(z.string().url()),
  updatedAt: z.number(),
});

/**
 * Zod schema for FeedSettings validation.
 * All fields use .optional() so data with missing keys
 * (from older encrypted settings) doesn't reject the whole object.
 * Uses looseObject to preserve extra keys from newer encrypted settings.
 * Missing fields get filled in by the defaultConfig merge downstream.
 */
const FeedSettingsSchema = z.looseObject({
  feedIncludePosts: z.boolean().optional(),
  feedIncludeComments: z.boolean().optional(),
  feedIncludeReposts: z.boolean().optional(),
  feedIncludeGenericReposts: z.boolean().optional(),
  feedIncludeReactions: z.boolean().optional(),
  feedIncludeArticles: z.boolean().optional(),
  showArticles: z.boolean().optional(),
  showHighlights: z.boolean().optional(),
  feedIncludeHighlights: z.boolean().optional(),
  showEvents: z.boolean().optional(),
  feedIncludeEvents: z.boolean().optional(),
  showVines: z.boolean().optional(),
  showPolls: z.boolean().optional(),
  showTreasures: z.boolean().optional(),
  showTreasureGeocaches: z.boolean().optional(),
  showTreasureFoundLogs: z.boolean().optional(),
  showColors: z.boolean().optional(),
  showPeopleLists: z.boolean().optional(),
  showStreams: z.boolean().optional(),
  feedIncludeVines: z.boolean().optional(),
  feedIncludePolls: z.boolean().optional(),
  feedIncludeTreasureGeocaches: z.boolean().optional(),
  feedIncludeTreasureFoundLogs: z.boolean().optional(),
  feedIncludeColors: z.boolean().optional(),
  feedIncludePeopleLists: z.boolean().optional(),
  feedIncludeStreams: z.boolean().optional(),
  showDecks: z.boolean().optional(),
  feedIncludeDecks: z.boolean().optional(),
  feedIncludeVoiceMessages: z.boolean().optional(),
  showEmojiPacks: z.boolean().optional(),
  feedIncludeEmojiPacks: z.boolean().optional(),
  showCustomEmojis: z.boolean().optional(),
  showUserStatuses: z.boolean().optional(),
  showMusic: z.boolean().optional(),
  feedIncludeMusicTracks: z.boolean().optional(),
  feedIncludeMusicPlaylists: z.boolean().optional(),
  showPodcasts: z.boolean().optional(),
  feedIncludePodcastEpisodes: z.boolean().optional(),
  feedIncludePodcastTrailers: z.boolean().optional(),
  showDevelopment: z.boolean().optional(),
  feedIncludeDevelopment: z.boolean().optional(),
  showCommunities: z.boolean().optional(),
  feedIncludeCommunities: z.boolean().optional(),
  showBadgeAwards: z.boolean().optional(),
  feedIncludeBadgeAwards: z.boolean().optional(),
  showBirdstar: z.boolean().optional(),
  feedIncludeBirdDetections: z.boolean().optional(),
  feedIncludeBirdex: z.boolean().optional(),
  feedIncludeConstellations: z.boolean().optional(),
});

/** Schema for a NIP-01 filter object (lenient — allows variable placeholder strings). */
const TabFilterSchema = z.record(z.string(), z.unknown());

/** Schema for a variable definition. */
const TabVarDefSchema = z.object({
  name: z.string(),
  tagName: z.string(),
  pointer: z.string(),
});

const SavedFeedSchema = z.object({
  id: z.string(),
  label: z.string(),
  filter: TabFilterSchema,
  vars: z.array(TabVarDefSchema).default([]),
  createdAt: z.number(),
});

// ─── AppConfigSchema ─────────────────────────────────────────────────

/**
 * Zod schema for the full AppConfig stored in localStorage.
 */
export const AppConfigSchema = z.object({
  appName: z.string().optional(),
  appId: z.string().optional(),
  shareOrigin: z.string().url().optional(),
  homePage: z.string().optional(),
  clientName: z.string().optional(),
  /** NIP-19 naddr1 string for the kind 31990 handler event. */
  client: z.string().startsWith('naddr1').optional(),
  theme: ThemeSchema,
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  useUserRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
  sidebarOrder: z.array(z.string()),
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || (val.length === 64 && /^[0-9a-f]{64}$/i.test(val)),
    { message: 'Must be empty or a valid 64-character hex pubkey' }
  ),
  blossomServerMetadata: BlossomServerMetadataSchema,
  useAppBlossomServers: z.boolean(),
  faviconUrl: z.string(),
  linkPreviewUrl: z.string(),
  corsProxy: z.string(),
  contentWarningPolicy: ContentWarningPolicySchema,
  sentryDsn: z.string(),
  sentryEnabled: z.boolean(),
  plausibleDomain: z.string(),
  plausibleEndpoint: z.string(),
  savedFeeds: z.array(z.unknown()).transform((arr) =>
    arr.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      if ((item as Record<string, unknown>).destination !== undefined) return [];
      const result = SavedFeedSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })
  ).optional().default([]),
  autoplayVideos: z.boolean(),
  imageQuality: z.enum(['compressed', 'original']),
  imageProxy: z.string(),
  lowBandwidthMode: z.boolean(),
  torEnabled: z.boolean(),
  curatorPubkey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  sidebarWidgets: z.array(z.object({
    id: z.string(),
    height: z.number().optional(),
  })).optional(),
  aiBaseURL: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiModel: z.string().optional(),
  aiSystemPrompt: z.string().optional(),
  translateWorkerUrl: z.string().optional(),
  goblinPayUrl: z.string().optional(),
  goblinPayApiToken: z.string().optional(),
  grinNodeUrl: z.string().optional(),
});

// ─── BuildConfigSchema (build-time app config) ───────────────────────

/**
 * Schema for the build-time app configuration file (`agora.json` by default).
 * Derived from AppConfigSchema with all fields made optional and strict
 * mode enabled so unknown keys are rejected.
 */
export const BuildConfigSchema = AppConfigSchema
  .partial()
  .strict();

/** Inferred type for the build-time configuration. */
export type BuildConfig = z.infer<typeof BuildConfigSchema>;

// ─── Content Filter Schemas ──────────────────────────────────────────

/** Zod schema for FilterRule validation */
const FilterRuleSchema = z.object({
  type: z.enum(['kind', 'content-regex', 'tag', 'author-metadata']),
  field: z.string().optional(),
  operator: z.enum(['equals', 'contains', 'regex', 'not-equals', 'not-contains']),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
});

/** Zod schema for ContentFilter validation */
const ContentFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  rules: z.array(FilterRuleSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ─── SavedFeed Schema ────────────────────────────────────────────────

// ─── EncryptedSettings Schema ────────────────────────────────────────

/**
 * Zod schema for EncryptedSettings validation.
 * All fields are optional since settings are incrementally synced.
 * Uses looseObject to preserve unknown keys from newer app versions.
 */
export const EncryptedSettingsSchema = z.looseObject({
  theme: ThemeSchema.optional(),
  useAppRelays: z.boolean().optional(),
  useUserRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationStyle: z.enum(['push', 'persistent']).optional(),
  notificationsCursor: z.number().optional(),
  notificationPreferences: z.object({
    reactions: z.boolean().optional(),
    reposts: z.boolean().optional(),
    mentions: z.boolean().optional(),
    comments: z.boolean().optional(),
    badges: z.boolean().optional(),
    letters: z.boolean().optional(),
    onlyFollowing: z.boolean().optional(),
  }).optional(),
  lastSync: z.number().optional(),
  sidebarOrder: z.array(z.string()).optional(),
  sidebarWidgets: z.array(z.object({
    id: z.string(),
    height: z.number().optional(),
  })).optional(),
  homePage: z.string().optional(),
  showGlobalFeed: z.boolean().optional(),
  showCommunityFeed: z.boolean().optional(),
  communityData: z.object({
    domain: z.string(),
    label: z.string(),
    userCount: z.number(),
    nip05: z.record(z.string(), z.unknown()),
  }).optional(),
  autoplayVideos: z.boolean().optional(),
  lowBandwidthMode: z.boolean().optional(),
  corsProxy: z.string().optional(),
  faviconUrl: z.string().optional(),
  linkPreviewUrl: z.string().optional(),
  sentryDsn: z.string().optional(),
  savedFeeds: z.array(z.unknown()).transform((arr) =>
    arr.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      if ((item as Record<string, unknown>).destination !== undefined) return [];
      const result = SavedFeedSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })
  ).optional(),
  aiBaseURL: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiModel: z.string().optional(),
  aiSystemPrompt: z.string().optional(),
  translateWorkerUrl: z.string().optional(),
});
