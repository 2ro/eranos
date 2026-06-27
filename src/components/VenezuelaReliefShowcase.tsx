import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { useVenezuelaReliefCampaigns } from '@/hooks/useVenezuelaReliefCampaigns';
import type { ParsedCampaign } from '@/lib/campaign';
import { cn } from '@/lib/utils';

interface VenezuelaReliefShowcaseProps {
  /**
   * `overlay` — heading in white + edge fades to the dark hero background,
   * for the banner / page hero. `default` — foreground heading + edge fades
   * to `bg-background`, for a light section surface.
   */
  variant?: 'overlay' | 'default';
  className?: string;
  /** Optional id for scroll-into-view targeting (page "Donate" CTA). */
  id?: string;
  /**
   * Pixels-per-second pan speed for the auto-scroll marquee. Keep it slow —
   * the rail should feel ambient, not demanding. Defaults to 24 px/s.
   */
  pxPerSecond?: number;
}

const CARD_WIDTH_CLASS = 'w-[300px]';

/**
 * Horizontal auto-scrolling "marquee" of every Venezuela-located campaign
 * tagged for relief (`humanitarian-aid` / `emergency-relief`) created since
 * the earthquake, resolved live via {@link useVenezuelaReliefCampaigns}.
 * Shared by the home hero ({@link VenezuelaReliefBanner}) and the dedicated
 * page ({@link VenezuelaReliefPage}).
 *
 * Interaction model (ported from the surveil deck shelf):
 *
 *   - Pans on its own at `pxPerSecond`; the campaign list is duplicated in
 *     the DOM so the track wraps at -50% with no visible jump.
 *   - Hover / focus pauses the pan so clicking a card isn't a moving target.
 *   - Click-drag / swipe scrubs the rail, with a short momentum coast on
 *     release; a travel threshold suppresses the click so a drag never
 *     accidentally navigates into a card.
 *   - Honors `prefers-reduced-motion`: the track sits still and becomes a
 *     native horizontal scroll container so content stays reachable.
 *   - Soft gradient fades on both edges so cards dissolve in and out rather
 *     than hitting a hard cutoff.
 *
 * Renders nothing once loaded if no campaigns match, so the surrounding
 * appeal copy and CTAs carry the surface alone.
 */
