import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AudioNavigationGuard } from "@/components/AudioNavigationGuard";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import { MinimizedAudioBar } from "@/components/MinimizedAudioBar";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { sidebarItemIcon } from "@/lib/sidebarItems";
import { Toaster } from "./components/ui/toaster";
import { FundraiserLayout } from "./components/FundraiserLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { VersionCheck } from "./components/VersionCheck";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import { getExtraKindDef } from "./lib/extraKinds";

// Critical-path pages: eagerly loaded (landing + fallback)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import MessagesPage from "./pages/Messages";

// Lazy-loaded compose modal (pulls in emoji-mart ~620K)
const ReplyComposeModal = lazy(() => import("@/components/ReplyComposeModal").then(m => ({ default: m.ReplyComposeModal })));

// Lazy-loaded emoji pack dialog
const EmojiPackDialog = lazy(() => import("@/components/EmojiPackDialog").then(m => ({ default: m.EmojiPackDialog })));

// Campaigns: home + create. (Campaign detail is dispatched from NIP19Page
// when an naddr resolves to kind 30223.) The campaigns list IS the homepage;
// the configurable HomePage delegation from the Twitter-era app is gone.
const CampaignsPage = lazy(() => import("./pages/CampaignsPage").then(m => ({ default: m.CampaignsPage })));
const CreateCampaignPage = lazy(() => import("./pages/CreateCampaignPage").then(m => ({ default: m.CreateCampaignPage })));
const AllCampaignsPage = lazy(() => import("./pages/AllCampaignsPage").then(m => ({ default: m.AllCampaignsPage })));

