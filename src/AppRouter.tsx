import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/toaster";
import { TopNav } from "./components/TopNav";
import { OnboardingGate } from "./components/OnboardingGate";
import { ScrollToTop } from "./components/ScrollToTop";
import { VersionCheck } from "./components/VersionCheck";
import { MinimizedAudioBar } from "./components/MinimizedAudioBar";
import { AudioNavigationGuard } from "./components/AudioNavigationGuard";
import { TorStatusBanner } from "./components/TorStatusBanner";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import { cn } from "@/lib/utils";
import { openUrl } from "@/lib/downloadFile";
import { TEAM_URL } from "@/lib/agoraDefaults";

// Critical-path pages: eagerly loaded (landing + fallback)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Campaigns: home + create. (Campaign detail is dispatched from NIP19Page
// when an naddr resolves to kind 33863.)
const CampaignsPage = lazy(() => import("./pages/CampaignsPage").then(m => ({ default: m.CampaignsPage })));
const CreateCampaignPage = lazy(() => import("./pages/CreateCampaignPage").then(m => ({ default: m.CreateCampaignPage })));
const AllCampaignsPage = lazy(() => import("./pages/AllCampaignsPage").then(m => ({ default: m.AllCampaignsPage })));
const CampaignListDetailPage = lazy(() => import("./pages/CampaignListDetailPage").then(m => ({ default: m.CampaignListDetailPage })));

