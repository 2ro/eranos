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
import { useAppContext } from "@/hooks/useAppContext";
import { useNsecPasteGuard } from "@/hooks/useNsecPasteGuard";
import { useTor } from "@/hooks/useTor";
import type { AppConfig } from "@/contexts/AppContext";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
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
  appName: "Eranos",
  appId: "eranos",
  shareOrigin: import.meta.env.VITE_SHARE_ORIGIN || undefined,
  homePage: "campaigns",
  client: "naddr1qvzqqqru7cpzq7q6z5ns2hm5c8msyv83qwzxpxe52j8c4d4q5m92wsp9sflelkh9qqzkzem0wfssdl264k",
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
  torEnabled: false,
  curatorPubkey: '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  sidebarWidgets: [
    { id: 'trends' },
    { id: 'hot-posts' },
    { id: 'ai-chat' },
  ],
  aiBaseURL: 'https://ai.shakespeare.diy/v1',
  aiApiKey: '',
  aiModel: 'google/gemma-4-26b',
  aiSystemPrompt: '',
  translateWorkerUrl: import.meta.env.VITE_TRANSLATE_WORKER_URL || '',
  // Grin payments (Plan 2, C1). The GoblinPay instance URL/token are
  // deployment-specific and land via build config (APP_CONFIG) or env;
  // empty disables the in-app GoblinPay path. The node is read-only
  // (kernel lookups for the payment-proof tally).
  goblinPayUrl: import.meta.env.VITE_GOBLINPAY_URL || '',
  goblinPayApiToken: import.meta.env.VITE_GOBLINPAY_API_TOKEN || '',
  grinNodeUrl: import.meta.env.VITE_GRIN_NODE_URL || 'https://api.grin.money',
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

/**
 * Wraps NostrProvider with a key that changes when Tor routing changes, so the
 * relay layer remounts: existing connections close and reopen under the new
 * routing (direct ⇄ fail-closed Tor), and reconnect immediately once Tor is up
 * rather than waiting out the relay reconnect backoff. No-op off Android (the
 * key is always "direct").
 */
function RelayProvider({ children }: { children: React.ReactNode }) {
  const { config } = useAppContext();
  const { status } = useTor();
  const key = !config.torEnabled
    ? "direct"
    : status === "connected"
      ? "tor-connected"
      : "tor-pending";
  return <NostrProvider key={key}>{children}</NostrProvider>;
}

export function App() {
  useNsecPasteGuard();


  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <SentryProvider>
          <PlausibleProvider>
            <QueryClientProvider client={queryClient}>
              <NostrLoginProvider storageKey="nostr:login" storage={secureStorage}>
                <RelayProvider>
                  <NostrSync />
                  <InitialSyncRunner />
                  <NativeNotifications />

                  <OnboardingProvider>
                    <TooltipProvider>
                      <AudioPlayerProvider>
                        <AppRouter />
                      </AudioPlayerProvider>
                    </TooltipProvider>
                  </OnboardingProvider>
                </RelayProvider>
              </NostrLoginProvider>
            </QueryClientProvider>
          </PlausibleProvider>
        </SentryProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
