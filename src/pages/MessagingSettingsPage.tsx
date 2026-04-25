import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';
import { DMStatusInfo } from '@samthomson/nostr-messaging/ui';
import { PROTOCOL_MODE, RELAY_MODE, useDMContext, type ProtocolMode, type RelayMode } from '@samthomson/nostr-messaging/core';
import { IntroImage } from '@/components/IntroImage';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import type { AppConfig } from '@/contexts/AppContext';

type MessagingSettings = NonNullable<AppConfig['messaging']>;

const DEFAULT_MESSAGING: MessagingSettings = {
  enabled: true,
  relayMode: RELAY_MODE.HYBRID,
  protocolMode: PROTOCOL_MODE.NIP17_ONLY,
  renderInlineMedia: true,
  soundEnabled: false,
  devMode: false,
};

export function MessagingSettingsPage() {
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { clearCacheAndRefetch } = useDMContext();

  useSeoMeta({
    title: `Messages | Settings | ${config.appName}`,
    description: 'Configure direct messaging behavior and compatibility.',
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const messaging: MessagingSettings = {
    ...DEFAULT_MESSAGING,
    ...(config.messaging ?? {}),
  };

  const isNip04CompatibilityEnabled = messaging.protocolMode !== PROTOCOL_MODE.NIP17_ONLY;

  const applyMessagingPatch = async (patch: Partial<MessagingSettings>) => {
    const nextMessaging: MessagingSettings = { ...messaging, ...patch };
    updateConfig((current) => ({
      ...current,
      messaging: nextMessaging,
    }));
    await updateSettings.mutateAsync({ messaging: nextMessaging });
  };

  return (
    <main>
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={(
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure direct messaging behavior, relay strategy, and compatibility.
            </p>
          </div>
        )}
      />

      <div className="p-4 space-y-6">
        <div className="flex items-center gap-4 px-3 pt-2 pb-2">
          <IntroImage src="/messaging-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Direct Messaging</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Control DM sync, protocol compatibility, and rendering preferences.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Messaging</CardTitle>
            <CardDescription>Enable or disable the direct message experience.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="messaging-enabled">Enable messaging</Label>
                <p className="text-sm text-muted-foreground">
                  Turn chats on to use inbox sync and conversations.
                </p>
              </div>
              <Switch
                id="messaging-enabled"
                checked={messaging.enabled ?? true}
                onCheckedChange={(checked) => {
                  void applyMessagingPatch({ enabled: checked });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {(messaging.enabled ?? true) && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Protocol</CardTitle>
                <CardDescription>Compatibility with older Nostr clients.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="nip04-compat">Enable NIP-04 compatibility</Label>
                    <p className="text-sm text-muted-foreground">
                      When off, messages are sent with NIP-17 only.
                    </p>
                  </div>
                  <Switch
                    id="nip04-compat"
                    checked={isNip04CompatibilityEnabled}
                    onCheckedChange={(checked) => {
                      const protocolMode: ProtocolMode = checked
                        ? PROTOCOL_MODE.NIP04_OR_NIP17
                        : PROTOCOL_MODE.NIP17_ONLY;
                      void applyMessagingPatch({ protocolMode });
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Relay mode</CardTitle>
                <CardDescription>How message relays are selected.</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={messaging.relayMode ?? RELAY_MODE.HYBRID}
                  onValueChange={(value) => {
                    void applyMessagingPatch({ relayMode: value as RelayMode });
                  }}
                  className="space-y-3"
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <RadioGroupItem value={RELAY_MODE.DISCOVERY} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Discovery only</p>
                      <p className="text-xs text-muted-foreground">
                        Uses discovery relays only. Fastest but may miss some messages.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <RadioGroupItem value={RELAY_MODE.HYBRID} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Hybrid</p>
                      <p className="text-xs text-muted-foreground">
                        Combines discovery relays with user inbox relays.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <RadioGroupItem value={RELAY_MODE.STRICT_OUTBOX} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Strict outbox</p>
                      <p className="text-xs text-muted-foreground">
                        Uses only user-published inbox/outbox relays. Most strict; may miss DMs.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Display & debug</CardTitle>
                <CardDescription>Rendering and developer options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="inline-media">Render inline media</Label>
                    <p className="text-sm text-muted-foreground">
                      Show images and media directly in conversations.
                    </p>
                  </div>
                  <Switch
                    id="inline-media"
                    checked={messaging.renderInlineMedia ?? true}
                    onCheckedChange={(checked) => {
                      void applyMessagingPatch({ renderInlineMedia: checked });
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="messaging-dev-mode">Developer mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Show additional debugging details in DM UI.
                    </p>
                  </div>
                  <Switch
                    id="messaging-dev-mode"
                    checked={messaging.devMode ?? false}
                    onCheckedChange={(checked) => {
                      void applyMessagingPatch({ devMode: checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status & cache</CardTitle>
                <CardDescription>Connection state and cache controls.</CardDescription>
              </CardHeader>
              <CardContent>
                <DMStatusInfo clearCacheAndRefetch={clearCacheAndRefetch} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

export default MessagingSettingsPage;
