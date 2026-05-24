

/** Default aspect ratio when dim tag is missing or unparseable. */
const DEFAULT_ASPECT_RATIO = 1;

/** Parse a dim string like "1280x720" into a width/height aspect ratio number. */
export function parseDimToAspectRatio(dim?: string): number {
  if (!dim) return DEFAULT_ASPECT_RATIO;
  const match = dim.match(/^(\d+)x(\d+)$/);
  if (!match) return DEFAULT_ASPECT_RATIO;
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (!w || !h) return DEFAULT_ASPECT_RATIO;
  return w / h;
}

