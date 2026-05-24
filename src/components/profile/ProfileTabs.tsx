import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProfileTabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (id: string) => void;
}

/**
 * Profile-local tab bar.
 *
 * A focused alternative to the global `SubHeaderBar` — no arc decoration,
 * no hover slice tracking, no FAB-aware spacing. Just a clean horizontal
 * row with an animated underline marking the active tab. Used in two
 * shapes on the profile page: a 3-tab content set on desktop (Activity /
 * Campaigns / Pledges, alongside the sticky identity rail) and a 5-tab
 * set on mobile (Overview / Activity / Campaigns / Community / Pledges,
 * since the rail collapses into the Overview / Community tabs).
 *
 * Behavior:
 *  - Sticks to the top of its containing scroll context. The parent column
 *    can place it inside any scroll region; the bar uses `position: sticky`.
 *  - Underline animates between active tabs via a single absolute-positioned
 *    indicator measured from the active tab's offset/width.
 *  - Horizontally scrolls when overflowing; auto-scrolls the active tab into
 *    view on selection (matches the previous TabButton behavior).
 */
export function ProfileTabs({ tabs, activeTab, onChange }: ProfileTabsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Measure the active tab and update the underline indicator.
  useLayoutEffect(() => {
    const btn = tabRefs.current.get(activeTab);
    if (!btn) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeTab, tabs]);

  // Recompute on resize (label-width changes between breakpoints).
  useEffect(() => {
    const onResize = () => {
      const btn = tabRefs.current.get(activeTab);
      if (!btn) return;
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeTab]);

  // Scroll the active tab into view when activated (overflow scroll case).
  useLayoutEffect(() => {
    const btn = tabRefs.current.get(activeTab);
    const track = trackRef.current;
    if (!btn || !track) return;
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;
    if (left < viewLeft) {
      track.scrollTo({ left: left - 8, behavior: 'smooth' });
    } else if (right > viewRight) {
      track.scrollTo({ left: right - track.clientWidth + 8, behavior: 'smooth' });
    }
  }, [activeTab]);

  return (
    <div
      className={cn(
        // Stickiness — sits at the top of the column scroll. `top-mobile-bar`
        // matches the existing app convention so it sits flush with the
        // mobile top nav. On desktop the chrome shifts and we use top-0.
        'sticky top-mobile-bar sidebar:top-0 z-10',
        // On mobile, fade + slide fully out of view when the user scrolls
        // down — otherwise the tabs sit at `top-mobile-bar` while the top
        // bar slides away, leaving a translucent gap above them, and when
        // the top bar slides back in it visibly crosses over the top of
        // the tab bar (top bar is z-20, tabs z-10).
        //
        // We can't simply use the shared `.nav-hidden-slide` utility (as
        // the global `SubHeaderBar` does) because the profile tab bar is
        // notably taller than other sub-headers and visibly gets clipped
        // by the top bar mid-transition. Pair the slide with an opacity
        // fade so the bar isn't visibly intersecting the top bar as it
        // animates.
        'max-sidebar:transition-[transform,opacity] max-sidebar:duration-300 max-sidebar:ease-in-out',
        // Visual separation — translucent backdrop so feed content doesn't
        // bleed through, with a single hairline border below.
        'bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'border-b border-border/60',
      )}
    >
      <div
        ref={trackRef}
        className="relative flex overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              onClick={() => {
                if (!active) onChange(tab.id);
              }}
              className={cn(
                'relative shrink-0 px-4 py-3.5 text-sm font-medium whitespace-nowrap',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:bg-secondary/40 rounded-sm',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-selected={active}
              role="tab"
            >
              {tab.label}
            </button>
          );
        })}

        {/* Active-tab underline indicator. Animates between tab positions. */}
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-0 h-0.5 bg-primary rounded-full transition-all duration-200 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>
    </div>
  );
}
