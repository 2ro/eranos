import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useTor } from '@/hooks/useTor';
import { retryTor } from '@/lib/tor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function AdvancedSettingsPage() {
  const { t } = useTranslation();
  const { config, updateConfig } = useAppContext();
  const tor = useTor();

  useSeoMeta({
    title: `${t('settings.advanced.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.advanced.subtitle'),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        contentClassName="max-w-2xl mx-auto w-full"
        title={t('settings.advanced.title')}
      />

      <div className="p-4 max-w-2xl mx-auto w-full">
        {/* Intro */}
        <p className="px-1 pt-1 pb-4 text-[13px] text-muted-foreground leading-relaxed">
          {t('settings.advanced.intro')}
        </p>

        {/* Tor (Android only). Lives here rather than under Network so it's
            reachable without logging in. The proxy is wired up natively at
            launch, so changes apply on the next app restart. */}
        {tor.supported && (
          <div>
            <div className="relative px-3 py-3.5">
              <h2 className="text-base font-semibold">{t('settings.advanced.torHeading')}</h2>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </div>
            <div className="pt-4 pb-4 px-3 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="tor-enabled" className="text-sm font-medium">
                    {t('settings.advanced.torToggle')}
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t('settings.advanced.torToggleDesc')}
                  </p>
                </div>
                <Switch
                  id="tor-enabled"
                  checked={config.torEnabled}
                  onCheckedChange={(checked) => {
                    updateConfig((prev) => ({ ...prev, torEnabled: checked }));
                    // Start/stop arti now (live) — no page reload, no modal.
                    // Routing is fail-closed, so while connecting, external
                    // content simply won't load (a bottom banner explains why);
                    // the relay layer remounts to reconnect through Tor once
                    // it's up. On disable, arti stops and the proxy is cleared.
                    tor.setEnabled(checked);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('settings.advanced.torApplyNote')}
              </p>
              {config.torEnabled && (
                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground">
                    {t('settings.advanced.torStatusLabel')}{' '}
                    <span className={`font-medium ${tor.status === 'failed' ? 'text-destructive' : 'text-foreground'}`}>
                      {t(`tor.status.${tor.status}`)}
                    </span>
                    {tor.status === 'connecting' && tor.bootstrapPercent > 0
                      ? ` (${tor.bootstrapPercent}%)`
                      : ''}
                  </p>
                  {tor.status === 'connected' && tor.exitIp && (
                    <p className="text-muted-foreground">
                      {t('settings.advanced.torExitIp')}{' '}
                      <span className="font-mono text-foreground">{tor.exitIp}</span>
                    </p>
                  )}
                  {tor.status === 'failed' && tor.error && (
                    <p className="text-destructive leading-relaxed">{tor.error}</p>
                  )}
                  {(tor.status === 'failed' || tor.status === 'connecting') && (
                    <Button variant="outline" size="sm" onClick={() => retryTor()}>
                      {t('settings.advanced.torCheckAgain')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <AdvancedSettings />
      </div>
    </main>
  );
}
