import { useTranslation } from 'react-i18next';

/**
 * Section wrapper used by the long single-column form pages
 * (`CreateActionPage`, `CreateCampaignPage`). Each section is a titled
 * `<section>` with a small muted requirement badge so users can scan the
 * form at a glance for "what do I have to fill in?".
 */
export function FormSection({
  title,
  requirement,
  children,
}: {
  title: React.ReactNode;
  requirement: 'Required' | 'Recommended' | 'Optional';
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const requirementLabel = {
    Required: t('forms.required'),
    Recommended: t('forms.recommended'),
    Optional: t('forms.optional'),
  }[requirement];
  return (
    <section className="space-y-2.5 rounded-xl p-3 sm:p-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title}
          <span className="text-xs font-medium text-muted-foreground">
            {requirementLabel}
          </span>
        </h2>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
