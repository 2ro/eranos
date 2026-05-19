import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Template thumbnail row: each click sets the cover URL to that template's
 * URL. The thumbnail strip is optional — pass `templates` to enable it.
 */
export interface CoverImageTemplate {
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
  /** Optional template gallery shown between the dropzone and the URL input. */
  templates?: readonly CoverImageTemplate[];
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
export function CoverImageField({ value, onChange, onUploadingChange, templates }: CoverImageFieldProps) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  const sanitized = sanitizeUrl(value);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  /**
   * Shared upload path used by both the file-input change handler and
   * the drag-and-drop handler. Validates the MIME type up front so a
   * stray dragged-in PDF or video doesn't end up posted to Blossom.
   */
  const uploadCoverFile = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast({
        title: 'Unsupported file type',
        description: 'Cover image must be PNG, JPG, or WEBP.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const [[, url]] = await uploadFile(file);
      onChange(url);
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

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

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadCoverFile(file);
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
                <span className="text-sm">Click or drag an image here</span>
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
            if (file) void uploadCoverFile(file);
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
        placeholder="Or paste an https:// image URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
