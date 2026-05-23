import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';
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
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  useSeoMeta({
    title: `Network | Settings | ${config.appName}`,
    description: 'Manage relays and file upload servers',
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">Network <HelpTip faqId="what-is-nostr" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage data usage, relays, and file upload servers.
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Low-Bandwidth Mode */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">Low-Bandwidth Mode</h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-4 pb-4 px-3 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="low-bandwidth" className="text-sm font-medium">
                  Reduce data usage
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For metered or slow connections. Videos won't autoplay,
                  background video previews are skipped, and images wait for
                  a tap before loading.
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
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="image-proxy" className="text-sm font-medium">
                    Use image proxy
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Fetches smaller WebP versions of images instead of full-resolution
                    originals.
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
                    Proxy URL
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
                        Reset
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Must speak the{' '}
                    <a
                      href="https://github.com/weserv/images"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      wsrv.nl / weserv
                    </a>{' '}
                    API. Self-hosters can point this at their own instance.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Relays */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">Relays <HelpTip faqId="what-are-relays" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-2 pb-4">
            <RelayListManager />
          </div>
        </div>

        {/* Blossom Servers */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">Blossom Servers <HelpTip faqId="what-are-blossom" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-2 pb-4">
            <BlossomSettings />
          </div>
        </div>

        {/* Image Upload Quality */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">Image Uploads</h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-4 pb-4 px-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Upload quality</Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Compressed resizes large images and picks the smallest format. Original uploads images exactly as-is.
              </p>
            </div>
            <div className="inline-flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
              {(['compressed', 'original'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => updateConfig((prev) => ({ ...prev, imageQuality: value }))}
                  className={cn(
                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize',
                    config.imageQuality === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
