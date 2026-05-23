import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { TopNav } from "./components/TopNav";
import { ScrollToTop } from "./components/ScrollToTop";
import { VersionCheck } from "./components/VersionCheck";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import {
  CenterColumnContext,
  DrawerContext,
  LayoutStore,
  LayoutStoreContext,
  NavHiddenContext,
} from "@/contexts/LayoutContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Critical-path pages: eagerly loaded (landing + fallback)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Campaigns: home + create. (Campaign detail is dispatched from NIP19Page
// when an naddr resolves to kind 33863.)
const CampaignsPage = lazy(() => import("./pages/CampaignsPage").then(m => ({ default: m.CampaignsPage })));
const CreateCampaignPage = lazy(() => import("./pages/CreateCampaignPage").then(m => ({ default: m.CreateCampaignPage })));
const AllCampaignsPage = lazy(() => import("./pages/AllCampaignsPage").then(m => ({ default: m.AllCampaignsPage })));

// All other pages: code-split via React.lazy
const ActionsPage = lazy(() => import("./pages/ActionsPage"));
const CreateActionPage = lazy(() => import("./pages/CreateActionPage").then(m => ({ default: m.CreateActionPage })));
const AdvancedSettingsPage = lazy(() => import("./pages/AdvancedSettingsPage").then(m => ({ default: m.AdvancedSettingsPage })));
const AppearanceSettingsPage = lazy(() => import("./pages/AppearanceSettingsPage").then(m => ({ default: m.AppearanceSettingsPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then(m => ({ default: m.ChangelogPage })));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage").then(m => ({ default: m.CommunitiesPage })));
const CreateCommunityPage = lazy(() => import("./pages/CreateCommunityPage").then(m => ({ default: m.CreateCommunityPage })));
const CSAEPolicyPage = lazy(() => import("./pages/CSAEPolicyPage").then(m => ({ default: m.CSAEPolicyPage })));
const ExternalContentPage = lazy(() => import("./pages/ExternalContentPage").then(m => ({ default: m.ExternalContentPage })));
const GeotagPage = lazy(() => import("./pages/GeotagPage").then(m => ({ default: m.GeotagPage })));
const HashtagPage = lazy(() => import("./pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then(m => ({ default: m.HelpPage })));
const DonorGuidePage = lazy(() => import("./pages/DonorGuidePage").then(m => ({ default: m.DonorGuidePage })));
const ActivistGuidePage = lazy(() => import("./pages/ActivistGuidePage").then(m => ({ default: m.ActivistGuidePage })));
const NetworkSettingsPage = lazy(() => import("./pages/NetworkSettingsPage").then(m => ({ default: m.NetworkSettingsPage })));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const OrganizersPage = lazy(() => import("./pages/OrganizersPage").then(m => ({ default: m.OrganizersPage })));
const EventDashboardPage = lazy(() => import("./pages/EventDashboardPage").then(m => ({ default: m.EventDashboardPage })));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage").then(m => ({ default: m.PrivacyPolicyPage })));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const SearchPage = lazy(() => import("./pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const WalletPage = lazy(() => import("./pages/WalletPage").then(m => ({ default: m.WalletPage })));
const WalletRecoveryPage = lazy(() => import("./pages/WalletRecoveryPage").then(m => ({ default: m.WalletRecoveryPage })));
const WalletSettingsPage = lazy(() => import("./pages/WalletSettingsPage").then(m => ({ default: m.WalletSettingsPage })));
const RemoteLoginSuccessPage = lazy(() => import("./pages/RemoteLoginSuccessPage").then(m => ({ default: m.RemoteLoginSuccessPage })));

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? "", metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-background mt-auto pt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} Agora. Fundraisers on Nostr.</span>
        <nav className="flex items-center gap-5">
          <Link to="/help" className="hover:text-foreground motion-safe:transition-colors">Help</Link>
          <Link to="/privacy" className="hover:text-foreground motion-safe:transition-colors">Privacy</Link>
          <Link to="/safety" className="hover:text-foreground motion-safe:transition-colors">Safety</Link>
          <Link to="/changelog" className="hover:text-foreground motion-safe:transition-colors">Changelog</Link>
        </nav>
      </div>
    </footer>
  );
}

/**
 * Persistent app shell. GoFundMe-style top-nav-only chrome wrapping the
 * full-width route outlet.
 */
function FundraiserLayout() {
  const store = useMemo(() => new LayoutStore(), []);
  const centerColumnRef = useRef<HTMLDivElement>(null);
  const [centerColumnEl, setCenterColumnEl] = useState<HTMLElement | null>(null);

  return (
    <LayoutStoreContext.Provider value={store}>
      <CenterColumnContext.Provider value={centerColumnEl}>
        <DrawerContext.Provider value={() => {}}>
          <NavHiddenContext.Provider value={false}>
            <div className="min-h-dvh flex flex-col bg-background">
              <TopNav />
              <Suspense fallback={<PageSkeleton />}>
                <div
                  ref={(el) => {
                    centerColumnRef.current = el;
                    setCenterColumnEl(el);
                  }}
                  className={cn("flex-1 min-w-0 w-full mx-auto max-w-3xl")}
                >
                  <Outlet />
                </div>
              </Suspense>
              <SiteFooter />
            </div>
          </NavHiddenContext.Provider>
        </DrawerContext.Provider>
      </CenterColumnContext.Provider>
    </LayoutStoreContext.Provider>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Toaster />
      <VersionCheck />
      <ScrollToTop />
      <Routes>
        {/* All routes share the persistent FundraiserLayout (top nav + footer) */}
        <Route element={<FundraiserLayout />}>
          <Route path="/" element={<CampaignsPage />} />
          <Route path="/feed" element={<Index />} />
          <Route path="/campaigns" element={<Navigate to="/" replace />} />
          <Route path="/campaigns/new" element={<CreateCampaignPage />} />
          <Route path="/campaigns/all" element={<AllCampaignsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfileRedirect />} />
          <Route path="/t/:tag" element={<HashtagPage />} />
          <Route path="/g/:geohash" element={<GeotagPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/appearance" element={<AppearanceSettingsPage />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/wallet" element={<WalletSettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
          <Route path="/settings/network" element={<NetworkSettingsPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/wallet/recovery" element={<WalletRecoveryPage />} />
          <Route path="/bitcoin" element={<Navigate to="/wallet" replace />} />
          <Route path="/groups" element={<CommunitiesPage />} />
          <Route path="/groups/new" element={<CreateCommunityPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/help/donors" element={<DonorGuidePage />} />
          <Route path="/help/activists" element={<ActivistGuidePage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/safety" element={<CSAEPolicyPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/i/*" element={<ExternalContentPage />} />
          <Route path="/pledges" element={<ActionsPage />} />
          <Route path="/pledges/new" element={<CreateActionPage />} />
          <Route path="/organizers" element={<OrganizersPage />} />
          <Route path="/dashboard" element={<EventDashboardPage />} />

          {/* Callback target for remote signers (e.g. Amber, Primal) after NIP-46 approval */}
          <Route path="/remoteloginsuccess" element={<RemoteLoginSuccessPage />} />
          {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
          <Route path="/:nip19" element={<NIP19Page />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