export function VenezuelaReliefShowcase({
  variant = 'default',
  className,
  id,
  pxPerSecond = 24,
}: VenezuelaReliefShowcaseProps) {
  const { t } = useTranslation();
  const { isLoading, campaigns } = useVenezuelaReliefCampaigns();

  const isOverlay = variant === 'overlay';

  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Pan offset and pause flag live in refs so hover (or any pause flip)
  // doesn't restart the rAF effect and reset motion to 0.
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);

  // Drag / swipe state — all refs so gestures never trigger re-renders.
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const dragTravelRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const lastDragXRef = useRef(0);
  const lastDragTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const momentumRafRef = useRef(0);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Clamp offset within one full copy of the pool (seamless-loop invariant).
  const clampOffset = useCallback((raw: number): number => {
    const el = trackRef.current;
    if (!el) return raw;
    const half = el.scrollWidth / 2;
    if (half <= 0) return raw;
    let clamped = raw;
    if (-clamped >= half) clamped += half;
    if (clamped > 0) clamped -= half;
    return clamped;
  }, []);

  // rAF loop: pan leftward, wrap at -50%. Writes transform directly to the
  // DOM so motion stays smooth across surrounding re-renders.
  useEffect(() => {
    if (reduceMotion) return;
    const el = trackRef.current;
    if (!el) return;
    if (campaigns.length === 0) return;

    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) {
        offsetRef.current -= pxPerSecond * dt;
        const half = el.scrollWidth / 2;
        if (half > 0 && -offsetRef.current >= half) {
          offsetRef.current += half;
        }
        el.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pxPerSecond, campaigns.length, reduceMotion]);

  // ── Drag / swipe handlers ──────────────────────────────────────────────
  const onDragStart = useCallback(
    (clientX: number, pointerId: number | null) => {
      if (reduceMotion) return;
      cancelAnimationFrame(momentumRafRef.current);
      isDraggingRef.current = true;
      pausedRef.current = true;
      dragStartXRef.current = clientX;
      dragStartOffsetRef.current = offsetRef.current;
      dragTravelRef.current = 0;
      lastDragXRef.current = clientX;
      lastDragTimeRef.current = performance.now();
      velocityRef.current = 0;
      // Capture lazily in onDragMove once a real drag is confirmed —
      // capturing on pointerdown re-targets the click and breaks the
      // child <Link> navigation.
      pointerIdRef.current = pointerId;
    },
    [reduceMotion],
  );

  const onDragMove = useCallback(
    (clientX: number) => {
      if (!isDraggingRef.current) return;
      if (
        pointerIdRef.current !== null &&
        viewportRef.current &&
        dragTravelRef.current <= 4 &&
        Math.abs(clientX - dragStartXRef.current) > 4
      ) {
        viewportRef.current.setPointerCapture(pointerIdRef.current);
      }
      const delta = clientX - dragStartXRef.current;
      offsetRef.current = clampOffset(dragStartOffsetRef.current + delta);
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      }
      dragTravelRef.current += Math.abs(clientX - lastDragXRef.current);
      const now = performance.now();
      const dt = now - lastDragTimeRef.current;
      if (dt > 0) {
        velocityRef.current = ((clientX - lastDragXRef.current) / dt) * 1000;
      }
      lastDragXRef.current = clientX;
      lastDragTimeRef.current = now;
    },
    [clampOffset],
  );

  const onDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Reset travel next frame so the click guard works for this drag but
    // doesn't bleed into future taps.
    requestAnimationFrame(() => {
      dragTravelRef.current = 0;
    });

    let v = velocityRef.current;
    const FRICTION = 0.92;
    const coast = () => {
      v *= FRICTION;
      if (Math.abs(v) < 1) {
        pausedRef.current = false;
        return;
      }
      offsetRef.current = clampOffset(offsetRef.current + v / 60);
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      }
      momentumRafRef.current = requestAnimationFrame(coast);
    };
    momentumRafRef.current = requestAnimationFrame(coast);
  }, [clampOffset]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      onDragStart(e.clientX, e.pointerId);
    },
    [onDragStart],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => onDragMove(e.clientX),
    [onDragMove],
  );
  const handlePointerUp = useCallback(() => onDragEnd(), [onDragEnd]);
  const handlePointerCancel = useCallback(() => {
    isDraggingRef.current = false;
    pausedRef.current = false;
    cancelAnimationFrame(momentumRafRef.current);
  }, []);

  // Suppress the click that fires at the end of a drag that travelled more
  // than a few pixels, so swiping never navigates into a card.
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragTravelRef.current > 4) e.preventDefault();
  }, []);

  // Once loaded with no matches, render nothing — the appeal copy stands
  // on its own rather than leaving an empty "Relief campaigns" header.
  if (!isLoading && campaigns.length === 0) return null;

  const doubledPool: ParsedCampaign[] =
    campaigns.length > 0 ? [...campaigns, ...campaigns] : campaigns;

  const fadeFrom = isOverlay ? 'from-black/60' : 'from-background';

  return (
    <section
      id={id}
      aria-label={t('campaigns.home.venezuelaRelief.showcaseTitle')}
      className={cn('scroll-mt-20 space-y-4', className)}
    >
      <h2
        className={cn(
          'text-lg sm:text-xl font-bold tracking-tight',
          isOverlay
            ? 'text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]'
            : 'text-foreground',
        )}
      >
        {t('campaigns.home.venezuelaRelief.showcaseTitle')}
      </h2>

      <div
        ref={viewportRef}
        className={cn(
          'relative -mx-4 sm:mx-0',
          reduceMotion
            ? 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'overflow-hidden',
          !reduceMotion && 'cursor-grab active:cursor-grabbing',
          'select-none',
        )}
        onMouseEnter={() => {
          if (!isDraggingRef.current) pausedRef.current = true;
        }}
        onMouseLeave={() => {
          if (!isDraggingRef.current) pausedRef.current = false;
        }}
        onFocusCapture={() => {
          pausedRef.current = true;
        }}
        onBlurCapture={() => {
          if (!isDraggingRef.current) pausedRef.current = false;
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        style={reduceMotion ? undefined : { touchAction: 'pan-y' }}
      >
        {/* Edge fades — absolutely-positioned gradient panels (a CSS mask
            gets bypassed by descendants with their own stacking context,
            e.g. the cards' hover transform). pointer-events-none so they
            don't swallow card clicks. */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-20 z-20 bg-gradient-to-r to-transparent',
            fadeFrom,
          )}
        />
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-20 z-20 bg-gradient-to-l to-transparent',
            fadeFrom,
          )}
        />

        <div
          ref={trackRef}
          className={cn(
            'flex items-stretch gap-4 px-4 sm:px-6 pb-2 w-max',
            !reduceMotion && 'will-change-transform',
          )}
        >
          {isLoading && campaigns.length === 0
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={cn('shrink-0', CARD_WIDTH_CLASS)}>
                  <CampaignCardSkeleton />
                </div>
              ))
            : doubledPool.map((campaign, i) => (
                <div
                  key={i < campaigns.length ? campaign.aTag : `${campaign.aTag}-dup`}
                  aria-hidden={i >= campaigns.length ? true : undefined}
                  className={cn('shrink-0', CARD_WIDTH_CLASS)}
                >
                  <CampaignCard campaign={campaign} variant="compact" />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

export default VenezuelaReliefShowcase;
