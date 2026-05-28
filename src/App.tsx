// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { NostrLoginProvider } from "@nostrify/react/login";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InferSeoMetaPlugin } from "@unhead/addons";
import { createHead, UnheadProvider } from "@unhead/react/client";
import { AppProvider } from "@/components/AppProvider";
import { InitialSyncRunner } from "@/components/InitialSyncRunner";
import { NativeNotifications } from "@/components/NativeNotifications";
import NostrProvider from "@/components/NostrProvider";
import { NostrSync } from "@/components/NostrSync";
import { PlausibleProvider } from "@/components/PlausibleProvider";
import { SentryProvider } from "@/components/SentryProvider";


import { TooltipProvider } from "@/components/ui/tooltip";
import { useNsecPasteGuard } from "@/hooks/useNsecPasteGuard";
import type { AppConfig } from "@/contexts/AppContext";
import { NWCProvider } from "@/contexts/NWCContext";
import { OnboardingProvider } from "@/contexts/OnboardingProvider";
import { BuildConfigSchema, type BuildConfig } from "@/lib/schemas";
import { secureStorage } from "@/lib/secureStorage";
import AppRouter from "./AppRouter";

const head = createHead({
  plugins: [InferSeoMetaPlugin()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes
    },
  },
});

/** Hardcoded fallback values. Always provides every required field. */
const hardcodedConfig: AppConfig = {
  appName: "Agora",
  appId: "agora",
  shareOrigin: import.meta.env.VITE_SHARE_ORIGIN || undefined,
  homePage: "campaigns",
  client: "naddr1qvzqqqru7cpzq7q6z5ns2hm5c8msyv83qwzxpxe52j8c4d4q5m92wsp9sflelkh9qqzkg6t5w3hswjl4yp",
  theme: "system",
  useAppRelays: true,
  useUserRelays: false,
  relayMetadata: {
    relays: [],
    updatedAt: 0,
  },
  feedSettings: {
    feedIncludePosts: true,
    feedIncludeComments: true,
    feedIncludeReposts: true,
    feedIncludeGenericReposts: true,
    feedIncludeReactions: false,
    feedIncludeZaps: true,
    feedIncludeArticles: true,
    showArticles: true,
    showHighlights: true,
    feedIncludeHighlights: true,
    showEvents: true,
    feedIncludeEvents: true,
    showVines: false,
    showPolls: true,
    showTreasures: false,
    showTreasureGeocaches: false,
    showTreasureFoundLogs: false,
    showColors: false,
    showPeopleLists: true,
    feedIncludeVines: false,
    feedIncludePolls: true,
    feedIncludeTreasureGeocaches: false,
    feedIncludeTreasureFoundLogs: false,
    feedIncludeColors: false,
    feedIncludePeopleLists: true,
    showDecks: false,
    feedIncludeDecks: false,
    showPhotos: true,
    feedIncludePhotos: true,
    showVideos: true,
    feedIncludeNormalVideos: true,
    feedIncludeShortVideos: true,
    feedIncludeVoiceMessages: true,
    showEmojiPacks: false,
    feedIncludeEmojiPacks: false,
    showCustomEmojis: false,
    showUserStatuses: false,
    showMusic: false,
    feedIncludeMusicTracks: false,
    feedIncludeMusicPlaylists: false,
    showPodcasts: false,
    feedIncludePodcastEpisodes: false,
    feedIncludePodcastTrailers: false,
    showDevelopment: false,
    feedIncludeDevelopment: false,
    showCommunities: true,
    feedIncludeCommunities: true,
    showBadges: true,
    showBadgeDefinitions: true,
    showProfileBadges: true,
    showBadgeAwards: true,
    feedIncludeBadgeDefinitions: true,
    feedIncludeProfileBadges: true,
    feedIncludeBadgeAwards: true,
    feedIncludeVanish: true,
    showBirdstar: false,
    feedIncludeBirdDetections: false,
    feedIncludeBirdex: false,
    feedIncludeConstellations: false,
    followsFeedShowReplies: true,
  },
  sidebarOrder: [
    "feed",
    "communities",
    "world",
    "wallet",
    "agent",
    "messages",
    "profile",
    "notifications",
    "search",
    "settings",
  ],
  nip85StatsPubkey:
    "5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea",
  blossomServerMetadata: {
    servers: [],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
  faviconUrl: "https://ditto.pub/api/favicon/{hostname}",
  linkPreviewUrl: "https://ditto.pub/api/link-preview/{url}",
  corsProxy: "https://proxy.shakespeare.diy/?url={href}",
  contentWarningPolicy: "blur",
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || "",
  sentryEnabled: true,
  plausibleDomain: import.meta.env.VITE_PLAUSIBLE_DOMAIN || "",
  plausibleEndpoint: import.meta.env.VITE_PLAUSIBLE_ENDPOINT || "",
  savedFeeds: [],
  autoplayVideos: false,
  imageQuality: 'compressed',
  imageProxy: 'https://wsrv.nl',
  lowBandwidthMode: false,
  curatorPubkey: '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  esploraApis: [
    'https://mempool.emzy.de/api',
    'https://mempool.space/api',
    'https://blockstream.info/api',
  ],
  blockbookBaseUrl: 'https://btc.trezor.io',
  bip352IndexerUrl: 'https://silentpayments.dev/blindbit/mainnet',
  sidebarWidgets: [
    { id: 'trends' },
    { id: 'hot-posts' },
    { id: 'ai-chat' },
  ],
  aiBaseURL: 'https://ai.shakespeare.diy/v1',
  aiApiKey: '',
  aiModel: 'google/gemma-4-26b',
  aiSystemPrompt: '',
};

/**
 * Parse and validate build-time app config overrides from the env string.
 * Returns an empty object when no config file was provided or validation fails.
 */
function parseBuildConfig(): BuildConfig {
  try {
    const encodedConfig = import.meta.env.APP_CONFIG ?? import.meta.env.DITTO_CONFIG;
    const json = JSON.parse(encodedConfig);
    if (!json) return {};
    return BuildConfigSchema.parse(json);
  } catch {
    return {};
  }
}

/**
 * Merge hardcoded defaults with build-time config overrides.
 * Deep-merges feedSettings so a partial override doesn't erase defaults.
 * Precedence (handled by AppProvider): user localStorage > build-time > hardcoded.
 */
const buildConfig = parseBuildConfig();
const defaultConfig: AppConfig = {
  ...hardcodedConfig,
  ...buildConfig,
  feedSettings: { ...hardcodedConfig.feedSettings, ...buildConfig.feedSettings },
};

export function App() {
  useNsecPasteGuard();


  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <SentryProvider>
          <PlausibleProvider>
            <QueryClientProvider client={queryClient}>
              <NostrLoginProvider storageKey="nostr:login" storage={secureStorage}>
                <NostrProvider>
                  <NostrSync />
                  <InitialSyncRunner />
                  <NativeNotifications />

                    <NWCProvider>
                      <OnboardingProvider>
                        <TooltipProvider>
                          <AppRouter />
                        </TooltipProvider>
                      </OnboardingProvider>
                  </NWCProvider>
                </NostrProvider>
              </NostrLoginProvider>
            </QueryClientProvider>
          </PlausibleProvider>
        </SentryProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
