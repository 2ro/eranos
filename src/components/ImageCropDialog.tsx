import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { encodeImage } from '@/lib/resizeImage';
import { cn } from '@/lib/utils';

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string;
  aspect: number;
  title?: string;
  /**
   * Cap on the output's long edge, in pixels. When the selected crop
   * region in source-pixel space exceeds this, the canvas downscales with
   * `drawImage`'s built-in bilinear filter. Omit (or pass `0`) to preserve
   * the source-pixel crop size 1:1 — historical behavior, kept as the
   * default so existing callers (avatar/banner in ProfileSettings) aren't
   * silently down-rezzed without opting in.
   */
  maxOutputSize?: number;
  /** Hide the crop selection outline. */
  hideCropBorder?: boolean;
  /** Render the dialog container itself with sharp corners and no border. */
  sharpContainer?: boolean;
  onCancel: () => void;
  /**
   * Receives the cropped result as a `File` (JPEG or PNG, whichever
   * encoded smaller — see `encodeImage` in `@/lib/resizeImage`). The
   * mime/extension on the file reflects the winning format.
   */
  onCrop: (croppedFile: File) => void;
}

export function ImageCropDialog({ open, imageSrc, aspect, title = 'Crop Image', maxOutputSize, hideCropBorder = false, sharpContainer = false, onCancel, onCrop }: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
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
      onCrop(file);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className={cn('sm:max-w-lg p-0 gap-0 overflow-hidden', sharpContainer && 'rounded-none border-0')}>
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
            style={{
              containerStyle: { borderRadius: 0 },
              cropAreaStyle: {
                border: hideCropBorder ? '0' : '2px solid hsl(var(--primary))',
                borderRadius: 0,
              },
            }}
          />
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
