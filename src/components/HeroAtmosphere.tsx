import { useEffect, useRef, useState } from 'react';

import { hopeHueFor, type HopeHue } from '@/lib/hopePalette';
import { cn } from '@/lib/utils';

interface HeroAtmosphereProps {
  /**
   * Stable seed for the current campaign — typically the campaign's
   * `aTag`. The same seed always picks the same hue from
   * {@link HOPE_PALETTE}. Pass `null`/`undefined` when no campaign is
   * spotlit and the atmosphere will default to the first palette entry.
   *
   * Ignored when `hue` is provided. Optional only when `hue` is given;
   * the campaign hero still depends on seed-based selection.
   */
  seed?: string | undefined | null;
  /**
   * Explicit hue override. When set, the atmosphere skips seed-based
   * palette selection and crossfades whenever this hue changes. Use this
   * when the page already rotates hues itself (e.g. the Organize hero
   * cycles a cool palette every few seconds) or when the seed-derived
   * warm palette is the wrong vibe.
   */
  hue?: HopeHue;
  /** Crossfade duration in milliseconds. Defaults to the campaign hero timing. */
  fadeMs?: number;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

interface AtmosphereLayer {
  /** Render-order id so React doesn't tear the layer down mid-fade. */
  id: number;
  hue: HopeHue;
}

/** Has to match {@link CampaignHeroBackground}'s FADE_MS so the entire
 * hero transitions as a single moment instead of in two staggered steps. */
const FADE_MS = 1500;

/**
 * Soft, hue-tinted "sunrise" atmosphere layer for the campaigns hero.
 *
 * Two layered gradients sit on top of the photo background:
 *  - a left-to-right warm scrim that gives the headline area an emotional
 *    color cast, and
 *  - a large soft radial glow centered on the headline that reads as a
 *    sunrise / dawn light pooling behind the text.
 *
 * The hue is derived from {@link hopeHueFor} so every campaign gets a
 * stable, slightly different warm color. When the active campaign
 * changes we mount a fresh layer with the new hue and crossfade it over
 * the old one, matching the timing of the photo crossfade so the whole
 * hero blooms together.
 */
export function HeroAtmosphere({ seed, hue: hueOverride, fadeMs = FADE_MS, className }: HeroAtmosphereProps) {
  const idRef = useRef(0);
  const [layers, setLayers] = useState<AtmosphereLayer[]>([]);
  const lastHueRef = useRef<string | null>(null);

  useEffect(() => {
    const hue = hueOverride ?? hopeHueFor(seed ?? null);
    if (hue.name === lastHueRef.current) return;
    lastHueRef.current = hue.name;

    const id = ++idRef.current;
    setLayers((prev) => [...prev, { id, hue }]);

    // Drop everything except the most recent layer once the crossfade is
    // safely past, so the DOM never accumulates stale gradients.
    const timeout = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, fadeMs + 50);
    return () => window.clearTimeout(timeout);
  }, [seed, hueOverride, fadeMs]);

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)} aria-hidden="true">
      {layers.map((layer, i) => {
        const isTop = i === layers.length - 1;
        return (
          <div
            key={layer.id}
            className="absolute inset-0"
            style={{
              opacity: isTop ? 1 : 0,
              transition: `opacity ${fadeMs}ms ease-in-out`,
            }}
          >
            {/* Warm directional scrim — pulls the photo toward the active
                hue without flattening it. Anchored on the left so the
                headline area gets the strongest tint. */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(115deg, ${layer.hue.scrim} 0%, transparent 60%)`,
              }}
            />

            {/* Big soft radial glow — reads as dawn light pooling behind
                the headline. mix-blend-screen so it lightens warmly
                instead of just adding a flat color. */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(45rem 32rem at 20% 35%, ${layer.hue.glow} 0%, transparent 70%)`,
                mixBlendMode: 'screen',
              }}
            />

            {/* Thin sliver of sunrise light along the top edge. Subtle —
                you should feel it more than see it. */}
            <div
              className="absolute inset-x-0 top-0 h-1/3"
              style={{
                backgroundImage: `linear-gradient(to bottom, ${layer.hue.rim} 0%, transparent 100%)`,
                mixBlendMode: 'screen',
                opacity: 0.55,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
