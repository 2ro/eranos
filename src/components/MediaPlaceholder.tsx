import { ImageIcon } from 'lucide-react';
import { Blurhash } from 'react-blurhash';

import { isValidBlurhash } from '@/lib/blurhash';
import { cn } from '@/lib/utils';

interface MediaPlaceholderProps {
  /** Optional blurhash from the event's imeta tag. Rendered if valid. */
  blurhash?: string;
  /** Reveal handler. The whole placeholder is a button. */
  onReveal: () => void;
  /** Accessible label for the reveal button. Defaults to "Load image". */
  label?: string;
  /** Optional extra classes for the outer button — set the container size. */
  className?: string;
  /** Aspect ratio (`width / height`) when the container is unsized. */
  aspectRatio?: number;
}

/**
 * Tap-to-load placeholder used by low-bandwidth mode when the image proxy
 * is disabled (or has failed). Shows a blurhash if one is available,
 * otherwise a muted background, with a centered icon and "Load image" label.
 *
 * Fills its parent (`w-full h-full`) with a `min-h-[200px]` floor so it's
 * always tappable. Rendered as a `<div role="button">` rather than a real
 * `<button>` because consumers often mount it inside another button
 * (e.g. NoteContent.InlineImage's lightbox trigger) — nested `<button>`
 * elements are invalid HTML.
 */
export function MediaPlaceholder({
  blurhash,
  onReveal,
  label = 'Load image',
  className,
  aspectRatio,
}: MediaPlaceholderProps) {
  const hasBlurhash = blurhash && isValidBlurhash(blurhash);

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onReveal();
  };

  return (
    // Rendered as a div (not a button) because this component is often
    // mounted inside another <button> — e.g. NoteContent.InlineImage wraps
    // images in a click-to-open-lightbox button. Nested <button> elements
    // are invalid HTML and render inconsistently across browsers.
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      aria-label={label}
      className={cn(
        'relative flex w-full h-full min-h-[200px] items-center justify-center overflow-hidden bg-muted cursor-pointer',
        'transition-colors hover:bg-muted/80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
    >
      {hasBlurhash && (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}
      <div className="relative z-10 flex items-center gap-2 rounded-full bg-background/80 px-3.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm">
        <ImageIcon className="size-3.5" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
