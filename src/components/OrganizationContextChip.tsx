import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OrganizationContextChipProps {
  /** The org `A` tag coordinate currently attached to this draft (or empty). */
  aTag: string;
  /**
   * The org entry resolved from the `?org=` query parameter when the
   * current user is authorized to publish under it (founder or moderator).
   * `null` when the param is missing, malformed, or points at an org the
   * user can't publish under.
   */
  authorizedOrg: { community: { aTag: string; name: string } } | null;
  /** The raw `?org=` value from the URL (used to decide which message to show). */
  param: string | null;
  /** The decoded `?org=` result. `null` when the value didn't parse. */
  paramDecoded: { aTag: string } | null;
  /** True while `useManageableOrganizations` is still resolving. */
  manageableLoading: boolean;
  /**
   * When true, the chip is rendered for an *edit* flow — show whatever
   * org the existing event is already attached to (no permission checks
   * here, because we may not have the user's manageable orgs cached).
   */
  isEditMode?: boolean;
}

/**
 * Small inline indicator surfaced under the create form's title when
 * the create flow was initiated from inside an organization. The chip
 * is deliberately uncontrolled — there's no UI to clear, change, or
 * attach an org from the create page. The user attaches by entering
 * the create flow from inside the org's page, and detaches by entering
 * it from outside.
 *
 * Shared between CreateCampaignPage and CreateActionPage.
 */
export function OrganizationContextChip({
  aTag,
  authorizedOrg,
  param,
  paramDecoded,
  manageableLoading,
  isEditMode = false,
}: OrganizationContextChipProps) {
  const { t } = useTranslation();

  // Edit mode: surface the org the event is already attached to. No
  // permission check here — the underlying publish flow re-resolves the
  // user's authority before emitting the tags.
  if (isEditMode) {
    if (!aTag) return null;
    return (
      <div className="mt-3 flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-primary shadow-sm">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Users className="size-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide">{t('organizationContext.attachedToGroup')}</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {authorizedOrg?.community.name ?? t('organizationContext.groupFallback')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('organizationContext.editSubtext')}
          </p>
        </div>
      </div>
    );
  }

  // Create mode, no `?org=` in the URL: personal publication. Render
  // nothing — the absence of the chip is the indicator.
  if (!param) return null;

  // `?org=` present but malformed.
  if (!paramDecoded) {
    return (
      <p className="mt-2 w-full text-xs text-muted-foreground">
        {t('organizationContext.malformedParam')}
      </p>
    );
  }

  // `?org=` present and valid, but we haven't resolved the user's
  // authorization yet. Don't claim "publishing under" until we know.
  if (manageableLoading) {
    return (
      <div className="mt-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {t('organizationContext.checkingPermissions')}
      </div>
    );
  }

  // `?org=` present and valid, but the current user isn't a founder or
  // moderator of that org. Drop silently so a stale link can't forge
  // an org-tagged event.
  if (!authorizedOrg) {
    return (
      <p className="mt-2 w-full text-xs text-muted-foreground">
        {t('organizationContext.unauthorized')}
      </p>
    );
  }

  return (
    <div className="mt-3 flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-primary shadow-sm">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Users className="size-4" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide">{t('organizationContext.publishingAsGroup')}</p>
        <p className="truncate text-sm font-semibold text-foreground">{authorizedOrg.community.name}</p>
      </div>
    </div>
  );
}
