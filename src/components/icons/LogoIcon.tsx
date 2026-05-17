import React from 'react';

/**
 * Agora brand mark, drawn as a filled double-bolt silhouette in `currentColor`.
 *
 * Sized and proportioned like a lucide icon (24×24 viewBox, 22-unit artwork
 * with a 1-unit margin), but filled instead of stroked so it reads cleanly at
 * small sizes. Coordinates are the original 720×880 `AgoraBoltIcon` paths
 * scaled and re-centered.
 *
 * Used as the Feed sidebar icon.
 */
export const LogoIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M13.4 1 3 11.4l7.1 7.2 1.6-5.9H7.7z" />
      <path d="M13.8 4.2 12.1 10.5h4.1L9.5 23 21 11.4z" />
    </svg>
  ),
);

LogoIcon.displayName = 'LogoIcon';
