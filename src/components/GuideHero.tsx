import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { HeroAtmosphere } from '@/components/HeroAtmosphere';
import { HeroBanner } from '@/components/HeroBanner';
import { HOPE_PALETTE, type HopeHue } from '@/lib/hopePalette';

interface GuideHeroProps {
  /** Large hero headline. */
  title: string;
  /** Short subtitle under the headline. */
  subtitle: string;
  /** Rotating banner images. Pass at least one. */
  images: readonly string[];
  /**
   * Color palette to cycle through for the atmospheric tint. Defaults
   * to {@link HOPE_PALETTE} (warm). Pass {@link COOL_PALETTE} for the
   * blue/green Organize-style vibe.
   */
  palette?: readonly HopeHue[];
}

/**
 * Compact photo hero shared by the Donor Guide and Recipient Guide pages.
 *
 * Same structural recipe as the Organize / Actions homepage heroes
 * ({@link HeroBanner} + {@link HeroAtmosphere} + scrims + overlay copy),
 * but tuned smaller because these are sub-pages, not primary destinations.
 * Also embeds a "Back to About" link in the top-left as the page's
 * primary navigation out — so a separate sticky bar isn't needed.
 */
export function GuideHero({
  title,
  subtitle,
  images,
  palette = HOPE_PALETTE,
}: GuideHeroProps) {
  // Cycle through the palette on a slow cadence so the photo never
  // feels static even when a single banner image is on screen.
  const [hueIndex, setHueIndex] = useState(0);
  useEffect(() => {
    if (palette.length <= 1) return;
    const id = window.setInterval(() => {
      setHueIndex((i) => (i + 1) % palette.length);
    }, 9_000);
    return () => window.clearInterval(id);
  }, [palette]);

  const activeHue = palette[hueIndex];

  return (
    <section className="relative overflow-hidden border-b border-border bg-secondary/30">
      <HeroBanner images={images} />
      <HeroAtmosphere hue={activeHue} />

      {/* Top + bottom scrims so the overlay text stays legible across
          every photo in the rotation. */}
      <div
        className="absolute inset-x-0 top-0 h-48 sm:h-56 pointer-events-none bg-gradient-to-b from-black/75 via-black/45 to-transparent"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-32 sm:h-40 pointer-events-none bg-gradient-to-t from-black/60 via-black/25 to-transparent"
        aria-hidden="true"
      />

      <div className="relative max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-h-[240px] sm:min-h-[280px] lg:min-h-[320px] flex flex-col">
        {/* Back-to-About action sits on its own row at the top so it
            doubles as both the navigation out and the breadcrumb. */}
        <div>
          <Link
            to="/about"
            className="inline-flex items-center gap-1.5 rounded-full bg-black/30 hover:bg-black/45 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs sm:text-sm font-medium text-white drop-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to About
          </Link>
        </div>

        {/* Headline + subtitle anchored to the bottom of the hero so the
            photo gets room to breathe up top. */}
        <div className="flex-1 min-h-[40px]" aria-hidden="true" />
        <div className="space-y-2 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.55)]">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-white/85 drop-shadow-[0_1px_6px_rgb(0_0_0/0.5)]">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  );
}
