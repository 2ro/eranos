import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProfileTabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (id: string) => void;
}

/**
 * Profile-local tab bar.
 *
 * A focused alternative to the global `SubHeaderBar` — no arc decoration,
 * no hover slice tracking, no FAB-aware spacing. Just a clean horizontal
 * row with an animated underline marking the active tab. Designed for the
 * 4-tab profile case (Activity / Campaigns / Pledges / Posts).
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
        // Visual separation — translucent backdrop so feed content doesn't
        // bleed through, with a single hairline border below.
        'bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'border-b border-border/60',
        '-mx-4 sm:-mx-6 lg:mx-0',
      )}
    >
      <div
        ref={trackRef}
        className="relative flex overflow-x-auto scrollbar-none px-4 sm:px-6 lg:px-0"
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
                if (active) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  window.scrollTo({ top: 0 });
                  onChange(tab.id);
                }
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
