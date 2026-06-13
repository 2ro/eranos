import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

import { ProfileCard } from '@/components/ProfileCard';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { Button } from '@/components/ui/button';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useImageProxy } from '@/hooks/useImageProxy';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * The mutable draft of the organization's kind-0 profile, shared across the
 * verifier sub-flow steps (identity here, bio next) and published once at
 * the end. Held by the captive overlay so back-navigation preserves entries.
 */
export interface OrgProfileDraft {
  /** Maps to kind-0 `name` (and `display_name`). */
  name: string;
  /** Maps to kind-0 `website`. */
  website: string;
  /** Maps to kind-0 `picture` (avatar) — a Blossom URL. */
  picture: string;
  /** Maps to kind-0 `banner` — a Blossom URL. */
  banner: string;
  /** Maps to kind-0 `about` (collected in the bio step). */
  about: string;
}

/** Which image field the crop dialog is currently editing. */
type CropField = 'picture' | 'banner';

/** Aspect ratios: circular avatar crops square; banner crops 3:1. */
const CROP_ASPECT: Record<CropField, number> = {
  picture: 1,
  banner: 3,
};

interface VerifierIdentityStepProps {
  draft: OrgProfileDraft;
  onChange: (patch: Partial<OrgProfileDraft>) => void;
  onContinue: () => void;
}

/**
 * Verifier sub-flow step 1 — the organization's identity.
 *
 * Reuses the app's editable {@link ProfileCard} (circular avatar,
 * rectangular banner, inline name, and a website field that replaces the bio
 * slot) plus the shared {@link ImageCropDialog} for uploads. Avatar and name
 * are required; banner and website are optional. When a website is entered,
 * it must be a well-formed `https:` URL.
 *
 * Nothing is published here; the draft is published as a single kind-0 event
 * at the end of the sub-flow, so stepping back and forth never republishes.
 */
export function VerifierIdentityStep({
  draft,
  onChange,
  onContinue,
}: VerifierIdentityStepProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const proxyImage = useImageProxy();

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

  // Read an image URL from the clipboard, validate it, and route it through
  // the same crop/upload flow as local files.
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

      setCropState({
        field,
        imageSrc: proxyImage(url, field === 'banner' ? 1500 : 512),
        objectUrl: false,
      });
    },
    [proxyImage, t, toast],
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
      try {
        const tags = await uploadFile(croppedFile);
        const url = tags[0]?.[1];
        if (url) onChange({ [field]: url });
      } catch {
        toast({ title: t('onboarding.profile.uploadFailed'), variant: 'destructive' });
      }
    },
    [cropState, uploadFile, onChange, t, toast],
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

  // ── Continue gating ──────────────────────────────────────────────────────
  // Avatar + name are required; banner is optional. Website is optional too,
  // but if entered it must be a valid https URL.
  const nameProvided = draft.name.trim().length > 0;
  const avatarProvided = draft.picture.trim().length > 0;
  const websiteTouched = draft.website.trim().length > 0;
  const websiteValid = !websiteTouched || !!sanitizeUrl(draft.website.trim());
  const canContinue = nameProvided && avatarProvided && websiteValid && !isUploading;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {t('onboarding.verifier.identity.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('onboarding.verifier.identity.subtitle')}
        </p>
      </div>

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

      <div className={cn(isUploading && 'opacity-50 pointer-events-none')}>
        <ProfileCard
          className="rounded-none border-0 bg-transparent"
          metadata={{
            name: draft.name,
            website: draft.website,
            picture: draft.picture,
            banner: draft.banner,
          }}
          onChange={(patch) => {
            if (patch.name !== undefined) onChange({ name: patch.name });
            if (patch.website !== undefined) {
              onChange({ website: patch.website as string });
            }
          }}
          onPickImage={handlePickImage}
          onPasteUrl={handlePasteUrl}
          bioField="website"
          showNip05={false}
          showBadges={false}
        />
      </div>

      {/* Website is optional, but if entered it must be a valid https URL. */}
      {websiteTouched && !websiteValid && (
        <p className="text-xs text-destructive">
          {t('onboarding.verifier.identity.websiteInvalid')}
        </p>
      )}

      {isUploading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('onboarding.verifier.identity.uploading')}
        </div>
      )}

      <Button
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full h-12 text-base rounded-full"
      >
        {t('common.continue')}
        <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
      </Button>
    </div>
  );
}

export default VerifierIdentityStep;
