/**
 * Default cap on the long edge (px) for app-wide image resizing.
 * Used by the `resizeImage` convenience wrapper and exposed for callers
 * that want to match the same budget without re-importing the number.
 */
export const MAX_DIMENSION = 1920;

/** Default JPEG quality (0–1) for canvas re-encodes. */
export const JPEG_QUALITY = 0.85;

interface EncodedImage {
  /** The encoded image file (JPEG or PNG, whichever is smaller). */
  file: File;
  /** Pixel dimensions string, e.g. "1920x1080". */
  dimensions: string;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EncodeImageOptions {
  /**
   * Optional source-pixel crop rectangle. When provided the canvas only
   * receives that region of the source — equivalent to the 9-arg
   * `drawImage` form. Defaults to the full image.
   */
  crop?: CropRect;
  /**
   * Cap on the output's long edge in pixels. When the (cropped) source
   * exceeds this, the canvas is sized down with bilinear filtering. Omit
   * or pass `0` for no cap.
   */
  maxOutputSize?: number;
  /**
   * JPEG quality 0–1. Defaults to {@link JPEG_QUALITY} (0.85).
   * Crop callers historically used 0.92; pass that explicitly if you
   * want the higher-quality re-encode.
   */
  jpegQuality?: number;
  /**
   * When true (default), encode both JPEG and PNG and return whichever
   * is smaller — wins on flat-color content like screenshots and logos
   * that JPEG handles poorly. Set false to force JPEG-only.
   */
  compareFormats?: boolean;
  /**
   * Filename to use when wrapping the encoded blob into a `File`. The
   * extension is replaced based on the winning format. Defaults to
   * `'image'`.
   */
  filename?: string;
  /**
   * When true (default) and no `crop` is supplied, skip the canvas
   * re-encode if the source already fits within `maxOutputSize`. The
   * original `File` is returned verbatim — no quality loss, no CPU.
   * Cropping always forces a re-encode regardless.
   */
  passthroughIfWithinBounds?: boolean;
}

/**
 * Canvas-based image re-encoder shared by `resizeImage` (uploads from
 * ComposeBox / ImageUploadField) and `ImageCropDialog` (cover-image
 * cropping). Handles source decode, optional cropping, optional
 * downscaling, dual-format encoding with size comparison, and `File`
 * wrapping in one place so quality knobs don't drift between callers.
 */
export async function encodeImage(
  source: File | Blob | string,
  options: EncodeImageOptions = {},
): Promise<EncodedImage> {
  const {
    crop,
    maxOutputSize,
    jpegQuality = JPEG_QUALITY,
    compareFormats = true,
    filename = 'image',
    passthroughIfWithinBounds = true,
  } = options;

  // Normalize to a Blob for createImageBitmap. Strings are treated as
  // URLs (object URLs from URL.createObjectURL, or any fetchable src).
  const sourceBlob: Blob = typeof source === 'string'
    ? await (await fetch(source)).blob()
    : source;

  const bitmap = await createImageBitmap(sourceBlob);

  try {
    // Determine the source rect we'll draw from. No crop = full image.
    const srcRect: CropRect = crop ?? {
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height,
    };

    // Compute output dimensions: same as source rect, clamped to
    // maxOutputSize on the long edge.
    const longest = Math.max(srcRect.width, srcRect.height);
    const scale = maxOutputSize && longest > maxOutputSize
      ? maxOutputSize / longest
      : 1;
    const outW = Math.max(1, Math.round(srcRect.width * scale));
    const outH = Math.max(1, Math.round(srcRect.height * scale));

    // Short-circuit: when nothing would actually change (no crop,
    // already-within-bounds, source is a real `File`), return the
    // original to avoid a lossy re-encode.
    if (
      passthroughIfWithinBounds &&
      !crop &&
      scale === 1 &&
      source instanceof File
    ) {
      return {
        file: source,
        dimensions: `${bitmap.width}x${bitmap.height}`,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Higher-quality resampling for downscales. Safari/Chrome both
    // honor this for the 9-arg drawImage form.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      bitmap,
      srcRect.x,
      srcRect.y,
      srcRect.width,
      srcRect.height,
      0,
      0,
      outW,
      outH,
    );

    // Encode and pick the winner. When compareFormats is false we skip
    // the PNG path entirely (saves the parallel encode pass).
    const encodes: Promise<Blob>[] = [canvasToBlob(canvas, 'image/jpeg', jpegQuality)];
    if (compareFormats) encodes.push(canvasToBlob(canvas, 'image/png'));
    const [jpegBlob, pngBlob] = await Promise.all(encodes);

    const useJpeg = !pngBlob || jpegBlob.size <= pngBlob.size;
    const best = useJpeg
      ? { blob: jpegBlob, ext: '.jpg', mime: 'image/jpeg' as const }
      : { blob: pngBlob, ext: '.png', mime: 'image/png' as const };

    const baseName = typeof source === 'object' && 'name' in source && source.name
      ? source.name
      : filename;

    return {
      file: new File([best.blob], replaceExtension(baseName, best.ext), { type: best.mime }),
      dimensions: `${outW}x${outH}`,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Resize an image file so its longest side is at most {@link MAX_DIMENSION}
 * pixels, and encode it in the smallest format between JPEG and PNG.
 *
 * Thin wrapper over {@link encodeImage} preserved for existing callers
 * (ComposeBox, ImageUploadField). If the image already fits within the
 * dimension limit, the original file is returned unchanged.
 */
export async function resizeImage(file: File): Promise<EncodedImage> {
  return encodeImage(file, { maxOutputSize: MAX_DIMENSION });
}

/** Promisified `canvas.toBlob`. */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Failed to encode ${type}`))),
      type,
      quality,
    );
  });
}

/** Replace or append a file extension. */
function replaceExtension(filename: string, ext: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base + ext;
}
