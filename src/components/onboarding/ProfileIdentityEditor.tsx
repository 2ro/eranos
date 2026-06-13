import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProfileCard } from '@/components/ProfileCard';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { fetchImageAsFile } from '@/lib/proxyImageUrl';

/**
 * The mutable kind-0 identity fields this editor manages. The host owns the
 * draft; the editor only emits patches.
 */
export interface ProfileIdentityDraft {
  /** kind-0 `name` (and `display_name`). */
  name: string;
  /** kind-0 `picture` (avatar) — a Blossom URL. */
  picture: string;
  /** kind-0 `banner` — a Blossom URL. */
  banner: string;
  /** kind-0 `website`. Used when `bioField` is `'website'`. */
  website: string;
  /** kind-0 `about` (bio). Used when `bioField` is `'about'`. */
  about: string;
}

/** Which image field the crop dialog is currently editing. */
type CropField = 'picture' | 'banner';

/** Aspect ratios: circular avatar crops square; banner crops 3:1. */
const CROP_ASPECT: Record<CropField, number> = {
  picture: 1,
  banner: 3,
};

interface ProfileIdentityEditorProps {
  draft: ProfileIdentityDraft;
  onChange: (patch: Partial<ProfileIdentityDraft>) => void;
  /**
   * Which kind-0 field the editable text slot below the name edits:
   * `'website'` for organizations, `'about'` (bio) for campaigners, or
   * `'none'` to show just the name.
   */
  bioField: 'website' | 'about' | 'none';
  /** Placeholder for the bio textarea when `bioField` is `'about'`. */
  aboutPlaceholder?: string;
  /** Show the banner area (default true). */
  showBanner?: boolean;
  /** Notifies the host of upload progress so it can gate its primary button. */
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
}

/**
 * Shared editable identity card: banner, circular avatar, inline name, and a
 * configurable bio/website slot, with the full upload → crop → Blossom flow
 * (local file picker + paste-URL) and image removal. Used by the verifier
 * (organization) onboarding step and the campaign-creator wizard so both
 * surfaces present an identical identity-editing experience.
 *
 * Nothing is published here; patches flow back through `onChange` and the
 * host decides when to persist.
 */
export function ProfileIdentityEditor({
  draft,
  onChange,
  bioField,
  aboutPlaceholder,
  showBanner = true,
  onUploadingChange,
  className,
}: ProfileIdentityEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { config } = useAppContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFieldRef = useRef<CropField | null>(null);
  const [cropState, setCropState] = useState<{
    field: CropField;
    imageSrc: string;
    objectUrl: boolean;
  } | null>(null);

  // Open the OS file picker for the requested image field.
  const handlePickImage = useCallback((field: CropField) => {
    pendingFieldRef.current = field;
    fileInputRef.current?.click();
  }, []);

  // Read an image URL from the clipboard, validate it, then fetch its bytes
  // (through the image proxy so the request is CORS-safe) into an object URL.
  // From there it joins the exact same crop → Blossom-upload flow as a local
  // file — the cropper only ever sees a same-origin `blob:` source, so the
  // canvas never taints and arbitrary remote hosts / SVGs work.
  const handlePasteUrl = useCallback(
    async (field: CropField) => {
      let text = '';
      try {
        text = (await navigator.clipboard.readText()).trim();
      } catch {
        toast({
          title: t('onboarding.verifier.identity.clipboardFailed'),
          variant: 'destructive',
        });
        return;
      }

      const url = sanitizeUrl(text);
      if (!url) {
        toast({
          title: t('onboarding.verifier.identity.pasteUrlInvalid'),
          variant: 'destructive',
        });
        return;
      }

      let file: File;
      try {
        file = await fetchImageAsFile(
          url,
          config.imageProxy,
          field === 'banner' ? 1500 : 1024,
        );
      } catch (error) {
        toast({
          title: t('onboarding.verifier.identity.pasteUrlFetchFailed'),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
        return;
      }

      setCropState({
        field,
        imageSrc: URL.createObjectURL(file),
        objectUrl: true,
      });
    },
    [config.imageProxy, t, toast],
  );

  const handleFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const field = pendingFieldRef.current;
      pendingFieldRef.current = null;
      if (!file || !field) return;

      if (!file.type.startsWith('image/')) {
        toast({ title: t('onboarding.profile.imageOnly'), variant: 'destructive' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: t('onboarding.profile.imageTooLarge'), variant: 'destructive' });
        return;
      }

      const imageSrc = URL.createObjectURL(file);
      setCropState({ field, imageSrc, objectUrl: true });
    },
    [t, toast],
  );

  const handleCropCancel = useCallback(() => {
    if (cropState?.objectUrl) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  }, [cropState]);

  const handleCropConfirm = useCallback(
    async (croppedFile: File) => {
      if (!cropState) return;
      const { field, imageSrc, objectUrl } = cropState;
      if (objectUrl) URL.revokeObjectURL(imageSrc);
      setCropState(null);
      onUploadingChange?.(true);
      try {
        const tags = await uploadFile(croppedFile);
        const url = tags[0]?.[1];
        if (url) onChange({ [field]: url });
      } catch {
        toast({ title: t('onboarding.profile.uploadFailed'), variant: 'destructive' });
      } finally {
        onUploadingChange?.(false);
      }
    },
    [cropState, uploadFile, onChange, onUploadingChange, t, toast],
  );

  const handleCropError = useCallback(
    (error: unknown) => {
      toast({
        title: t('onboarding.profile.uploadFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
    [t, toast],
  );

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />

      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={CROP_ASPECT[cropState.field]}
          title={
            cropState.field === 'picture'
              ? t('onboarding.verifier.identity.cropAvatar')
              : t('onboarding.verifier.identity.cropBanner')
          }
          maxOutputSize={cropState.field === 'banner' ? 1500 : 512}
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
          onError={handleCropError}
        />
      )}

      <ProfileCard
        className="rounded-none border-0 bg-transparent"
        metadata={{
          name: draft.name,
          website: draft.website,
          about: draft.about,
          picture: draft.picture,
          banner: draft.banner,
        }}
        onChange={(patch) => {
          if (patch.name !== undefined) onChange({ name: patch.name });
          if (patch.website !== undefined) onChange({ website: patch.website as string });
          if (patch.about !== undefined) onChange({ about: patch.about });
        }}
        onPickImage={handlePickImage}
        onPasteUrl={handlePasteUrl}
        onRemoveAvatar={() => onChange({ picture: '' })}
        onRemoveBanner={() => onChange({ banner: '' })}
        bioField={bioField}
        aboutPlaceholder={aboutPlaceholder}
        showBanner={showBanner}
        showNip05={false}
        showBadges={false}
      />
    </div>
  );
}

export default ProfileIdentityEditor;
