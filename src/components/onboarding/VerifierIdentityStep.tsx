import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

import { ProfileIdentityEditor } from '@/components/onboarding/ProfileIdentityEditor';
import { Button } from '@/components/ui/button';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import type { ProfileDraft } from '@/lib/profileDraft';

/**
 * The mutable draft of the organization's kind-0 profile, shared across the
 * verifier sub-flow steps (identity here, bio next) and published once at
 * the end. Held by the captive overlay so back-navigation preserves entries.
 *
 * @deprecated Use {@link ProfileDraft} from `@/lib/profileDraft` directly.
 * Retained as a re-export so existing imports keep working.
 */
export type OrgProfileDraft = ProfileDraft;

interface VerifierIdentityStepProps {
  draft: OrgProfileDraft;
  onChange: (patch: Partial<OrgProfileDraft>) => void;
  onContinue: () => void;
}

/**
 * Verifier sub-flow step 1 — the organization's identity.
 *
 * Wraps the shared {@link ProfileIdentityEditor} (circular avatar,
 * rectangular banner, inline name, and a website field that replaces the bio
 * slot). Avatar and name are required; banner and website are optional. When
 * a website is entered, it must be a well-formed `https:` URL.
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
  const [isUploading, setIsUploading] = useState(false);

  const handleChange = useCallback(
    (patch: Partial<OrgProfileDraft>) => onChange(patch),
    [onChange],
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

      <ProfileIdentityEditor
        className={cn(isUploading && 'opacity-50 pointer-events-none')}
        draft={draft}
        onChange={handleChange}
        bioField="website"
        onUploadingChange={setIsUploading}
      />

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