// All other pages: code-split via React.lazy
const ActionsPage = lazy(() => import("./pages/ActionsPage"));
const CreateActionPage = lazy(() => import("./pages/CreateActionPage").then(m => ({ default: m.CreateActionPage })));
const AdvancedSettingsPage = lazy(() => import("./pages/AdvancedSettingsPage").then(m => ({ default: m.AdvancedSettingsPage })));
const AIChatPage = lazy(() => import("./pages/AIChatPage").then(m => ({ default: m.AIChatPage })));
const AppearanceSettingsPage = lazy(() => import("./pages/AppearanceSettingsPage").then(m => ({ default: m.AppearanceSettingsPage })));
const ArchivePage = lazy(() => import("./pages/ArchivePage").then(m => ({ default: m.ArchivePage })));
const ArticleEditorPage = lazy(() => import("./pages/ArticleEditorPage").then(m => ({ default: m.ArticleEditorPage })));
const BadgesPage = lazy(() => import("./pages/BadgesPage").then(m => ({ default: m.BadgesPage })));
const BlueskyPage = lazy(() => import("./pages/BlueskyPage").then(m => ({ default: m.BlueskyPage })));
const BookmarksPage = lazy(() => import("./pages/BookmarksPage").then(m => ({ default: m.BookmarksPage })));
const BooksPage = lazy(() => import("./pages/BooksPage").then(m => ({ default: m.BooksPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then(m => ({ default: m.ChangelogPage })));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage").then(m => ({ default: m.CommunitiesPage })));
const CreateCommunityPage = lazy(() => import("./pages/CreateCommunityPage").then(m => ({ default: m.CreateCommunityPage })));
const CreateEventPage = lazy(() => import("./pages/CreateEventPage").then(m => ({ default: m.CreateEventPage })));
const ContentPage = lazy(() => import("./pages/ContentPage").then(m => ({ default: m.ContentPage })));
const ContentSettingsPage = lazy(() => import("./pages/ContentSettingsPage").then(m => ({ default: m.ContentSettingsPage })));
const CSAEPolicyPage = lazy(() => import("./pages/CSAEPolicyPage").then(m => ({ default: m.CSAEPolicyPage })));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage").then(m => ({ default: m.DiscoverPage })));
const DomainFeedPage = lazy(() => import("./pages/DomainFeedPage").then(m => ({ default: m.DomainFeedPage })));
const EventsFeedPage = lazy(() => import("./pages/EventsFeedPage").then(m => ({ default: m.EventsFeedPage })));
const ExternalContentPage = lazy(() => import("./pages/ExternalContentPage").then(m => ({ default: m.ExternalContentPage })));
const GeotagPage = lazy(() => import("./pages/GeotagPage").then(m => ({ default: m.GeotagPage })));
const HashtagPage = lazy(() => import("./pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const MySquarePage = lazy(() => import("./pages/MySquarePage").then(m => ({ default: m.MySquarePage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then(m => ({ default: m.HelpPage })));
const DonorGuidePage = lazy(() => import("./pages/DonorGuidePage").then(m => ({ default: m.DonorGuidePage })));
const ActivistGuidePage = lazy(() => import("./pages/ActivistGuidePage").then(m => ({ default: m.ActivistGuidePage })));
const KindFeedPage = lazy(() => import("./pages/KindFeedPage").then(m => ({ default: m.KindFeedPage })));
const LetterComposePage = lazy(() => import("./pages/LetterComposePage").then(m => ({ default: m.LetterComposePage })));
const LetterPreferencesPage = lazy(() => import("./pages/LetterPreferencesPage").then(m => ({ default: m.LetterPreferencesPage })));
const LettersPage = lazy(() => import("./pages/LettersPage").then(m => ({ default: m.LettersPage })));
const MagicSettingsPage = lazy(() => import("./pages/MagicSettingsPage").then(m => ({ default: m.MagicSettingsPage })));
const MusicPage = lazy(() => import("./pages/MusicPage").then(m => ({ default: m.MusicPage })));
const NetworkSettingsPage = lazy(() => import("./pages/NetworkSettingsPage").then(m => ({ default: m.NetworkSettingsPage })));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const OrganizersPage = lazy(() => import("./pages/OrganizersPage").then(m => ({ default: m.OrganizersPage })));
const EventDashboardPage = lazy(() => import("./pages/EventDashboardPage").then(m => ({ default: m.EventDashboardPage })));
const PhotosFeedPage = lazy(() => import("./pages/PhotosFeedPage").then(m => ({ default: m.PhotosFeedPage })));
const PodcastsFeedPage = lazy(() => import("./pages/PodcastsFeedPage").then(m => ({ default: m.PodcastsFeedPage })));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage").then(m => ({ default: m.PrivacyPolicyPage })));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const RelayPage = lazy(() => import("./pages/RelayPage").then(m => ({ default: m.RelayPage })));
const SearchPage = lazy(() => import("./pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const TreasuresPage = lazy(() => import("./pages/TreasuresPage").then(m => ({ default: m.TreasuresPage })));
const TrendsPage = lazy(() => import("./pages/TrendsPage").then(m => ({ default: m.TrendsPage })));
const UserListsPage = lazy(() => import("./pages/UserListsPage").then(m => ({ default: m.UserListsPage })));
const VerifiedPage = lazy(() => import("./pages/VerifiedPage").then(m => ({ default: m.VerifiedPage })));
const VideosFeedPage = lazy(() => import("./pages/VideosFeedPage").then(m => ({ default: m.VideosFeedPage })));
const VinesFeedPage = lazy(() => import("./pages/VinesFeedPage").then(m => ({ default: m.VinesFeedPage })));
const WalletPage = lazy(() => import("./pages/WalletPage").then(m => ({ default: m.WalletPage })));
const WalletRecoveryPage = lazy(() => import("./pages/WalletRecoveryPage").then(m => ({ default: m.WalletRecoveryPage })));
const WalletSettingsPage = lazy(() => import("./pages/WalletSettingsPage").then(m => ({ default: m.WalletSettingsPage })));
const WebxdcFeedPage = lazy(() => import("./pages/WebxdcFeedPage").then(m => ({ default: m.WebxdcFeedPage })));
const WikipediaPage = lazy(() => import("./pages/WikipediaPage").then(m => ({ default: m.WikipediaPage })));
const WorldPage = lazy(() => import("./pages/WorldPage").then(m => ({ default: m.WorldPage })));
const FollowPage = lazy(() => import("./pages/FollowPage").then(m => ({ default: m.FollowPage })));
const ReceivePage = lazy(() => import("./pages/ReceivePage").then(m => ({ default: m.ReceivePage })));
const ClaimPage = lazy(() => import("./pages/ClaimPage").then(m => ({ default: m.ClaimPage })));
const RemoteLoginSuccessPage = lazy(() => import("./pages/RemoteLoginSuccessPage").then(m => ({ default: m.RemoteLoginSuccessPage })));

const pollsDef = getExtraKindDef("polls")!;
const colorsDef = getExtraKindDef("colors")!;
const packsDef = getExtraKindDef("packs")!;
const articlesDef = getExtraKindDef("articles")!;
const decksDef = getExtraKindDef("decks")!;
const emojisDef = getExtraKindDef("emojis")!;
const developmentDef = getExtraKindDef("development")!;
const highlightsDef = getExtraKindDef("highlights")!;

/** Polls feed page with a FAB that opens the compose modal (poll mode via + menu). */
function PollsFeedPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  return (
    <>
      <KindFeedPage
        kind={pollsDef.kind}
        title={pollsDef.label}
        icon={sidebarItemIcon("polls", "size-5")}
        onFabClick={() => setComposeOpen(true)}
      />
      {composeOpen && (
        <Suspense fallback={null}>
          <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} initialMode="poll" />
        </Suspense>
      )}
    </>
  );
}

/** Emoji feed page with a FAB that opens the emoji pack creation dialog. */
function EmojiFeedPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  return (
    <>
      <KindFeedPage
        kind={emojisDef.kind}
        title={emojisDef.label}
        icon={sidebarItemIcon("emojis", "size-5")}
        onFabClick={() => setComposeOpen(true)}
      />
      {composeOpen && (
        <Suspense fallback={null}>
          <EmojiPackDialog open={composeOpen} onOpenChange={setComposeOpen} />
        </Suspense>
      )}
    </>
  );
}

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? "", metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

export function AppRouter() {
  return (
    <AudioPlayerProvider>
      <BrowserRouter>
        <Toaster />
        <VersionCheck />
        <MinimizedAudioBar />
        <AudioNavigationGuard />
        <DeepLinkHandler />
        <ScrollToTop />
        <Routes>
          {/* Auto-follow deep link: fullscreen immersive (no sidebars/nav) */}
          <Route path="/follow/:npub" element={<FollowPage />} />
          <Route path="/receive" element={<ReceivePage />} />
          <Route path="/claim" element={<ClaimPage />} />

          {/* All routes share the persistent FundraiserLayout (top nav + footer) */}
          <Route element={<FundraiserLayout />}>
            <Route path="/" element={<CampaignsPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/my-square" element={<MySquarePage />} />
            <Route path="/feed" element={<Index />} />
            <Route path="/campaigns" element={<Navigate to="/" replace />} />
            <Route path="/campaigns/new" element={<CreateCampaignPage />} />
            <Route path="/campaigns/all" element={<AllCampaignsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/profile" element={<ProfileRedirect />} />
             <Route path="/t/:tag" element={<HashtagPage />} />
             <Route path="/g/:geohash" element={<GeotagPage />} />
            <Route path="/feed/:domain" element={<DomainFeedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/appearance" element={<AppearanceSettingsPage />} />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/settings/feed" element={<ContentSettingsPage />} />
            <Route path="/settings/content" element={<ContentPage />} />
            <Route path="/settings/wallet" element={<WalletSettingsPage />} />
            <Route
              path="/settings/notifications"
              element={<NotificationSettings />}
            />
            <Route
              path="/settings/advanced"
              element={<AdvancedSettingsPage />}
            />
            <Route path="/settings/magic" element={<MagicSettingsPage />} />
            <Route path="/settings/network" element={<NetworkSettingsPage />} />
            <Route path="/lists" element={<UserListsPage />} />
            <Route path="/events" element={<EventsFeedPage />} />
            <Route path="/events/new" element={<CreateEventPage />} />
            <Route path="/photos" element={<PhotosFeedPage />} />
            <Route path="/videos" element={<VideosFeedPage />} />
            {/* /streams redirects to /videos for backward compatibility */}
            <Route
              path="/streams"
              element={<Navigate to="/videos" replace />}
            />
            <Route path="/vines" element={<VinesFeedPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/podcasts" element={<PodcastsFeedPage />} />
            <Route path="/polls" element={<PollsFeedPage />} />
            <Route path="/treasures" element={<TreasuresPage />} />
            <Route
              path="/colors"
              element={
                <KindFeedPage
                  kind={colorsDef.kind}
                  title={colorsDef.label}
                  icon={sidebarItemIcon("colors", "size-5")}
                />
              }
            />
            <Route
              path="/packs"
              element={
                <KindFeedPage
                  kind={packsDef.kind}
                  title={packsDef.label}
                  icon={sidebarItemIcon("packs", "size-5")}
                />
              }
            />
            <Route path="/webxdc" element={<WebxdcFeedPage />} />
            <Route path="/articles/new" element={<ArticleEditorPage />} />
            <Route path="/articles/edit/:naddr" element={<ArticleEditorPage />} />
            <Route
              path="/articles"
              element={
                <KindFeedPage
                  kind={articlesDef.kind}
                  title={articlesDef.label}
                  icon={sidebarItemIcon("articles", "size-5")}
                  fabHref="/articles/new"
                />
              }
            />
            <Route
              path="/highlights"
              element={
                <KindFeedPage
                  kind={highlightsDef.kind}
                  title={highlightsDef.label}
                  icon={sidebarItemIcon("highlights", "size-5")}
                  showFAB={false}
                />
              }
            />
            <Route
              path="/decks"
              element={
                <KindFeedPage
                  kind={decksDef.kind}
                  title={decksDef.label}
                  icon={sidebarItemIcon("decks", "size-5")}
                />
              }
            />
            <Route path="/emojis" element={<EmojiFeedPage />} />
            <Route
              path="/development"
              element={
                <KindFeedPage
                  kind={[
                    developmentDef.kind,
                    ...(developmentDef.extraFeedKinds ?? []),
                  ]}
                  title={developmentDef.label}
                  icon={sidebarItemIcon("development", "size-5")}
                  showFAB={false}
                />
              }
            />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/wallet/recovery" element={<WalletRecoveryPage />} />
            <Route path="/bitcoin" element={<Navigate to="/wallet" replace />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/ai-chat" element={<AIChatPage />} />
            <Route path="/verified" element={<VerifiedPage />} />
            <Route path="/world" element={<WorldPage />} />
            <Route path="/badges" element={<BadgesPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/bluesky" element={<BlueskyPage />} />
            <Route path="/wikipedia" element={<WikipediaPage />} />
            <Route path="/communities" element={<CommunitiesPage />} />
            <Route path="/communities/new" element={<CreateCommunityPage />} />
            <Route path="/letters" element={<LettersPage />} />
            <Route path="/letters/compose" element={<LetterComposePage />} />
            <Route path="/settings/letters" element={<LetterPreferencesPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/help/donors" element={<DonorGuidePage />} />
            <Route path="/help/activists" element={<ActivistGuidePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/safety" element={<CSAEPolicyPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/r/*" element={<RelayPage />} />
            <Route
              path="/settings/lists"
              element={<Navigate to="/lists" replace />}
            />
            <Route path="/i/*" element={<ExternalContentPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/actions/new" element={<CreateActionPage />} />
            <Route path="/pledges" element={<ActionsPage />} />
            <Route path="/pledges/new" element={<CreateActionPage />} />
            <Route path="/agent" element={<AIChatPage />} />
            <Route path="/organizers" element={<OrganizersPage />} />
            <Route path="/dashboard" element={<EventDashboardPage />} />
            <Route path="/event-dashboard" element={<Navigate to="/dashboard" replace />} />

            {/* Callback target for remote signers (e.g. Amber, Primal) after NIP-46 approval */}
            <Route path="/remoteloginsuccess" element={<RemoteLoginSuccessPage />} />
            {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
            <Route path="/:nip19" element={<NIP19Page />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioPlayerProvider>
  );
}
export default AppRouter;
