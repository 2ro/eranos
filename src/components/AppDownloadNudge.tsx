import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { ZAPSTORE_URL } from '@/lib/zapstore';

/**
 * Zapstore download nudge — prompts mobile-web visitors to install the native
 * Android app. Hidden inside the native app (you're already in it) and on
 * desktop (`sm:hidden`), where downloading works differently.
 */
export function AppDownloadNudge() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  if (Capacitor.isNativePlatform()) return null;

  return (
    <div className="sm:hidden px-4 pt-8 pb-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        {t('feed.getApp.eyebrow')}
      </p>
      <div className="flex items-center gap-3">
        <img
          src="/logo.png"
          alt={config.appName}
          className="h-10 w-10 shrink-0 rounded-xl"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {t('feed.getApp.title', { appName: config.appName })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('feed.getApp.subtitle', { appName: config.appName })}
          </p>
        </div>
        <a
          href={ZAPSTORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
        >
          {t('feed.getApp.download')}
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
