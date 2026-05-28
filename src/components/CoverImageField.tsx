import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ImageCropDialog } from '@/components/ImageCropDialog';
import { Input } from '@/components/ui/input';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Template thumbnail row: each click sets the cover URL to that template's
 * URL. The thumbnail strip is optional — pass `templates` to enable it.
 */
interface CoverImageTemplate {
  id: string;
  /** Sanitized https URL the picker will publish if this template is chosen. */
  url: string;
  /** Display name for `title` / `aria-label`. */
  name: string;
}

interface CoverImageFieldProps {
  /** Current cover URL (controlled). Empty string means "no cover". */
  value: string;
  onChange: (url: string) => void;
  /** Notifies parent forms so they can block submit while Blossom upload runs. */
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * Fires after a successful Blossom upload with the NIP-94-style tag
   * array returned by `useUploadFile`:
   * `[["url", "<url>"], ["x", "<sha256>"], ["ox", "<sha256>"], ["size", "<bytes>"], ["m", "image/jpeg"]]`.
   * Parents that want to publish a paired NIP-92 `imeta` tag in their
   * Nostr event should convert this array — see Kind 33863 publishing.
   */
  onUploadComplete?: (nip94Tags: string[][]) => void;
  /** Optional template gallery shown between the dropzone and the URL input. */
  templates?: readonly CoverImageTemplate[];
  /**
   * Aspect ratio (width / height) the crop dialog enforces. Defaults to
   * `3` (3:1 banner). Pass a different value for non-banner cover surfaces
   * if/when one appears — for now every consumer (campaigns, events,
   * communities, actions) renders the cover at roughly 3:1.
   */
  cropAspect?: number;
  /**
   * Maximum long-edge size (px) of the cropped JPEG. Defaults to `1600`
   * — plenty for 2x retina at typical banner widths while keeping uploads
   * well under 1 MB at q=0.92. Pass `0` to disable the cap.
   *
   * Honored only when the user's `imageQuality` preference is
   * `'compressed'` (the default). Users who opt into `'original'` via
   * Network Settings get the full-resolution crop with no dimension cap,
   * matching the behavior of ComposeBox / ImageUploadField.
   */
  cropMaxOutputSize?: number;
}

/**
 * Unified cover-image affordance shared by CreateActionPage and
 * CreateCampaignPage. Includes:
 *
 * - A dashed dropzone (`<label>`) that accepts both click-to-open and
 *   native drag-and-drop. Both paths funnel through the same MIME check
 *   and `useUploadFile` upload.
 * - An optional template gallery — clicking a thumbnail just sets the
 *   controlled `value`, so the URL input and dropzone preview both
 *   update from a single source of truth.
 * - A plain URL `<Input>` so users can paste any https:// image.
 *
 * The dropzone preview goes through `sanitizeUrl()`, which rejects
 * anything other than a well-formed https URL — that's deliberate, since
 * the same value is what gets published in the Nostr event's `image` tag.
 */
export function CoverImageField({ value, onChange, onUploadingChange, onUploadComplete, templates, cropAspect = 3, cropMaxOutputSize = 1600 }: CoverImageFieldProps) {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  // Crop state holds the object URL of the user's source file while the
  // dialog is open. We revoke it on every exit path (confirm, cancel,
  // unmount) so blob: URLs don't leak across multiple picks.
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const sanitized = sanitizeUrl(value);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  /**
   * Shared entry point for both the file-input change handler and the
   * drag-and-drop handler. Validates the MIME type up front so a stray
   * dragged-in PDF or video doesn't open the cropper, then hands off to
   * `ImageCropDialog`. The actual Blossom upload happens after the user
   * confirms the crop in `handleCropConfirm`.
   */
  const handleSourceFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast({
        title: 'Unsupported file type',
        description: 'Cover image must be PNG, JPG, or WEBP.',
        variant: 'destructive',
      });
      return;
    }
    // Discard any prior object URL before allocating a new one — picking
    // a second file without confirming the first would otherwise leak.
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(URL.createObjectURL(file));
  };

  const handleCropConfirm = async (file: File) => {
    const src = cropImageSrc;
    setCropImageSrc(null);
    if (src) URL.revokeObjectURL(src);
    // The crop dialog hands back a fully-formed File (JPEG or PNG,
    // whichever encoded smaller — see encodeImage in @/lib/resizeImage).
    try {
      const tags = await uploadFile(file);
      const [[, url]] = tags;
      onChange(url);
      // Forward the raw NIP-94 tag array to the parent so it can build a
      // paired NIP-92 imeta tag. The URL inside the tags is what Blossom
      // returned; the parent's `value` may pick up an appended extension
      // via the useUploadFile post-processing, but the sha256 ("x") still
      // identifies the same byte stream.
      if (onUploadComplete) {
        // Replace the URL in the first tag with the extension-corrected
        // value the parent now holds (matches the rendered banner src).
        const adjusted = tags.map((t) => [...t]);
        if (adjusted[0]?.[0] === 'url') adjusted[0][1] = url;
        onUploadComplete(adjusted);
      }
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleCropCancel = () => {
    const src = cropImageSrc;
    setCropImageSrc(null);
    if (src) URL.revokeObjectURL(src);
  };

  // Revoke any lingering object URL on unmount so a navigation-away
  // while the dialog is open doesn't leak the blob.
  useEffect(() => {
    return () => {
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    };
  }, [cropImageSrc]);

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    // Without preventDefault, the browser navigates to the dropped file
    // instead of letting our onDrop handler claim it.
    e.preventDefault();
    if (isUploading) return;
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    // Only clear the highlight when the cursor actually leaves the label.
    // Dragging over a child element fires dragleave on the parent in some
    // browsers, so we re-check relatedTarget.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleSourceFile(file);
  };

  return (
    <>
      <label
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative block h-40 w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-border bg-gradient-to-br from-muted/40 via-background to-muted/20 motion-safe:transition-colors hover:border-primary sm:h-48',
          isDragging && 'border-primary bg-primary/5',
          isUploading && 'opacity-70 pointer-events-none',
        )}
      >
        {sanitized ? (
          <>
            <img
              src={sanitized}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange('');
              }}
              className="absolute top-3 right-3 rounded-full bg-background/85 backdrop-blur p-1.5 hover:bg-background motion-safe:transition-colors"
              aria-label="Remove image"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {isUploading ? (
              <>
                <Loader2 className="size-8 animate-spin" />
                <span className="text-sm">Uploading…</span>
              </>
            ) : (
              <>
                <ImagePlus className="size-8" />
                <span className="text-sm">{t('forms.imageDropzone')}</span>
                <span className="text-xs">PNG, JPG, or WEBP</span>
              </>
            )}
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={isUploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (file) handleSourceFile(file);
          }}
        />
      </label>

      {templates && templates.length > 0 && (
        <div className="relative w-full overflow-hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {templates.map((template) => {
              const isActive = value === template.url;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onChange(template.url)}
                  className={cn(
                    'relative h-20 w-28 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all',
                    isActive
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-border hover:border-primary/50',
                  )}
                  title={template.name}
                  aria-label={`Use ${template.name} cover`}
                >
                  <img
                    src={template.url}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Input
        type="url"
        inputMode="url"
        placeholder="https://imageurl.com/example"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {cropImageSrc && (
        <ImageCropDialog
          open
          imageSrc={cropImageSrc}
          aspect={cropAspect}
          maxOutputSize={config.imageQuality === 'compressed' ? (cropMaxOutputSize || undefined) : undefined}
          title="Crop cover image"
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}
    </>
  );
}
