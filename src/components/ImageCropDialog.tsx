import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point, Size } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { encodeImage } from '@/lib/resizeImage';

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string;
  aspect: number;
  title?: string;
  /**
   * When true, overlays a dashed circle inscribed in the (square) crop
   * area to preview how the picture is clipped when shown circularly by
   * the `Avatar` primitive (`rounded-full`) elsewhere in the app. This is
   * purely a visual aid — the crop stays rectangular and the encoded
   * output is still the full square image, so clicking a profile picture
   * still shows the whole uncropped photo. Intended for avatars (use with
   * `aspect={1}`). The circle tracks the cropper's actual rendered crop
   * boundary via `onCropSizeChange`, so it stays inscribed even as the
   * boundary resizes responsively.
   */
  showCircleGuide?: boolean;
  /**
   * Cap on the output's long edge, in pixels. When the selected crop
   * region in source-pixel space exceeds this, the canvas downscales with
   * `drawImage`'s built-in bilinear filter. Omit (or pass `0`) to preserve
   * the source-pixel crop size 1:1 — historical behavior, kept as the
   * default so existing callers (avatar/banner in ProfileSettings) aren't
   * silently down-rezzed without opting in.
   */
  maxOutputSize?: number;
  onCancel: () => void;
  /**
   * Receives the cropped result as a `File` (JPEG or PNG, whichever
   * encoded smaller — see `encodeImage` in `@/lib/resizeImage`). The
   * mime/extension on the file reflects the winning format.
   */
  onCrop: (croppedFile: File) => void | Promise<void>;
  /** Called when source decoding/cropping fails before `onCrop` receives a file. */
  onError?: (error: unknown) => void;
}

export function ImageCropDialog({ open, imageSrc, aspect, title = 'Crop Image', showCircleGuide, maxOutputSize, onCancel, onCrop, onError }: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      // Delegate to the shared encoder so cover-image crops pick up the
      // same JPEG-vs-PNG comparison and quality defaults used by the
      // upload paths in ComposeBox / ImageUploadField. JPEG quality stays
      // at the lib default (0.85) — the previous 0.92 was set when this
      // dialog was JPEG-only and not coordinating with the rest of the
      // app's resize pipeline.
      const { file } = await encodeImage(imageSrc, {
        crop: croppedAreaPixels,
        maxOutputSize,
        filename: 'cropped',
      });
      await onCrop(file);
    } catch (error) {
      onError?.(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* Cropper area */}
        <div className="relative bg-black" style={{ height: 320 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onCropSizeChange={showCircleGuide ? setCropSize : undefined}
            style={{
              containerStyle: { borderRadius: 0 },
              cropAreaStyle: { border: '2px solid hsl(var(--primary))' },
            }}
          />
          {showCircleGuide && cropSize && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Dashed circle inscribed in the square crop boundary to
                  preview how the picture is clipped when shown circularly
                  elsewhere. Sized to the cropper's actual rendered crop
                  area (tracked via `onCropSizeChange`) so it sits flush
                  inside the existing crop border at any size. */}
              <div
                className="rounded-full border-2 border-dashed border-white/80"
                style={{ width: cropSize.width, height: cropSize.height }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-3 border-t">
          <div className="flex items-center gap-3">
            <ZoomOut className="size-4 text-muted-foreground shrink-0" />
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              className="flex-1"
            />
            <ZoomIn className="size-4 text-muted-foreground shrink-0" />
          </div>
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs gap-1.5 h-8">
              <RotateCcw className="size-3" />
              Reset
            </Button>
            <p className="text-xs text-muted-foreground">Drag to reposition · Pinch or scroll to zoom</p>
          </div>
        </div>

        <DialogFooter className="px-5 pb-5 gap-2 flex-row justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing} size="sm">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing} size="sm">
            {isProcessing ? 'Processing…' : 'Apply Crop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
