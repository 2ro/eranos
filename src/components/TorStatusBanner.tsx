import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { useTor } from '@/hooks/useTor';
import { retryTor } from '@/lib/tor';

/**
 * Slim, non-blocking, app-wide banner shown while Tor is enabled but not yet
 * connected (Android only).
 *
 * Routing is fail-closed, so external content can't load — and can't leak —
 * until Tor connects. This tells the user that wherever they are in the app
 * (so switching away from Settings still surfaces the state). It replaces the
 * old full-screen gate.
 */
export function TorStatusBanner() {
  const { config } = useAppContext();
  const { supported, status, bootstrapPercent, error } = useTor();
  const { t } = useTranslation();

  if (!supported || !config.torEnabled || status === 'connected') {
    return null;
  }

  const failed = status === 'failed';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-50 safe-area-bottom border-t px-4 py-2 ${
        failed
          ? 'border-destructive bg-destructive text-destructive-foreground'
          : 'border-amber-600 bg-amber-500 text-black'
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 text-xs">
        {failed ? (
          <ShieldAlert className="size-4 shrink-0" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        )}
        <span className="flex-1 leading-snug">
          {failed
            ? error || t('tor.banner.failed')
            : t('tor.banner.connecting') +
              (bootstrapPercent > 0 ? ` (${bootstrapPercent}%)` : '')}
        </span>
        {failed && (
          <button
            type="button"
            onClick={() => retryTor()}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            {t('tor.banner.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export default TorStatusBanner;
