import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AudioNavigationGuard } from "@/components/AudioNavigationGuard";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import { MinimizedAudioBar } from "@/components/MinimizedAudioBar";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { BlobbiActionsProvider } from "@/blobbi/companion/interaction/BlobbiActionsProvider";
import { sidebarItemIcon } from "@/lib/sidebarItems";
import { Toaster } from "./components/ui/toaster";
import { MainLayout } from "./components/MainLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { VersionCheck } from "./components/VersionCheck";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import { getExtraKindDef } from "./lib/extraKinds";

// Critical-path pages: eagerly loaded (landing + fallback)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import MessagesPage from "./pages/Messages";

// Lazy-loaded companion layer (~450K code-split)
const BlobbiCompanionLayer = lazy(() => import("@/blobbi/companion").then(m => ({ default: m.BlobbiCompanionLayer })));

// Lazy-loaded compose modal (pulls in emoji-mart ~620K)
const ReplyComposeModal = lazy(() => import("@/components/ReplyComposeModal").then(m => ({ default: m.ReplyComposeModal })));

// HomePage eagerly imported all page components; now lazy-loaded
const HomePage = lazy(() => import("./pages/HomePage").then(m => ({ default: m.HomePage })));

// All other pages: code-split via React.lazy
const ActionsPage = lazy(() => import("./pages/ActionsPage"));
const AdvancedSettingsPage = lazy(() => import("./pages/AdvancedSettingsPage").then(m => ({ default: m.AdvancedSettingsPage })));
const AppearanceSettingsPage = lazy(() => import("./pages/AppearanceSettingsPage").then(m => ({ default: m.AppearanceSettingsPage })));
const ArticleEditorPage = lazy(() => import("./pages/ArticleEditorPage").then(m => ({ default: m.ArticleEditorPage })));
const BadgesPage = lazy(() => import("./pages/BadgesPage").then(m => ({ default: m.BadgesPage })));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage").then(m => ({ default: m.CommunitiesPage })));
const BookmarksPage = lazy(() => import("./pages/BookmarksPage").then(m => ({ default: m.BookmarksPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then(m => ({ default: m.ChangelogPage })));
const ContentPage = lazy(() => import("./pages/ContentPage").then(m => ({ default: m.ContentPage })));
const ContentSettingsPage = lazy(() => import("./pages/ContentSettingsPage").then(m => ({ default: m.ContentSettingsPage })));
const CSAEPolicyPage = lazy(() => import("./pages/CSAEPolicyPage").then(m => ({ default: m.CSAEPolicyPage })));
const DomainFeedPage = lazy(() => import("./pages/DomainFeedPage").then(m => ({ default: m.DomainFeedPage })));
const EventsFeedPage = lazy(() => import("./pages/EventsFeedPage").then(m => ({ default: m.EventsFeedPage })));
const ExternalContentPage = lazy(() => import("./pages/ExternalContentPage").then(m => ({ default: m.ExternalContentPage })));
const GeotagPage = lazy(() => import("./pages/GeotagPage").then(m => ({ default: m.GeotagPage })));
const HashtagPage = lazy(() => import("./pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then(m => ({ default: m.HelpPage })));
const KindFeedPage = lazy(() => import("./pages/KindFeedPage").then(m => ({ default: m.KindFeedPage })));
const LetterComposePage = lazy(() => import("./pages/LetterComposePage").then(m => ({ default: m.LetterComposePage })));
const LetterPreferencesPage = lazy(() => import("./pages/LetterPreferencesPage").then(m => ({ default: m.LetterPreferencesPage })));
const LettersPage = lazy(() => import("./pages/LettersPage").then(m => ({ default: m.LettersPage })));
const MagicSettingsPage = lazy(() => import("./pages/MagicSettingsPage").then(m => ({ default: m.MagicSettingsPage })));
const NetworkSettingsPage = lazy(() => import("./pages/NetworkSettingsPage").then(m => ({ default: m.NetworkSettingsPage })));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const OrganizersPage = lazy(() => import("./pages/OrganizersPage").then(m => ({ default: m.OrganizersPage })));
const PhotosFeedPage = lazy(() => import("./pages/PhotosFeedPage").then(m => ({ default: m.PhotosFeedPage })));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage").then(m => ({ default: m.PrivacyPolicyPage })));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const RelayPage = lazy(() => import("./pages/RelayPage").then(m => ({ default: m.RelayPage })));
const SearchPage = lazy(() => import("./pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const ThemesPage = lazy(() => import("./pages/ThemesPage").then(m => ({ default: m.ThemesPage })));
const UserListsPage = lazy(() => import("./pages/UserListsPage").then(m => ({ default: m.UserListsPage })));
const WalletSettingsPage = lazy(() => import("./pages/WalletSettingsPage").then(m => ({ default: m.WalletSettingsPage })));
const WalletPage = lazy(() => import("./pages/WalletPage").then(m => ({ default: m.WalletPage })));
const WorldPage = lazy(() => import("./pages/WorldPage").then(m => ({ default: m.WorldPage })));
const FollowPage = lazy(() => import("./pages/FollowPage").then(m => ({ default: m.FollowPage })));
const RemoteLoginSuccessPage = lazy(() => import("./pages/RemoteLoginSuccessPage").then(m => ({ default: m.RemoteLoginSuccessPage })));

const pollsDef = getExtraKindDef("polls")!;
const articlesDef = getExtraKindDef("articles")!;

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
        <BlobbiActionsProvider>
          <Suspense fallback={null}>
            <BlobbiCompanionLayer />
          </Suspense>
        </BlobbiActionsProvider>
        <Routes>
          {/* Auto-follow deep link: fullscreen immersive (no sidebars/nav) */}
          <Route path="/follow/:npub" element={<FollowPage />} />

          {/* All routes share the persistent MainLayout (sidebar + nav) */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/feed" element={<Index />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/search" element={<SearchPage />} />
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
            <Route path="/photos" element={<PhotosFeedPage />} />
            <Route path="/polls" element={<PollsFeedPage />} />
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
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/world" element={<WorldPage />} />
            <Route path="/badges" element={<BadgesPage />} />
            <Route path="/communities" element={<CommunitiesPage />} />
            <Route path="/letters" element={<LettersPage />} />
            <Route path="/letters/compose" element={<LetterComposePage />} />
            <Route path="/settings/letters" element={<LetterPreferencesPage />} />
            <Route path="/help" element={<HelpPage />} />
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
            <Route path="/organizers" element={<OrganizersPage />} />

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
