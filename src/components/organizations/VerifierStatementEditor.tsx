import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { MilkdownEditor } from '@/components/markdown/MilkdownEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  useSetVerifierStatement,
  useVerifierStatement,
} from '@/hooks/useVerifierStatement';
import { cn } from '@/lib/utils';

interface VerifierStatementEditorProps {
  className?: string;
  /**
   * Called after a non-empty statement has been published or updated, and
   * with `false` after a withdrawal. Lets hosts (e.g. the captive onboarding
   * flow) react to publish state — for instance, enabling a "Next" button.
   */
  onPublishedChange?: (isPublished: boolean) => void;
}

/**
 * The functional verifier-statement editor (kind 14672): a WYSIWYG Markdown
 * surface with publish / update / withdraw controls and a live hydrate from
 * the user's existing statement.
 *
 * Extracted from OrganizationsPage so both the public /organizations tool
 * and the captive verifier onboarding flow render the exact same editor and
 * stay in sync. Assumes a logged-in user; callers gate on auth.
 */
export function VerifierStatementEditor({
  className,
  onPublishedChange,
}: VerifierStatementEditorProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const { statement, isLoading } = useVerifierStatement(user?.pubkey);
  const { mutateAsync: setStatement, isPending } = useSetVerifierStatement();

  const [value, setValue] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && !isLoading) {
      setValue(statement ?? '');
      setHydrated(true);
    }
  }, [hydrated, isLoading, statement]);

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
      onPublishedChange?.(!!trimmed);
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
      onPublishedChange?.(false);
    } catch (error) {
      toast({
        title: t('verifier.errorToast'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className={cn('border-border/60 shadow-sm', className)}>
      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Prompt */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t('verifier.promptLabel')}</p>
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
            {/* WYSIWYG markdown editor: formatting toolbar + rich-text
                editing surface, value flows back out as markdown. */}
            <div className="rounded-lg border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
              <MilkdownEditor
                value={value}
                onChange={setValue}
                placeholder={t('verifier.placeholder')}
              />
            </div>

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
      </CardContent>
    </Card>
  );
}

export default VerifierStatementEditor;