// All other pages: code-split via React.lazy
const ActionsPage = lazy(() => import("./pages/ActionsPage"));
const CreateActionPage = lazy(() => import("./pages/CreateActionPage").then(m => ({ default: m.CreateActionPage })));
const AdvancedSettingsPage = lazy(() => import("./pages/AdvancedSettingsPage").then(m => ({ default: m.AdvancedSettingsPage })));
const AppearanceSettingsPage = lazy(() => import("./pages/AppearanceSettingsPage").then(m => ({ default: m.AppearanceSettingsPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then(m => ({ default: m.ChangelogPage })));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage").then(m => ({ default: m.CommunitiesPage })));
const CreateCommunityPage = lazy(() => import("./pages/CreateCommunityPage").then(m => ({ default: m.CreateCommunityPage })));
const CreateEventPage = lazy(() => import("./pages/CreateEventPage").then(m => ({ default: m.CreateEventPage })));
const CSAEPolicyPage = lazy(() => import("./pages/CSAEPolicyPage").then(m => ({ default: m.CSAEPolicyPage })));
const ExternalContentPage = lazy(() => import("./pages/ExternalContentPage").then(m => ({ default: m.ExternalContentPage })));
const GeotagPage = lazy(() => import("./pages/GeotagPage").then(m => ({ default: m.GeotagPage })));
const HashtagPage = lazy(() => import("./pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then(m => ({ default: m.MessagesPage })));
const MyDashboardPage = lazy(() => import("./pages/MyDashboardPage").then(m => ({ default: m.MyDashboardPage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then(m => ({ default: m.AboutPage })));
const DonorGuidePage = lazy(() => import("./pages/DonorGuidePage").then(m => ({ default: m.DonorGuidePage })));
const RecipientGuidePage = lazy(() => import("./pages/RecipientGuidePage").then(m => ({ default: m.RecipientGuidePage })));
const CorporateSponsorshipPage = lazy(() => import("./pages/CorporateSponsorshipPage").then(m => ({ default: m.CorporateSponsorshipPage })));
const LanguageSettingsPage = lazy(() => import("./pages/LanguageSettingsPage").then(m => ({ default: m.LanguageSettingsPage })));
const NetworkSettingsPage = lazy(() => import("./pages/NetworkSettingsPage").then(m => ({ default: m.NetworkSettingsPage })));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const OrganizationsPage = lazy(() => import("./pages/OrganizationsPage").then(m => ({ default: m.OrganizationsPage })));
const OrganizersPage = lazy(() => import("./pages/OrganizersPage").then(m => ({ default: m.OrganizersPage })));
const EventDashboardPage = lazy(() => import("./pages/EventDashboardPage").then(m => ({ default: m.EventDashboardPage })));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage").then(m => ({ default: m.PrivacyPolicyPage })));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const SearchPage = lazy(() => import("./pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const RemoteLoginSuccessPage = lazy(() => import("./pages/RemoteLoginSuccessPage").then(m => ({ default: m.RemoteLoginSuccessPage })));

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? "", metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

function PageSkeleton() {
  // Shown briefly while a route's lazy chunk is being fetched. A skeleton
  // tuned to one page's shape (`max-w-6xl` with hero + paragraph blocks)
  // ends up wrong-shaped on every other page — narrow settings pages,
  // small wallet screens, etc. A neutral centered spinner is honest about
  // "loading" without misleading the eye with content-shaped boxes that
  // never appear.
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="bg-background mt-auto pt-6 sm:pt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => void openUrl(TEAM_URL)}
          className="hover:text-foreground motion-safe:transition-colors"
        >
          {t('nav.sourceCode')}
        </button>
        <nav className="flex items-center gap-5">
          <Link to="/about" className="hover:text-foreground motion-safe:transition-colors">{t('nav.about')}</Link>
          <Link to="/sponsors" className="hover:text-foreground motion-safe:transition-colors">{t('nav.sponsors')}</Link>
          <Link to="/verify" className="hover:text-foreground motion-safe:transition-colors">{t('nav.verify')}</Link>
          <Link to="/privacy" className="hover:text-foreground motion-safe:transition-colors">{t('nav.privacy')}</Link>
          <Link to="/safety" className="hover:text-foreground motion-safe:transition-colors">{t('nav.safety')}</Link>
          <Link to="/changelog" className="hover:text-foreground motion-safe:transition-colors">{t('nav.changelog')}</Link>
        </nav>
      </div>
    </footer>
  );
}

/**
 * Persistent app shell. GoFundMe-style top-nav-only chrome wrapping the route
 * outlet. The width of the center column is decided by the layout variant
 * picked in the route tree below — narrow (default, `max-w-3xl`) for
 * form/prose-style pages, wide (full width) for landing / dashboard / detail
 * pages that render their own internal layout.
 */
function FundraiserLayout({ narrow, hideFooter }: { narrow: boolean; hideFooter?: boolean }) {
  return (
    <div className={cn('flex flex-col bg-background', hideFooter ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
      <TopNav />
      <Suspense fallback={<PageSkeleton />}>
        <div
          className={cn('min-w-0 w-full flex-1 mx-auto', hideFooter && 'min-h-0', narrow && 'max-w-3xl')}
        >
          <Outlet />
        </div>
      </Suspense>
      {!hideFooter && <SiteFooter />}
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Toaster />
      <VersionCheck />
      <ScrollToTop />
      <AudioNavigationGuard />
      <MinimizedAudioBar />
      {/* App-wide Tor status banner. Must live inside BrowserRouter — it
          renders a <Link> to the Tor settings, which needs Router context. */}
      <TorStatusBanner />
      <OnboardingGate>
        <Routes>
        {/* Narrow layout — `max-w-3xl` center column. The default for
            form/prose-style pages. */}
        <Route element={<FundraiserLayout narrow />}>
          <Route path="/feed" element={<Index />} />
          <Route path="/my-dashboard" element={<MyDashboardPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfileRedirect />} />
          <Route path="/t/:tag" element={<HashtagPage />} />
          <Route path="/g/:geohash" element={<GeotagPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/appearance" element={<AppearanceSettingsPage />} />
          <Route path="/settings/language" element={<LanguageSettingsPage />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
          <Route path="/settings/network" element={<NetworkSettingsPage />} />
          {/* Legacy /help routes redirect to /about so existing links keep
              working. The About page and the two guides themselves live
              under the wide layout below. */}
          <Route path="/help" element={<Navigate to="/about" replace />} />
          <Route path="/help/donors" element={<Navigate to="/about/donors" replace />} />
          <Route path="/help/activists" element={<Navigate to="/about/recipients" replace />} />
          <Route path="/help/recipients" element={<Navigate to="/about/recipients" replace />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/safety" element={<CSAEPolicyPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/organizers" element={<OrganizersPage />} />
          {/* `/settings/verifier` moved to the public `/verify` onboarding
              page. Keep the old path as a redirect so existing links resolve. */}
          <Route path="/settings/verifier" element={<Navigate to="/verify" replace />} />
          {/* Callback target for remote signers (e.g. Amber, Primal) after NIP-46 approval */}
          <Route path="/remoteloginsuccess" element={<RemoteLoginSuccessPage />} />
        </Route>

        <Route element={<FundraiserLayout narrow={false} hideFooter />}>
          <Route path="/messages" element={<MessagesPage />} />
        </Route>

        {/* Wide layout — no max-width on the center column. Used by landing /
            list / detail pages that render their own internal width
            constraints. */}
        <Route element={<FundraiserLayout narrow={false} />}>
          <Route path="/" element={<CampaignsPage />} />
          <Route path="/campaigns" element={<AllCampaignsPage />} />
          <Route path="/campaigns/new" element={<CreateCampaignPage />} />
          <Route path="/campaigns/lists/:slug" element={<CampaignListDetailPage />} />
          {/* Legacy URL: the all-campaigns directory lived at
              `/campaigns/all` for a while. Keep it as a redirect so
              external links and bookmarks still resolve. */}
          <Route path="/campaigns/all" element={<Navigate to="/campaigns" replace />} />
          <Route path="/groups" element={<CommunitiesPage />} />
          <Route path="/groups/new" element={<CreateCommunityPage />} />
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route path="/pledges" element={<ActionsPage />} />
          <Route path="/pledges/new" element={<CreateActionPage />} />
          <Route path="/dashboard" element={<EventDashboardPage />} />
          <Route path="/i/*" element={<ExternalContentPage />} />
          {/* About page + Donor / Recipient guides. Full-bleed landing-style
              layouts that render their own internal max-widths. */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/about/donors" element={<DonorGuidePage />} />
          <Route path="/about/recipients" element={<RecipientGuidePage />} />
          {/* Corporate sponsorship / partnership marketing page. Wide layout
              so the hero and section backgrounds span the viewport like /about. */}
          <Route path="/sponsors" element={<CorporateSponsorshipPage />} />
          {/* Verification onboarding / marketing page. Wide layout so the
              hero and section backgrounds can span the viewport like /about. */}
          <Route path="/verify" element={<OrganizationsPage />} />
          <Route path="/organizations" element={<Navigate to="/verify" replace />} />
          {/* Legacy URL: the recipient guide lived at `/about/activists`
              before the "activist" → "recipient" copy change. Redirect so
              external links and bookmarks still resolve. */}
          <Route path="/about/activists" element={<Navigate to="/about/recipients" replace />} />
          {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1.
              Goes through the wide layout because the dispatch may resolve to
              a profile, campaign, action, or community page — all of which
              render their own internal layout. PostDetailPage / ListDetailPage
              also work edge-to-edge. */}
          <Route path="/:nip19" element={<NIP19Page />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
        </Routes>
      </OnboardingGate>
    </BrowserRouter>
  );
}
export default AppRouter;
