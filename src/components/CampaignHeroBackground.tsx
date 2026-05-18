import { useEffect, useRef, useState } from 'react';

import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
interface CampaignHeroBackgroundProps {
  /**
   * Image URL for the active campaign. Each new URL crossfades over the
   * previous one — we keep up to two layers mounted at a time so the
   * transition is smooth even when the source changes mid-fade.
   */
  imageUrl: string | undefined;
  /** Optional className for the outer wrapper. */
  className?: string;
}

interface Layer {
  /** Stable key so React doesn't tear down the layer mid-transition. */
  id: number;
  /** Sanitized URL (or `null` for the gradient-only fallback). */
  url: string | null;
}

const FADE_MS = 1500;

/**
 * Full-bleed crossfading background built from the active campaign's banner
 * image. Modelled after Treasures' HeroGallery: each image gets its own
 * stacked layer and we toggle opacity to crossfade. The previous layer
 * unmounts after the fade completes, so we never accumulate more than a
 * couple of layers in the DOM.
 *
 * A warm tint + subtle film-grain SVG sit on top so headlines stay readable
 * over any photo.
 */
export function CampaignHeroBackground({ imageUrl, className }: CampaignHeroBackgroundProps) {
  const idRef = useRef(0);
  const [layers, setLayers] = useState<Layer[]>([]);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const safe = sanitizeUrl(imageUrl) ?? null;
    if (safe === lastUrlRef.current) return;
    lastUrlRef.current = safe;

    const id = ++idRef.current;
    // Add the new layer; existing layers stay mounted so the crossfade has
    // something to fade from.
    setLayers((prev) => [...prev, { id, url: safe }]);

    // After the fade completes, drop everything except the most recent
    // layer to keep the DOM tidy.
    const timeout = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, FADE_MS + 50);
    return () => window.clearTimeout(timeout);
  }, [imageUrl]);

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      {layers.map((layer, i) => {
        const isTop = i === layers.length - 1;
        return (
          <div
            key={layer.id}
            className="absolute inset-0"
            style={{
              opacity: isTop ? 1 : 0,
              transition: `opacity ${FADE_MS}ms ease-in-out`,
            }}
          >
            {layer.url ? (
              <img
                src={layer.url}
                alt=""
                loading="eager"
                decoding="async"
                // Slow continuous pan toward the left — pairs with the
                // right-anchored globe so the scene reads as moving toward
                // the headline copy.
                className="absolute inset-0 w-full h-full object-cover hero-pan-left"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-secondary/40" />
            )}
          </div>
        );
      })}

      {/* Warm tint + dark gradient — keeps foreground text legible without
          completely washing the photo out. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/55 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-secondary/30" />

      {/* Film grain — same trick as Treasures' HeroGallery. Helps the
          composited globe + photo feel like one image. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.18 }}
      >
        <filter id="hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>
    </div>
  );
}
