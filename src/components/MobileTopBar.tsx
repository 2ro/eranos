import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarsStaggeredIcon } from '@/components/icons/BarsStaggeredIcon';
import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { useNavHidden } from '@/contexts/LayoutContext';

const SAFE_AREA_TOP_HEIGHT = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
const HIDDEN_TOP_BAR_TRANSFORM = 'translateY(calc(-100% - 20px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px))))';
const TRANSLUCENT_HEADER_STYLE: React.CSSProperties = { backgroundColor: 'hsl(var(--background) / 0.85)' };

interface MobileTopBarProps {
  onAvatarClick: () => void;
  /** When true, a SubHeaderBar with an arc follows immediately below — skip the arc here to avoid doubling up. */
  hasSubHeader?: boolean;
}

export function MobileTopBar({ onAvatarClick, hasSubHeader: _hasSubHeader }: MobileTopBarProps) {
  const location = useLocation();
  const navHidden = useNavHidden();

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <>
      {/* Keep the top unsafe region covered even when the top bar slides away. */}
      {navHidden && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 right-0 top-0 z-20 sidebar:hidden"
          style={{ ...TRANSLUCENT_HEADER_STYLE, height: SAFE_AREA_TOP_HEIGHT }}
        />
      )}

      <header
        className="sticky top-0 z-20 sidebar:hidden transition-transform duration-300 ease-in-out"
        style={navHidden ? { ...TRANSLUCENT_HEADER_STYLE, transform: HIDDEN_TOP_BAR_TRANSFORM } : TRANSLUCENT_HEADER_STYLE}
      >
        <div className="relative safe-area-top">
          <div className="flex items-center px-3 h-10">
            {/* Left: hamburger menu icon */}
            <div className="flex items-center justify-center w-7 shrink-0">
              <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background text-muted-foreground hover:text-foreground transition-colors">
                <BarsStaggeredIcon className="size-5" />
              </button>
            </div>

            {/* Center: Agora lockup */}
            <div className="flex-1 flex items-center justify-center">
              <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2">
                <AgoraBoltIcon className="size-7 drop-shadow-sm" />
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-black tracking-tight text-foreground">ÁGORA</span>
                  <span className="text-[7px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Power to the people
                  </span>
                </div>
              </Link>
            </div>

            {/* Right: spacer for symmetry */}
            <div className="w-7 shrink-0" />
          </div>
        </div>
      </header>
    </>
  );
}
