import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomSettings } from '@/components/BlossomSettings';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';

const DEFAULT_IMAGE_PROXY = 'https://wsrv.nl';

export function NetworkSettingsPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  useSeoMeta({
    title: `${t('settings.network.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.network.subtitle'),
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const uploadQualityOptions = [
    { value: 'compressed', labelKey: 'settings.network.compressed' },
    { value: 'original', labelKey: 'settings.network.original' },
  ] as const;

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">{t('settings.network.title')} <HelpTip faqId="what-is-nostr" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.network.subtitle')}
            </p>
          </div>
        }
      />

      <div className="p-4 max-w-2xl mx-auto w-full space-y-7">
        {/* Intro */}
        <div className="px-1 pt-1">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t('settings.network.connectionsHeading')}</h2>
          <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
            {t('settings.network.connectionsIntro')}
          </p>
        </div>

        {/* Low-Bandwidth Mode */}
        <section>
          <h2 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t('settings.network.lowBandwidthHeading')}</h2>
          <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="low-bandwidth" className="text-[15px] font-medium">
                  {t('settings.network.reduceDataUsage')}
                </Label>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {t('settings.network.reduceDataUsageDesc')}
                </p>
              </div>
              <Switch
                id="low-bandwidth"
                checked={config.lowBandwidthMode}
                onCheckedChange={(checked) =>
                  updateConfig((prev) => ({ ...prev, lowBandwidthMode: checked }))
                }
              />
            </div>

            {/* Image Proxy — independent of Low-Bandwidth. Controls whether
                images are fetched from a downsizing proxy. */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="image-proxy" className="text-[15px] font-medium">
                    {t('settings.network.useImageProxy')}
                  </Label>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {t('settings.network.useImageProxyDesc')}
                  </p>
                </div>
                <Switch
                  id="image-proxy"
                  checked={!!config.imageProxy}
                  onCheckedChange={(checked) =>
                    updateConfig((prev) => ({
                      ...prev,
                      imageProxy: checked ? DEFAULT_IMAGE_PROXY : '',
                    }))
                  }
                />
              </div>

              {config.imageProxy && (
                <div className="space-y-2">
                  <Label htmlFor="image-proxy-url" className="text-xs font-medium text-muted-foreground">
                    {t('settings.network.proxyUrl')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="image-proxy-url"
                      type="url"
                      value={config.imageProxy}
                      onChange={(e) =>
                        updateConfig((prev) => ({ ...prev, imageProxy: e.target.value }))
                      }
                      placeholder={DEFAULT_IMAGE_PROXY}
                      className="font-mono text-xs"
                    />
                    {config.imageProxy !== DEFAULT_IMAGE_PROXY && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateConfig((prev) => ({ ...prev, imageProxy: DEFAULT_IMAGE_PROXY }))
                        }
                      >
                        {t('settings.network.reset')}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <Trans
                      i18nKey="settings.network.proxyApiDesc"
                      components={{
                        0: (
                          <a
                            href="https://github.com/weserv/images"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          />
                        ),
                      }}
                    />
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Relays */}
        <section>
          <h2 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">{t('settings.network.relays')} <HelpTip faqId="what-are-relays" /></h2>
          <RelayListManager />
        </section>

        {/* Blossom Servers */}
        <section>
          <h2 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">{t('settings.network.blossomServers')} <HelpTip faqId="what-are-blossom" /></h2>
          <BlossomSettings />
        </section>

        {/* Image Upload Quality */}
        <section>
          <h2 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t('settings.network.imageUploads')}</h2>
          <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[15px] font-medium">{t('settings.network.uploadQuality')}</Label>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {t('settings.network.uploadQualityDesc')}
              </p>
            </div>
            <div className="inline-flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
              {uploadQualityOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateConfig((prev) => ({ ...prev, imageQuality: option.value }))}
                  className={cn(
                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                    config.imageQuality === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
