import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

import { ProfileCard } from '@/components/ProfileCard';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadFile } from '@/hooks/useUploadFile';
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
 * rectangular banner, inline name + website fields) plus the shared
 * {@link ImageCropDialog} for uploads. All four fields — name, website,
 * avatar, banner — are required before the user can continue. The website
 * must be a well-formed `https:` URL.
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFieldRef = useRef<CropField | null>(null);
  const [cropState, setCropState] = useState<{
    field: CropField;
    imageSrc: string;
  } | null>(null);

  // Open the OS file picker for the requested image field.
  const handlePickImage = useCallback((field: CropField) => {
    pendingFieldRef.current = field;
    fileInputRef.current?.click();
  }, []);

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
      setCropState({ field, imageSrc });
    },
    [t, toast],
  );

  const handleCropCancel = useCallback(() => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  }, [cropState]);

  const handleCropConfirm = useCallback(
    async (croppedFile: File) => {
      if (!cropState) return;
      const { field, imageSrc } = cropState;
      URL.revokeObjectURL(imageSrc);
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

  // ── Continue gating ──────────────────────────────────────────────────────
  const nameProvided = draft.name.trim().length > 0;
  const websiteValid = !!sanitizeUrl(draft.website.trim());
  const websiteTouched = draft.website.trim().length > 0;
  const avatarProvided = draft.picture.trim().length > 0;
  const bannerProvided = draft.banner.trim().length > 0;
  const canContinue =
    nameProvided && websiteValid && avatarProvided && bannerProvided && !isUploading;

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
        />
      )}

      <div className={cn(isUploading && 'opacity-50 pointer-events-none')}>
        <ProfileCard
          metadata={{
            name: draft.name,
            picture: draft.picture,
            banner: draft.banner,
          }}
          onChange={(patch) => {
            if (patch.name !== undefined) onChange({ name: patch.name });
          }}
          onPickImage={handlePickImage}
          showNip05={false}
          showBadges={false}
        />
      </div>

      {/* Website — a first-class required field for organizations, so it
          gets its own labeled input rather than living in ProfileCard's
          collapsible extra-fields section. */}
      <div className="space-y-1.5">
        <Label htmlFor="verifier-org-website" className="text-sm font-medium">
          {t('onboarding.verifier.identity.websiteLabel')}
        </Label>
        <Input
          id="verifier-org-website"
          type="url"
          inputMode="url"
          value={draft.website}
          onChange={(e) => onChange({ website: e.target.value })}
          placeholder="https://your-org.org"
          aria-required
          aria-invalid={websiteTouched && !websiteValid}
        />
        {websiteTouched && !websiteValid && (
          <p className="text-xs text-destructive">
            {t('onboarding.verifier.identity.websiteInvalid')}
          </p>
        )}
      </div>

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
