import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArcBackground } from '@/components/ArcBackground';
import { SubHeaderBarContext } from '@/components/SubHeaderBarContext';

interface HoverSlice {
  left: number;
  width: number;
}

interface SubHeaderBarProps {
  children: React.ReactNode;
  /** Extra classes on the outer wrapper (e.g. shrink-0). */
  className?: string;
  /** Extra classes on the inner flex container holding the tabs. */
  innerClassName?: string;
  /** Extra classes on the SVG background fill. */
  backgroundFillClassName?: string;
  /** Replace the decorative arc with a plain rectangle. */
  noArc?: boolean;
  /**
   * Legacy prop from the mobile-top-bar era — kept for API compatibility.
   * Currently unused since the persistent FundraiserLayout has no hide-on-scroll behavior.
   */
  pinned?: boolean;
}

/**
 * Shared sticky sub-header bar with a unified arc+background drawn as a single
 * SVG shape. Eliminates the sub-pixel seam between a bg-background/80 container
 * and a separate SVG arc overlay that can appear during scroll/animation.
 *
 * Used by all tab bars (Feed, Search, Notifications, etc.).
 */
export function SubHeaderBar({ children, className, innerClassName, backgroundFillClassName, noArc: _noArc, pinned: _pinned }: SubHeaderBarProps) {
  const [hover, setHover] = useState<HoverSlice | null>(null);
  const [active, setActive] = useState<HoverSlice | null>(null);

  // Horizontal overflow scroll arrows (desktop only)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 2; // sub-pixel rounding tolerance
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow]);

  // Also re-check overflow when children change (new tabs added/removed)
  useEffect(() => {
    checkOverflow();
  }, [children, checkOverflow]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <SubHeaderBarContext.Provider value={{ onHover: setHover, onActive: setActive, scrollContainerRef: scrollRef }}>
      <div
        className={cn('relative sticky top-mobile-bar sidebar:top-0 z-10', className)}
      >
        {/* Inner wrapper holds the ArcBackground and tab content. */}
        <div className="relative">
          <ArcBackground variant="rect" fillClassName={backgroundFillClassName} />
          {/* Per-tab hover highlight: a flat-bottomed slab clipped to the hovered tab's x-slice */}
          {hover && (
            <svg
              aria-hidden
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                clipPath: `inset(0 calc(100% - ${hover.left + hover.width}px) 0 ${hover.left}px)`,
              }}
              viewBox="0 0 100 64"
              preserveAspectRatio="none"
            >
              <path d="M0,0 L100,0 L100,64 L0,64 Z" className="fill-secondary/40" />
            </svg>
          )}
          {/* Active tab indicator: a flat underline along the bottom edge, clipped to the active tab's x-slice */}
          {active && (
            <svg
              aria-hidden
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                clipPath: `inset(0 calc(100% - ${active.left + active.width}px) 0 ${active.left}px)`,
              }}
              viewBox="0 0 100 64"
              preserveAspectRatio="none"
            >
              <path d="M0,62 L100,62" fill="none" className="stroke-primary" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {/* Tab content sits above the SVG background */}
          <div className="relative">
            {/* Left scroll arrow — desktop only, shown when overflowing */}
            {canScrollLeft && (
              <button
                type="button"
                aria-label="Scroll tabs left"
                onClick={() => scrollBy('left')}
                className="hidden sidebar:flex absolute left-0 top-0 bottom-0 z-10 items-center pl-0.5 pr-1 bg-gradient-to-r from-background via-background to-transparent cursor-pointer"
              >
                <ChevronLeft className="size-4 text-foreground/60 drop-shadow-md" strokeWidth={4} />
              </button>
            )}
            <div
              ref={scrollRef}
              className={cn('relative flex overflow-x-auto scrollbar-none py-1', innerClassName)}
            >
              {children}
            </div>
            {/* Right scroll arrow — desktop only, shown when overflowing */}
            {canScrollRight && (
              <button
                type="button"
                aria-label="Scroll tabs right"
                onClick={() => scrollBy('right')}
                className="hidden sidebar:flex absolute right-0 top-0 bottom-0 z-10 items-center pr-0.5 pl-1 bg-gradient-to-l from-background via-background to-transparent cursor-pointer"
              >
                <ChevronRight className="size-4 text-foreground/60 drop-shadow-md" strokeWidth={4} />
              </button>
            )}
          </div>
        </div>
      </div>
    </SubHeaderBarContext.Provider>
  );
}
