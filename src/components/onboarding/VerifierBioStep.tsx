import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

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

      {/* Continuity header: who we're writing the bio for. */}
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Avatar className="size-12 shrink-0">
          <AvatarImage src={draft.picture || undefined} alt={displayName} className="object-cover" />
          <AvatarFallback className="bg-primary/15 text-primary font-bold">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold truncate">{displayName}</p>
          {draft.website && (
            <p className="text-xs text-muted-foreground truncate">{draft.website}</p>
          )}
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
