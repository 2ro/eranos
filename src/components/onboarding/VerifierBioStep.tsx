import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import type { OrgProfileDraft } from '@/components/onboarding/VerifierIdentityStep';

interface VerifierBioStepProps {
  draft: OrgProfileDraft;
  /** The pubkey of the freshly created account, for the avatar fallback. */
  pubkey?: string;
  onChange: (patch: Partial<OrgProfileDraft>) => void;
  onContinue: () => void;
  /** True while the kind-0 profile is being published on continue. */
  isPublishing?: boolean;
}

/**
 * Verifier sub-flow step 2 — the organization's bio (kind-0 `about`).
 *
 * A single required textarea, with a small avatar + name preview header
 * carried over from the identity step so the flow feels continuous. The bio
 * is added to the shared draft; publishing of the assembled kind-0 profile
 * happens when this step's continue handler runs (wired in the gate).
 */
export function VerifierBioStep({
  draft,
  pubkey,
  onChange,
  onContinue,
  isPublishing = false,
}: VerifierBioStepProps) {
  const { t } = useTranslation();

  const displayName = draft.name.trim() || genUserName(pubkey);
  const initial = displayName[0]?.toUpperCase() ?? '?';
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

      {/* Preview: how this org will appear when it verifies a campaign —
          mirrors the inline verification badge (stacked avatar + check)
          so the user sees how their logo and name surface to donors. */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground text-center">
          {t('onboarding.verifier.bio.previewLabel')}
        </p>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1.5 pr-3 shadow-sm">
            <Avatar className="size-6 shrink-0 ring-2 ring-background">
              <AvatarImage
                src={draft.picture || undefined}
                alt={displayName}
                className="object-cover"
              />
              <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <BadgeCheck className="size-4 text-sky-500" />
            <span className="max-w-[12rem] truncate text-sm font-semibold">
              {displayName}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="verifier-org-bio" className="text-sm font-medium">
          {t('onboarding.verifier.bio.label')}
        </Label>
        <Textarea
          id="verifier-org-bio"
          value={draft.about}
          onChange={(e) => onChange({ about: e.target.value })}
          placeholder={t('onboarding.verifier.bio.placeholder')}
          className="min-h-32 resize-none"
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
