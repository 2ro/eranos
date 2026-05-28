import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Loader2, Upload, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { resizeImage } from '@/lib/resizeImage';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface ImageUploadFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  placeholder?: string;
  uploadText?: string;
  uploadingText?: string;
  uploadToastTitle?: string;
  previewAlt?: string;
  objectFit?: 'cover' | 'contain';
  className?: string;
  dropAreaClassName?: string;
  disabled?: boolean;
}

export function ImageUploadField({
  id,
  label,
  value,
  onChange,
  onUploadingChange,
  placeholder = 'Paste an image URL, or upload above',
  uploadText = 'Paste, drop, or click to upload an image',
  uploadingText = 'Uploading image...',
  uploadToastTitle = 'Image uploaded',
  previewAlt = 'Image preview',
  objectFit = 'cover',
  className,
  dropAreaClassName,
  disabled,
}: ImageUploadFieldProps) {
  const { config } = useAppContext();
  const { toast } = useToast();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = sanitizeUrl(value);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file.', variant: 'destructive' });
      return;
    }

    try {
      const uploadableFile = config.imageQuality === 'compressed'
        ? (await resizeImage(file)).file
        : file;
      const [[, url]] = await uploadFile(uploadableFile);
      onChange(url);
      toast({ title: uploadToastTitle });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [config.imageQuality, onChange, toast, uploadFile, uploadToastTitle]);

  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || disabled) return;

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      void handleImageFile(file);
      return;
    }
  }, [disabled, handleImageFile]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleImageFile(file);
  }, [disabled, handleImageFile]);

  const clearImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [onChange]);

  return (
    <div className={cn('space-y-1.5', className)} onPaste={handleImagePaste}>
      <Label htmlFor={id}>{label}</Label>
      <div>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => {
            if (!disabled) imageInputRef.current?.click();
          }}
          onDrop={handleImageDrop}
          onDragOver={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) imageInputRef.current?.click();
          }}
          className={cn(
            'relative flex min-h-28 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-t-xl border border-b-0 border-dashed border-border bg-secondary/20 text-center transition-colors hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled && 'cursor-not-allowed opacity-60',
            dropAreaClassName,
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-xs">{uploadingText}</span>
            </div>
          ) : previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt={previewAlt}
                className={cn('absolute inset-0 h-full w-full', objectFit === 'contain' ? 'object-contain p-3' : 'object-cover')}
              />
              <button
                type="button"
                aria-label="Remove image"
                onClick={clearImage}
                disabled={disabled}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-muted-foreground shadow-sm transition-colors hover:text-destructive disabled:opacity-60"
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-muted-foreground">
              <Upload className="size-5" />
              <span className="text-xs">{uploadText}</span>
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImageFile(file);
            }}
          />
        </div>
        <Input
          id={id}
          type="url"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-t-none rounded-b-xl"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
