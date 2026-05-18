import { cn } from '@/lib/utils';
import { customFlagAsset } from '@/lib/customFlags';

interface CountryFlagProps {
  /**
   * ISO 3166-1 alpha-2 country code (e.g. `US`, `BR`) or ISO 3166-2
   * subdivision code (e.g. `CN-XZ`, `GB-SCT`). Case-insensitive.
   */
  code: string;
  /** The flag emoji to render when no custom asset is available. */
  emoji: string;
  /** Accessible label / `alt` for the flag. */
  label: string;
  /** Optional extra classes applied to the rendering element. */
  className?: string;
}

/**
 * Render a flag for a country or subdivision. For codes with a bundled
 * SVG (currently Tibet) we emit an `<img>` that visually matches the
 * surrounding emoji line-height; for everything else we drop the emoji
 * straight into a `<span>` so it inherits font color and selection
 * behaviour like the rest of the text run.
 *
 * Callers control sizing via Tailwind classes — pass `text-3xl` to size
 * the emoji and the SVG will scale to match (`h-[1em] w-auto`).
 */
export function CountryFlag({ code, emoji, label, className }: CountryFlagProps) {
  const customAsset = customFlagAsset(code);

  if (customAsset) {
    return (
      // The wrapper span carries the font-size class so the inner image
      // can size itself in `em` units and stay in lockstep with the
      // emoji glyphs on neighbouring chips. A thin border + tiny radius
      // keeps the SVG reading as a *flag* and not a colored rectangle
      // when it's shrunk down inside a small chip.
      <span
        className={cn('inline-flex items-center leading-none', className)}
        role="img"
        aria-label={label}
      >
        <img
          src={customAsset}
          alt=""
          aria-hidden="true"
          className="inline-block h-[1em] w-auto rounded-[2px] align-middle ring-1 ring-black/10 dark:ring-white/15 shadow-sm"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={cn('leading-none select-none', className)}
      role="img"
      aria-label={label}
    >
      {emoji}
    </span>
  );
}
