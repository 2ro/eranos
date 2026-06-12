import { useSeoMeta } from '@unhead/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { PolicyMarkdown } from '@/components/PolicyMarkdown';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  useSetVerifierStatement,
  useVerifierStatement,
} from '@/hooks/useVerifierStatement';

export function OrganizationsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const { statement, isLoading } = useVerifierStatement(user?.pubkey);
  const { mutateAsync: setStatement, isPending } = useSetVerifierStatement();

  const [value, setValue] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useSeoMeta({
    title: `${t('organizations.title')} | ${config.appName}`,
    description: t('organizations.subtitle'),
  });

  // Seed the textarea from the published statement once it loads.
  useEffect(() => {
    if (!hydrated && !isLoading) {
      setValue(statement ?? '');
      setHydrated(true);
    }
  }, [hydrated, isLoading, statement]);

  // Logged-out: onboarding help. Instruct the visitor to log in with — or
  // create — their organization's Nostr profile before they can publish a
  // verification statement.
  if (!user) {
    return (
      <main className="min-h-screen pb-16">
        <PageHeader
          backTo="/"
          alwaysShowBack
          contentClassName="max-w-2xl mx-auto w-full sm:px-6"
          title={t('organizations.title')}
        />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="space-y-3">
            <p className="text-base text-muted-foreground leading-relaxed">
              {t('organizations.intro')}
            </p>
          </div>

          <Card>
            <CardContent className="py-12 px-8 flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Building2 className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold">{t('organizations.loginGateTitle')}</h2>
                <p className="text-muted-foreground text-sm">{t('organizations.loginGateBody')}</p>
              </div>
              <LoginArea className="max-w-60" />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const trimmed = value.trim();
  const isPublished = !!statement;
  const unchanged = trimmed === (statement ?? '');

  const handlePublish = async () => {
    try {
      await setStatement(trimmed);
      toast({
        title: trimmed
          ? t('verifier.publishedToast')
          : t('verifier.withdrawnToast'),
      });
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleWithdraw = async () => {
    try {
      await setStatement('');
      setValue('');
      toast({ title: t('verifier.withdrawnToast') });
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <main className="min-h-screen pb-16">
      <PageHeader
        backTo="/"
        alwaysShowBack
        contentClassName="max-w-2xl mx-auto w-full sm:px-6"
        title={t('organizations.title')}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Onboarding intro */}
        <p className="text-base text-muted-foreground leading-relaxed">
          {t('organizations.intro')}
        </p>

        {/* Prompt */}
        <div className="space-y-2">
          <label htmlFor="verifier-statement" className="text-sm font-semibold">
            {t('verifier.promptLabel')}
          </label>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('verifier.prompt')}
          </p>
        </div>

        {isLoading && !hydrated ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('verifier.loading')}
          </div>
        ) : (
          <>
            <Textarea
              id="verifier-statement"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('verifier.placeholder')}
              rows={10}
              className="resize-y text-base"
            />

            {/* Live preview */}
            {trimmed && (
              <Card>
                <CardContent className="py-4 px-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('verifier.previewLabel')}
                  </p>
                  <PolicyMarkdown source={trimmed} />
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handlePublish}
                disabled={isPending || !trimmed || unchanged}
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                {isPublished ? t('verifier.update') : t('verifier.publish')}
              </Button>

              {isPublished && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleWithdraw}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {t('verifier.withdraw')}
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('verifier.disclaimer')}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default OrganizationsPage;
