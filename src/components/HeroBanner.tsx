import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Default rotation: photos from past World Liberty Congress events, used
 * by the Organize / Communities hero. Each image lives in
 * `/public/hero/wlc-N.webp` and is referenced by absolute path so the
 * browser caches them across navigations and `<link rel="preload">` can
 * pick them up if we ever add it.
 *
 * Other pages can pass their own list via the `images` prop (e.g. the
 * Actions hero rotates through the action cover gallery).
 */
const DEFAULT_BANNER_IMAGES: readonly string[] = [
  '/hero/wlc-1.webp',
  '/hero/wlc-2.webp',
];

interface HeroBannerProps {
  /**
   * Ordered list of image URLs to rotate through. Defaults to the
   * Organize hero's WLC photos. Pass at least one URL; if the list has
   * a single entry the banner renders it as a still image.
   */
  images?: readonly string[];
  /** Optional className for the outer wrapper. */
  className?: string;
  /**
   * Time between crossfades, in ms. Defaults to 7s — long enough for
   * faces to register, short enough that the page never feels static.
   */
  intervalMs?: number;
}

interface Layer {
  /** Stable key so React doesn't tear the layer down mid-transition. */
  id: number;
  /** URL of the image rendered on this layer. */
  url: string;
  /**
   * Whether this layer has been flipped to its visible opacity. A new
   * layer mounts with `entered: false` (opacity 0) and is flipped to
   * `true` on the next animation frame so the CSS opacity transition
   * actually fires — without this two-step the browser paints the layer
   * straight at its final opacity and the crossfade looks instant.
   */
  entered: boolean;
}

const FADE_MS = 1500;

/**
 * Full-bleed crossfading banner of event photos. Modelled after
 * {@link CampaignHeroBackground}: each new image gets its own stacked
 * layer and we toggle opacity to crossfade. The previous layer unmounts
 * after the fade completes so the DOM never accumulates more than two
 * `<img>` elements.
 *
 * The component is self-driving — it advances through `images` on a
 * fixed interval and stops the timer when `prefers-reduced-motion` is
 * set, leaving the first image as a static banner.
 */
export function HeroBanner({
  images = DEFAULT_BANNER_IMAGES,
  className,
  intervalMs = 7_000,
}: HeroBannerProps) {
  const [index, setIndex] = useState(0);
  const idRef = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() =>
    images.length > 0 ? [{ id: 0, url: images[0], entered: true }] : [],
  );

  // Honor the user's reduced-motion preference. We freeze the rotation
  // and let the first image act as a still banner.
  const reducedMotion = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Advance the index on a fixed interval. We deliberately keep this
  // separate from the layer effect below so swapping the interval (e.g.
  // for tests) doesn't force a full crossfade restart.
  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      if (reducedMotion.current) return;
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images, intervalMs]);

  // Whenever the active index changes, push a new layer on top. The
  // layer mounts hidden (`entered: false`) and is flipped visible on the
  // next animation frame so the opacity transition animates instead of
  // snapping. Old layers are reaped after the crossfade completes.
  useEffect(() => {
    if (images.length === 0) return;
    const url = images[index % images.length];
    const id = ++idRef.current;
    setLayers((prev) => [...prev, { id, url, entered: false }]);

    const raf = window.requestAnimationFrame(() => {
      // Second frame guarantees the browser has painted the layer at
      // opacity 0 before we transition it to 1.
      window.requestAnimationFrame(() => {
        setLayers((prev) =>
          prev.map((l) => (l.id === id ? { ...l, entered: true } : l)),
        );
      });
    });

    const timeout = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, FADE_MS + 50);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [index, images]);

  // Preload the next image during idle time so the next crossfade
  // doesn't blink. Cheap — the browser will dedupe with the eventual
  // <img> request once the layer mounts.
  useEffect(() => {
    if (images.length <= 1) return;
    const next = images[(index + 1) % images.length];
    const img = new Image();
    img.decoding = 'async';
    img.src = next;
  }, [index, images]);

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      {layers.map((layer) => {
        return (
          <div
            key={layer.id}
            className="absolute inset-0"
            style={{
              opacity: layer.entered ? 1 : 0,
              transition: `opacity ${FADE_MS}ms ease-in-out`,
            }}
          >
            <img
              src={layer.url}
              alt=""
              // First image eager so the hero never starts empty; the
              // rest can wait until they're scheduled to come in.
              loading={layer.id === 0 ? 'eager' : 'lazy'}
              decoding="async"
              // Subtle slow pan — same keyframe used by the campaigns
              // hero — so each photo feels alive on its turn instead of
              // sitting frozen for 7 seconds.
              className="absolute inset-0 w-full h-full object-cover hero-pan-left"
            />
          </div>
        );
      })}
    </div>
  );
}
