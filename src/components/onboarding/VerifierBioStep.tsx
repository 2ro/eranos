import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { OrgProfileDraft } from '@/components/onboarding/VerifierIdentityStep';

interface VerifierBioStepProps {
  draft: OrgProfileDraft;
  onChange: (patch: Partial<OrgProfileDraft>) => void;
  onContinue: () => void;
  /** True while the kind-0 profile is being published on continue. */
  isPublishing?: boolean;
}

/**
 * Verifier sub-flow step 2 — the organization's bio (kind-0 `about`).
 *
 * A single required textarea. The bio is added to the shared draft;
 * publishing of the assembled kind-0 profile happens when this step's
 * continue handler runs (wired in the gate).
 */
export function VerifierBioStep({
  draft,
  onChange,
  onContinue,
  isPublishing = false,
}: VerifierBioStepProps) {
  const { t } = useTranslation();

  const bioProvided = draft.about.trim().length > 0;
  const canContinue = bioProvided && !isPublishing;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {t('onboarding.verifier.bio.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('onboarding.verifier.bio.subtitle')}
        </p>
      </div>

      <div>
        <Textarea
          id="verifier-org-bio"
          value={draft.about}
          onChange={(e) => onChange({ about: e.target.value })}
          placeholder={t('onboarding.verifier.bio.placeholder')}
          className="min-h-[400px] resize-none p-3 text-lg leading-7 md:text-lg"
          aria-required
        />
      </div>

      <Button
        onClick={onContinue}
        disabled={!canContinue}
        className={cn('w-full h-12 text-base rounded-full')}
      >
        {isPublishing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('onboarding.verifier.bio.publishing')}
          </>
        ) : (
          <>
            {t('common.continue')}
            <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
          </>
        )}
      </Button>
    </div>
  );
}

export default VerifierBioStep;
