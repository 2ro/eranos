import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { MilkdownEditor } from '@/components/markdown/MilkdownEditor';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useVerifierStatement } from '@/hooks/useVerifierStatement';
import { cn } from '@/lib/utils';

interface VerifierStatementEditorProps {
  /** Current markdown value (controlled). */
  value: string;
  onChange: (value: string) => void;
  /** Hydration callback — fired once with the user's existing statement. */
  onHydrated?: (statement: string) => void;
  /** Show a Withdraw control (only when a statement is already published). */
  showWithdraw?: boolean;
  onWithdraw?: () => void;
  isWithdrawing?: boolean;
  className?: string;
}

/**
 * The verifier-statement (kind 14672) markdown editing surface.
 *
 * A controlled, borderless WYSIWYG editor: the host owns the value and the
 * publish action (publishing is wired to the onboarding step's primary
 * button). The editor only renders the editing surface, hydrating once from
 * the user's existing statement, plus an optional inline Withdraw control.
 */
export function VerifierStatementEditor({
  value,
  onChange,
  onHydrated,
  showWithdraw = false,
  onWithdraw,
  isWithdrawing = false,
  className,
}: VerifierStatementEditorProps) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { statement, isLoading } = useVerifierStatement(user?.pubkey);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && !isLoading) {
      onChange(statement ?? '');
      onHydrated?.(statement ?? '');
      setHydrated(true);
    }
  }, [hydrated, isLoading, statement, onChange, onHydrated]);

  if (isLoading && !hydrated) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="size-4 animate-spin" />
        {t('verifier.loading')}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Muted, borderless WYSIWYG markdown editor that matches the "Tell us
          about your organization" bio box on the previous step — same muted
          fill, no border until focus, and the same min height. */}
      <div
        className={cn(
          'rounded-lg border-2 border-transparent bg-muted/40 overflow-hidden transition-colors duration-150',
          'hover:bg-muted/60 hover:border-border',
          'focus-within:bg-transparent focus-within:border-primary',
        )}
      >
        <MilkdownEditor
          className="verifier-statement-editor"
          value={value}
          onChange={onChange}
          placeholder={t('verifier.placeholder')}
        />
      </div>

      {showWithdraw && onWithdraw && (
        <Button
          type="button"
          variant="ghost"
          onClick={onWithdraw}
          disabled={isWithdrawing}
          className="text-destructive hover:text-destructive px-0"
        >
          {isWithdrawing && <Loader2 className="size-4 animate-spin mr-2" />}
          {t('verifier.withdraw')}
        </Button>
      )}
    </div>
  );
}

export default VerifierStatementEditor;
