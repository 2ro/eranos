import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, PlusCircle, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: string;
  /** If true, this link is treated as active only on an exact match. */
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Discover', to: '/', exact: true },
  { label: 'Start a campaign', to: '/campaigns/new' },
  { label: 'About', to: '/help' },
];

/**
 * Persistent top navigation bar rendered by {@link FundraiserLayout}. Mirrors
 * the GoFundMe-style chrome: brand mark on the left, primary nav links in the
 * middle, "Sign in" / account avatar plus a "Start a campaign" pill on the
 * right. Collapses to a hamburger menu below the `md` breakpoint.
 */
export function TopNav() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="md:hidden -ml-2 p-2 rounded-full hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md px-1"
          aria-label={`${config.appName} home`}
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
          {/* Primary CTA pill — hidden on small screens to keep the bar uncluttered;
              the same action lives at the top of the mobile menu and as a FAB-style
              button in the homepage hero. */}
          <Button asChild size="sm" className="hidden sm:inline-flex rounded-full">
            <Link to="/campaigns/new">
              <PlusCircle className="size-4 mr-1.5" />
              Start a campaign
            </Link>
          </Button>

          {/* LoginArea handles both logged-in (account avatar dropdown) and
              logged-out (Log in / Sign up) states. We render it inline-flex
              and let it style its own children. */}
          <LoginArea className={cn(user ? 'shrink-0' : 'max-w-[260px]')} />
        </div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col gap-0">
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
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.exact}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium motion-safe:transition-colors',
                        isActive
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-border p-4 space-y-3">
            <Button asChild className="w-full rounded-full" onClick={() => setMobileOpen(false)}>
              <Link to="/campaigns/new">
                <PlusCircle className="size-4 mr-1.5" />
                Start a campaign
              </Link>
            </Button>
            <SecondaryMobileLinks onClose={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function NavLinkButton({ item }: { item: NavItem }) {
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
      {item.label}
    </NavLink>
  );
}

/**
 * Secondary links inside the mobile drawer for the logged-in user — quick
 * shortcuts to the parts of the app that live outside the fundraising flow
 * but should still be reachable.
 */
function SecondaryMobileLinks({ onClose }: { onClose: () => void }) {
  const { user } = useCurrentUser();
  if (!user) return null;

  const items: { label: string; to: string }[] = [
    { label: 'Wallet', to: '/wallet' },
    { label: 'Bitcoin', to: '/bitcoin' },
    { label: 'Notifications', to: '/notifications' },
    { label: 'Profile', to: `/${nip19.npubEncode(user.pubkey)}` },
    { label: 'Settings', to: '/settings' },
  ];
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.to}>
          <Link
            to={item.to}
            onClick={onClose}
            className="block px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
