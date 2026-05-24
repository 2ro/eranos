import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { PolicyMarkdown } from '@/components/PolicyMarkdown';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { usePolicyMarkdown } from '@/hooks/usePolicyMarkdown';

export function CSAEPolicyPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { markdown, isLoading, error } = usePolicyMarkdown('csae');

  useSeoMeta({
    title: `${t('policyPages.csae.seoTitle')} | ${config.appName}`,
    description: t('policyPages.csae.seoDescription', { appName: config.appName }),
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title={t('policyPages.csae.title')} icon={<ShieldAlert className="size-5" />} backTo="/" />

      <article className="px-4 pb-8">
        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-32 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : markdown ? (
          <PolicyMarkdown source={markdown} values={{ appName: config.appName }} />
        ) : null}
      </article>
    </main>
  );
}
