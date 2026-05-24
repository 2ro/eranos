import { useState, type ComponentType } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Bell,
  HandHeart,
  Info,
  LayoutDashboard,
  Megaphone,
  Menu,
  Search,
  Settings,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { LoginArea } from '@/components/auth/LoginArea';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { cn } from '@/lib/utils';

interface NavItem {
  /** i18n key under `nav.*` for the label. */
  labelKey: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** If true, this link is treated as active only on an exact match. */
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.activity', to: '/feed', icon: Activity },
  { labelKey: 'nav.campaigns', to: '/campaigns/all', icon: HandHeart },
  { labelKey: 'nav.groups', to: '/groups', icon: Users },
  { labelKey: 'nav.pledge', to: '/pledges', icon: Megaphone },
];

interface MobileLinkItem extends NavItem {
  requiresAuth?: boolean;
}

/**
 * Persistent top navigation bar rendered by {@link FundraiserLayout}. Mirrors
 * the GoFundMe-style chrome: brand mark on the left, primary nav links in the
 * middle, "Sign in" / account avatar on the right. Collapses to a hamburger
 * menu below the `md` breakpoint.
 */
export function TopNav() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { orderedItems } = useFeedSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const goToSearch = () => navigate('/search');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="md:hidden -ml-2 p-2 rounded-full hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('nav.openMenu')}
        >
          <Menu className="size-5" />
        </button>

        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md px-1"
          aria-label={t('nav.brandHome', { appName: config.appName })}
        >
          <LogoIcon className="size-6" />
          <span>{config.appName}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-6">
          {NAV_ITEMS.map((item) => (
            <NavLinkButton key={item.to} item={item} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search — navigates to the /search page. Visible on all
              breakpoints so users can always reach search from the chrome. */}
          <button
            type="button"
            onClick={goToSearch}
            className="shrink-0 size-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('nav.search')}
            title={t('nav.search')}
          >
            <Search className="size-5" />
          </button>

          {/* LoginArea handles both logged-in (account avatar dropdown) and
              logged-out (Log in / Sign up) states. We render it inline-flex
              and let it style its own children. */}
          <LoginArea className={cn(user ? 'shrink-0' : 'max-w-[260px]')} />
        </div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" hideClose className="w-72 p-0 flex flex-col gap-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 font-bold text-lg text-primary"
            >
              <LogoIcon className="size-6" />
              <span>{config.appName}</span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1.5 -mr-1.5 rounded-full hover:bg-secondary"
              aria-label={t('nav.closeMenu')}
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <MobileLinkList items={NAV_ITEMS} onClose={() => setMobileOpen(false)} />
            <MobileLinkList
              items={getProfileMenuItems({
                userPubkey: user?.pubkey,
                showDashboard: orderedItems.includes('dashboard'),
              })}
              onClose={() => setMobileOpen(false)}
            />
          </nav>
          <div className="border-t border-border p-4 space-y-3">
            <MobileFooterLinks onClose={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function NavLinkButton({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      className={({ isActive }) =>
        cn(
          'px-3 py-2 rounded-md text-sm font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
        )
      }
    >
      {t(item.labelKey)}
    </NavLink>
  );
}

function MobileFooterLinks({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const items = [
    { labelKey: 'nav.privacy', to: '/privacy' },
    { labelKey: 'nav.safety', to: '/safety' },
    { labelKey: 'nav.changelog', to: '/changelog' },
  ];

  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onClose}
          className="hover:text-foreground motion-safe:transition-colors"
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}

function getProfileMenuItems({
  userPubkey,
  showDashboard,
}: {
  userPubkey?: string;
  showDashboard: boolean;
}): MobileLinkItem[] {
  if (!userPubkey) return [];

  return [
    ...(showDashboard ? [{ labelKey: 'nav.dashboard', to: '/dashboard', icon: Activity }] : []),
    { labelKey: 'nav.myDashboard', to: '/my-dashboard', icon: LayoutDashboard },
    { labelKey: 'nav.wallet', to: '/wallet', icon: Wallet },
    { labelKey: 'nav.notifications', to: '/notifications', icon: Bell },
    { labelKey: 'nav.profile', to: `/${nip19.npubEncode(userPubkey)}`, icon: User },
    { labelKey: 'nav.search', to: '/search', icon: Search },
    { labelKey: 'nav.settings', to: '/settings', icon: Settings },
    { labelKey: 'nav.about', to: '/about', icon: Info },
  ];
}

function MobileLinkList({ items, onClose }: { items: MobileLinkItem[]; onClose: () => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.exact}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium motion-safe:transition-colors',
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            {t(item.labelKey)}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
