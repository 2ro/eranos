import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Earth, Search, Users } from 'lucide-react';
import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { cn } from '@/lib/utils';
import { selectionChanged } from '@/lib/haptics';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useLayoutSnapshot } from '@/contexts/LayoutContext';
import { ArcBackground, ARC_UP_OVERHANG_PX } from '@/components/ArcBackground';
import { MobileSearchSheet } from '@/components/MobileSearchSheet';

/** Transform style applied when the bottom nav is hidden (scrolled away). */
const hiddenStyle: React.CSSProperties = {
  transform: `translateY(calc(100% + ${ARC_UP_OVERHANG_PX}px))`,
};

interface NavItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  to?: string;
  /** 'sm' shrinks the slot (smaller flex basis + smaller icon/label) for outer items. */
  size?: 'sm' | 'md';
}

/** A side item in the bottom nav row. */
function NavItem({ icon: Icon, label, active, badge, onClick, to, size = 'md' }: NavItemProps) {
  const isSm = size === 'sm';
  const className = cn(
    'flex flex-col items-center justify-center gap-0.5 py-2 transition-colors min-w-0',
    isSm ? 'flex-[0.7]' : 'flex-1',
    active ? 'text-primary' : 'text-muted-foreground',
  );
  const inner = (
    <>
      <span className="relative">
        <Icon className={isSm ? 'size-4' : 'size-5'} />
        {badge && (
          <span className="absolute -top-1 right-0 size-2 bg-primary rounded-full" />
        )}
      </span>
      <span className={cn('font-medium truncate', isSm ? 'text-[9px]' : 'text-[10px]')}>{label}</span>
    </>
  );
  if (to) return <Link to={to} onClick={onClick} className={className}>{inner}</Link>;
  return <button onClick={onClick} className={className}>{inner}</button>;
}

export function MobileBottomNav() {
  const location = useLocation();
  const { user } = useCurrentUser();
  const hasUnread = useHasUnreadNotifications();
  const { scrollContainer, noArcs } = useLayoutSnapshot();
  const { hidden } = useScrollDirection(scrollContainer);

  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    selectionChanged();
    setSearchOpen((v) => !v);
  }, []);

  const handleWalletClick = useCallback((e: React.MouseEvent) => {
    selectionChanged();
    setSearchOpen(false);
    if (location.pathname === '/wallet') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  // Hide the nav when search sheet is open so it doesn't compete for space
  const isHidden = hidden || searchOpen;

  const isOnWallet = location.pathname === '/wallet';
  const isOnCommunities = location.pathname === '/communities' || location.pathname.startsWith('/communities/');
  const isOnWorld = location.pathname === '/world' || location.pathname.startsWith('/world/');
  const isOnNotifications = location.pathname === '/notifications';

  return (
    <>
      <MobileSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 will-change-transform',
          'transition-transform duration-300 ease-in-out',
        )}
        style={isHidden ? hiddenStyle : undefined}
      >
        {/* Arc + items wrapper */}
        <div className="relative">
          <ArcBackground variant={noArcs ? 'rect' : 'up'} />
          <div className="h-12 flex items-end pb-0 relative translate-y-2">

            {/* Search */}
            <NavItem
              icon={Search}
              label="Search"
              active={searchOpen}
              onClick={handleSearchClick}
              size="sm"
            />

            {/* Communities */}
            <NavItem
              icon={Users}
              label="Communities"
              active={isOnCommunities}
              to="/communities"
              onClick={() => { selectionChanged(); setSearchOpen(false); }}
            />

            {/* Center spacer — reserved for the apex Feed button */}
            <div className="flex-[0.4]" aria-hidden="true" />

            {/* Notifications */}
            <NavItem
              icon={Bell}
              label="Notifications"
              active={isOnNotifications}
              badge={!!user && hasUnread}
              to="/notifications"
              onClick={() => { selectionChanged(); setSearchOpen(false); }}
            />

            {/* World */}
            <NavItem
              icon={Earth}
              label="World"
              active={isOnWorld}
              to="/world"
              onClick={() => { selectionChanged(); setSearchOpen(false); }}
              size="sm"
            />

          </div>

          {/* Apex Wallet button — Agora bolt mark cradled in the V notch. */}
          <Link
            to="/wallet"
            onClick={handleWalletClick}
            aria-label="Wallet"
            className={cn(
              'absolute left-1/2 -translate-x-1/2 z-10 -top-6',
              'flex items-center',
              'transition-transform hover:scale-105 active:scale-95',
            )}
          >
            <AgoraBoltIcon
              className={cn(
                'size-16 drop-shadow-md',
                isOnWallet && 'drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]',
              )}
            />
          </Link>
        </div>
        {/* Safe area fill — matches the arc's semi-transparent background */}
        <div className="safe-area-bottom bg-background/85" />
      </nav>
    </>
  );
}
